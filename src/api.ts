import type {
  Application,
  ApplicationDetail,
  ApplicationFilters,
  ApplicationRow,
  ApprovalConditions,
  AuditLog,
  ChannelSubmission,
  CheckItem,
  Evidence,
  EvidenceSnapshot,
  ExternalText,
  Merchant,
  MetricData,
  MutationAction,
  Notification,
  NoticePreview,
  OrderDetail,
  Person,
  QueueData,
  QueueFilters,
  QueueRow,
  QueueView,
  Role,
  SearchResult,
  Session,
  Status,
  Store,
  SupplementItem,
  UploadedFile,
  User,
  UserRef,
  WorkOrder,
} from "./types";
import {
  USERS,
  OPS_ROLES,
  COMPLIANCE_ROLES,
  MENUS,
  QUEUE_TABS,
  orderPath,
} from "./access";
import {
  CHECK_OPTIONS,
  DECLINE_CONCLUSIONS,
  SUPPLEMENT_CONCLUSIONS,
  REASONS,
  reasonName,
} from "./catalog";
import { createSeed } from "./seed";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 422,
    public currentVersion?: number,
    public currentOwner?: UserRef,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
const KEY = "intake-workbench-v06";
const DAY = 86400000;
const HOUR = 3600000;
const SYSTEM: UserRef = { id: "system", name: "自动调度" };
const CLOSED: Status[] = ["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"];
let memory: Store | undefined;
const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const uid = (s: Store, prefix: string) => `${prefix}-${++s.nextId}`;
const isOps = (r: Role) => OPS_ROLES.includes(r);
const isCompliance = (r: Role) => COMPLIANCE_ROLES.includes(r);
const isSenior = (r: Role) =>
  r === "COMPLIANCE_SENIOR" || r === "COMPLIANCE_HEAD";
const canEvidence = (r: Role) => isCompliance(r) || r === "APPROVER";
function pick<T extends object>(value: T, keys: readonly string[]): T {
  const result: Record<string, unknown> = {};
  for (const key of keys)
    if (key in value && (value as Record<string, unknown>)[key] !== undefined)
      result[key] = clone((value as Record<string, unknown>)[key]);
  return result as T;
}
function fail(message: string, status = 422): never {
  throw new ApiError(message, status);
}
function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) fail(`请填写${label}`);
}
function roles(session: Session, allowed: readonly Role[]) {
  if (!allowed.includes(session.role)) fail("当前角色没有此操作权限。", 403);
}
function user(session: Session): User {
  const u = USERS.find((v) => v.id === session?.userId);
  if (
    !u ||
    !u.roles.includes(session?.role) ||
    (u.roles.some(isOps) && u.roles.some(isCompliance))
  )
    fail("会话角色无效。", 403);
  return u;
}
function internal(session: Session) {
  const u = user(session);
  if (session.role === "MERCHANT") fail("商户不能访问后台。", 403);
  return u;
}
function ref(u: User): UserRef {
  return pick(u, ["id", "name", "account", "team"]);
}
function application(s: Store, id: string) {
  const a = s.applications.find((v) => v.id === id);
  if (!a) fail("申请不存在。", 404);
  return a;
}
function merchant(s: Store, a: Application) {
  const m = s.merchants.find((v) => v.id === a.merchantId);
  if (!m) fail("商户不存在。", 404);
  return m;
}
function order(s: Store, id: string, session?: Session) {
  if (session?.role === "MERCHANT" && id.startsWith("WO-"))
    fail("商户不能访问后台工单。", 403);
  const w =
    session?.role === "MERCHANT"
      ? s.orders.find((v) => v.type === "SUPPLEMENT" && v.merchantToken === id)
      : s.orders.find((v) => v.id === id);
  if (!w) fail("工单不存在或链接无效。", 404);
  return w;
}
function stale(w: { version: number; assignee?: UserRef }, version: number) {
  if (version !== w.version)
    throw new ApiError(
      "工单已更新，请刷新后重试。",
      409,
      w.version,
      w.assignee && clone(w.assignee),
    );
}
function state(w: WorkOrder, type: WorkOrder["type"], statuses: Status[]) {
  if (w.type !== type) fail("此工单不支持该操作。", 403);
  if (!statuses.includes(w.status)) fail("当前工单状态不允许此操作。", 409);
}
function duty(s: Store, w: WorkOrder, session: Session, second = false) {
  const a = application(s, w.applicationId);
  if (a.submittedBy?.id === session.userId)
    fail("代商户提交申请的人不能处理或审批该申请。", 403);
  if (
    second &&
    orderChecks(s, w).some((c) => c.decidedBy?.id === session.userId)
  )
    fail("不能复核自己的检查项结论。", 403);
}
function owner(w: WorkOrder, session: Session, allowed: Role[]) {
  roles(session, allowed);
  if (w.assignee?.id !== session.userId)
    fail("请先领取；仅当前处理人可操作。", 403);
}
function restrictedEvidence(s: Store, id: string) {
  return s.orders.some(
    (w) =>
      w.type === "RESTRICTED" &&
      w.checkItems?.some((c) => c.evidenceIds.includes(id)),
  );
}
function locked(s: Store, appId: string) {
  return s.orders.some(
    (w) =>
      w.applicationId === appId &&
      w.type === "RESTRICTED" &&
      !w.restrictedResolved,
  );
}
function authRead(w: WorkOrder, session: Session) {
  user(session);
  if (session.role === "MERCHANT") {
    if (w.type !== "SUPPLEMENT") fail("无权访问此工单。", 403);
    return;
  }
  if (!readable(w, session))
    fail(
      w.type === "REVIEW" ? "无权访问审核工作台。" : "无权访问此工单。",
      403,
    );
}
function persist(s: Store) {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(KEY, JSON.stringify(s));
  memory = s;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("workbench:updated"));
}
function rawStore(): Store {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved.schema !== 6) fail("本地数据版本不兼容，请重置。", 500);
        memory = saved;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        fail("本地数据无法读取，请重置。", 500);
      }
    }
  }
  if (!memory) memory = createSeed();
  return clone(memory);
}
function transition(w: WorkOrder, status: Status) {
  w.status = status;
  w.enteredStatusAt = now();
}
function pause(w: WorkOrder) {
  if (!w.slaPaused)
    w.slaRemainingMs = Math.max(0, Date.parse(w.slaDueAt) - Date.now());
  w.slaPaused = true;
}
function resume(w: WorkOrder) {
  if (w.slaPaused)
    w.slaDueAt = new Date(
      Date.now() + (w.slaRemainingMs ?? 2 * DAY),
    ).toISOString();
  w.slaPaused = false;
  delete w.slaRemainingMs;
}
function qaSnapshot(s: Store, w: WorkOrder): EvidenceSnapshot {
  const snap = s.snapshots[s.qa[w.id]?.snapshotId];
  if (!snap) fail("抽检证据快照不存在。", 409);
  return snap;
}
function orderChecks(s: Store, w: WorkOrder): CheckItem[] {
  return w.type === "QA" ? qaSnapshot(s, w).checkItems : w.checkItems || [];
}
function orderEvidence(s: Store, w: WorkOrder): Evidence[] {
  return w.type === "QA" ? qaSnapshot(s, w).evidence : s.evidence;
}

function snapshot(s: Store, w: WorkOrder): string {
  const id = uid(s, "SNAP");
  const ids = new Set((w.checkItems || []).flatMap((c) => c.evidenceIds));
  s.snapshots[id] = {
    id,
    at: now(),
    workOrderId: w.id,
    checkItems: clone(orderChecks(s, w)),
    evidence: clone(
      w.type === "QA"
        ? qaSnapshot(s, w).evidence
        : s.evidence.filter((e) => ids.has(e.id)),
    ),
  };
  return id;
}
function audit(
  s: Store,
  w: WorkOrder,
  actor: UserRef,
  action: string,
  before: unknown,
  note?: string,
) {
  const snapshotId = snapshot(s, w);
  s.audit.push({
    id: uid(s, "AUD"),
    objectId: w.id,
    actor: clone(actor),
    action,
    before: clone(before),
    after: clone(w),
    snapshotId,
    at: now(),
    ...(note ? { note } : {}),
    visibility:
      w.type === "SUPPLEMENT" || w.type === "CHANNEL" ? "OPS" : "COMPLIANCE",
  });
  return snapshotId;
}
function changed(
  s: Store,
  w: WorkOrder,
  actor: UserRef,
  action: string,
  before: WorkOrder,
  note?: string,
) {
  w.version++;
  audit(s, w, actor, action, before, note);
}
function notify(
  s: Store,
  userId: string,
  w: WorkOrder,
  title: string,
  type: Notification["type"],
) {
  s.notifications.push({
    id: uid(s, "NTF"),
    userId,
    workOrderId: w.id,
    title,
    at: now(),
    type,
    read: false,
  });
}
function makeOrder(
  s: Store,
  a: Application,
  type: WorkOrder["type"],
  parentId?: string,
): WorkOrder {
  const at = now();
  const w: WorkOrder = {
    id: uid(s, "WO"),
    applicationId: a.id,
    type,
    stage: type === "CHANNEL" ? "CHANNEL" : "FORM_SUBMITTED",
    status: type === "SUPPLEMENT" ? "TO_SEND" : "QUEUED",
    queue: type,
    version: 1,
    slaDueAt: new Date(
      Date.now() +
        (type === "SUPPLEMENT" ? 4 * HOUR : type === "QA" ? 5 * DAY : 2 * DAY),
    ).toISOString(),
    slaPaused: false,
    enteredStatusAt: at,
    createdAt: at,
    ...(parentId ? { parentId } : {}),
  };
  s.orders.push(w);
  return w;
}
function finish(s: Store, w: WorkOrder, outcome: string) {
  transition(w, "CLOSED");
  w.closedAt = now();
  w.outcome = outcome;
  resume(w);
  if (w.type === "QA") return;
  const a = application(s, w.applicationId);
  a.decision = outcome;
  a.status = "CLOSED";
  a.externalStatus = outcome.startsWith("APPROVED") ? "已通过" : "未通过";
  if (outcome.startsWith("APPROVED")) {
    a.status = "WAITING_CHANNEL";
    a.stage = "CHANNEL";
    a.stageTimes.CHANNEL = now();
    if (
      !s.submissions.some(
        (c) =>
          c.applicationId === a.id &&
          !["TERMINATED", "AVAILABLE"].includes(c.status),
      )
    )
      s.submissions.push({
        id: uid(s, "SUB"),
        applicationId: a.id,
        channelId: "CH-ADYEN",
        channelName: "Adyen",
        submissionNo: uid(s, "ADY"),
        status: "SUBMITTED",
        submittedAt: now(),
        upstreamReasonRaw: "",
        requiredDocuments: [],
        documents: [],
      });
  }
  if (outcome === "DECLINED") {
    const codes = w.reasonCodes || [];
    const categories = codes
      .map((c) => REASONS[c]?.externalCategory)
      .filter(Boolean);
    if (!categories.includes("不披露") && !locked(s, a.id))
      a.externalCategory =
        categories.find((c) => c !== "补件项" && c !== "—") || "综合评估";
    else delete a.externalCategory;
    if (w.checkItems?.some((c) => c.conclusion === "FRAUD_DECLINE"))
      merchant(s, a).blacklisted = true;
  }
  a.version++;
  for (const channel of s.orders.filter(
    (c) =>
      c.id === w.parentId &&
      c.applicationId === a.id &&
      c.type === "CHANNEL" &&
      c.status === "WAITING_COMPLIANCE",
  )) {
    const before = clone(channel);
    resume(channel);
    channel.outcome = outcome;
    if (outcome.startsWith("APPROVED")) transition(channel, "IN_PROGRESS");
    else {
      transition(channel, "CLOSED");
      channel.closedAt = now();
    }
    changed(s, channel, SYSTEM, "合规判断完成", before);
  }
}
function closeSupplementParents(
  s: Store,
  w: WorkOrder,
  result: "CLOSED_NO_RESPONSE" | "WITHDRAWN",
) {
  const a = application(s, w.applicationId);
  for (const id of new Set((w.items || []).map((i) => i.sourceWorkOrderId))) {
    const p = s.orders.find((v) => v.id === id);
    if (p && p.status === "WAITING_SUPPLEMENT") {
      const before = clone(p);
      finish(s, p, result);
      changed(s, p, SYSTEM, "补件流程关闭", before);
    }
  }
  a.status = "CLOSED";
  a.decision = result;
  a.externalStatus = "未通过";
  delete a.externalCategory;
  a.version++;
}
function load(): Store {
  const s = rawStore();
  let touched = false;
  for (const submission of s.submissions.filter((c) => !c.mappedReasonCode)) {
    const mapping = s.channelMappings.find(
      (m) =>
        m.channelId === submission.channelId &&
        m.upstreamCode === (submission.upstreamCode || "") &&
        (!m.upstreamCode ? m.rawReason === submission.upstreamReasonRaw : true),
    );
    if (!mapping) continue;
    submission.mappedReasonCode = mapping.reasonCode;
    submission.isRiskType = mapping.isRiskType;
    touched = true;
    const w = s.orders.find((w) => w.channelSubmissionId === submission.id);
    if (w) {
      const before = clone(w);
      delete w.mappingRequestedAt;
      changed(s, w, SYSTEM, "应用渠道原因映射", before);
    }
  }
  for (const w of s.orders.filter(
    (v) => v.type === "SUPPLEMENT" && v.status === "WAITING_MERCHANT",
  )) {
    const sent = Date.parse(w.sentAt || w.createdAt);
    for (const day of [1, 3, 6]) {
      const action = `自动提醒：第${day}天`;
      if (
        Date.now() >= sent + day * DAY &&
        !s.audit.some((a) => a.objectId === w.id && a.action === action)
      ) {
        const before = clone(w);
        w.remindersSent = (w.remindersSent || 0) + 1;
        (w.contactLog ||= []).push({
          id: uid(s, "CONTACT"),
          at: new Date(sent + day * DAY).toISOString(),
          channel: "PORTAL",
          summary: "请于截止日期前补充清单中的资料。",
          by: SYSTEM,
        });
        changed(s, w, SYSTEM, action, before);
        touched = true;
      }
    }
    if (w.dueAt && Date.now() >= Date.parse(w.dueAt)) {
      const before = clone(w);
      transition(w, "CLOSED_NO_RESPONSE");
      w.closedAt = now();
      w.outcome = "CLOSED_NO_RESPONSE";
      resume(w);
      closeSupplementParents(s, w, "CLOSED_NO_RESPONSE");
      changed(s, w, SYSTEM, "补件超时关闭", before);
      touched = true;
    }
  }
  const urgent = new Map<string, number>();
  for (const w of s.orders) {
    if (
      !w.assignee ||
      w.slaPaused ||
      Date.parse(w.slaDueAt) - Date.now() > HOUR
    )
      continue;
    const u = USERS.find((candidate) => candidate.id === w.assignee?.id);
    if (u?.roles.some((role) => actionable(s, w, { ...u, userId: u.id, role })))
      urgent.set(u.id, (urgent.get(u.id) || 0) + 1);
  }
  const obsolete = s.notifications.filter(
    (n) => n.type === "SLA" && !urgent.has(n.userId),
  );
  if (obsolete.length) {
    s.notifications = s.notifications.filter((n) => !obsolete.includes(n));
    touched = true;
  }
  for (const [userId, count] of urgent) {
    const existing = s.notifications.find(
      (n) => n.userId === userId && n.type === "SLA",
    );
    if (existing?.count === count) continue;
    const title = `${count} 张待处理工单即将或已经超时，请及时处理`;
    if (existing) {
      Object.assign(existing, { count, title, at: now(), read: false });
      delete existing.workOrderId;
    } else {
      s.notifications.push({
        id: uid(s, "NTF"),
        userId,
        title,
        count,
        at: now(),
        read: false,
        type: "SLA",
      });
    }
    touched = true;
  }
  if (touched) persist(s);
  return s;
}
const SAFE_APP = [
  "id",
  "merchantId",
  "stage",
  "externalStatus",
  "isKeyMerchant",
  "salesOwner",
  "createdAt",
  "version",
  "communicationLanguage",
  "stageTimes",
];
function projectApp(
  s: Store,
  a: Application,
  session: Session,
  blind = false,
): Application {
  const result = pick(a, SAFE_APP);
  const active = s.orders.find(
    (w) =>
      w.applicationId === a.id &&
      !CLOSED.includes(w.status) &&
      (a.stage === "APPROVAL"
        ? w.type === "REVIEW" && w.status === "PENDING_APPROVAL"
        : a.stage === "MANUAL_REVIEW"
          ? w.type === "REVIEW"
          : a.stage === "CHANNEL"
            ? w.type === "CHANNEL"
            : false),
  );
  result.status =
    isOps(session.role) || ["SALES", "MERCHANT"].includes(session.role)
      ? a.externalStatus
      : locked(s, a.id) && session.role !== "COMPLIANCE_HEAD"
        ? session.role === "APPROVER"
          ? "IN_PROGRESS"
          : "COMPLIANCE_HOLD"
        : active?.status || a.status;
  if (
    canEvidence(session.role) &&
    !blind &&
    (!locked(s, a.id) || session.role === "COMPLIANCE_HEAD")
  )
    Object.assign(
      result,
      pick(a, ["decision", "autoDecision", "lastRerun", "submittedBy"]),
    );
  if (a.externalCategory && a.externalCategory !== "不披露" && !locked(s, a.id))
    result.externalCategory = a.externalCategory;
  if (blind) {
    result.status = "BLIND";
    result.stage = "MANUAL_REVIEW";
    result.externalStatus = "审核中";
    result.stageTimes = {};
    delete result.externalCategory;
  }
  return result;
}
function projectMerchant(
  m: Merchant,
  session: Session,
  list = false,
): Merchant {
  const keys = [
    "id",
    "legalName",
    "displayName",
    "country",
    "registrationNo",
    "registrationAuthority",
  ];
  if (!list || isCompliance(session.role)) keys.push("declaredMcc");
  if (!list || session.role === "APPROVER") keys.push("expectedMonthlyVolume");
  if (!list) keys.push("website", "businessModel", "conditions");
  if (!list && (isOps(session.role) || session.role === "SALES"))
    keys.push("contacts");
  if (!list && canEvidence(session.role))
    keys.push("averageTransaction", "mccRisk", "countryRisk", "isNewEntity");
  if (session.role === "COMPLIANCE_HEAD" && !list) keys.push("blacklisted");
  return pick(m, keys);
}
function projectPerson(p: Person, session: Session) {
  return pick(
    p,
    canEvidence(session.role)
      ? [
          "id",
          "merchantId",
          "name",
          "role",
          "ownershipPct",
          "declared",
          "kycStatus",
          "needsReverify",
        ]
      : ["id", "merchantId", "name", "role", "needsReverify"],
  );
}
function projectItem(i: SupplementItem, session: Session): SupplementItem {
  const keys = [
    "id",
    "source",
    "externalText",
    "actionType",
    "status",
    "rejectReason",
    "field",
    "response",
    "files",
    "checked",
    "checkedAt",
    "targetPersonId",
  ];
  if (session.role !== "MERCHANT") keys.push("sourceWorkOrderId", "checkedBy");
  if (isCompliance(session.role)) keys.push("reasonCode", "checkItemId");
  return pick(i, keys);
}
const ORDER_BASE = [
  "id",
  "type",
  "applicationId",
  "stage",
  "status",
  "queue",
  "assignee",
  "slaDueAt",
  "slaPaused",
  "enteredStatusAt",
  "version",
  "createdAt",
  "closedAt",
  "firstResponderAt",
];
function projectOrder(s: Store, w: WorkOrder, session: Session): WorkOrder {
  const r = pick(w, ORDER_BASE);
  if (session.role === "MERCHANT")
    return pick(
      {
        ...r,
        items: (w.items || [])
          .filter((i) => !i.checked || w.status === "DONE")
          .map((i) => projectItem(i, session)),
        dueAt: w.dueAt,
      },
      [
        "id",
        "type",
        "applicationId",
        "status",
        "version",
        "items",
        "dueAt",
        "createdAt",
        "slaDueAt",
        "slaPaused",
        "stage",
        "queue",
        "enteredStatusAt",
      ],
    );
  if (w.type === "SUPPLEMENT") {
    Object.assign(
      r,
      pick(w, [
        "dueAt",
        "extensions",
        "remindersSent",
        "sentAt",
        "noteToOps",
        "contactLog",
        "opsNote",
      ]),
    );
    r.items = (w.items || []).map((i) => projectItem(i, session));
    if (isOps(session.role)) r.merchantToken = w.merchantToken;
    return r;
  }
  if (w.type === "CHANNEL") {
    Object.assign(
      r,
      pick(w, [
        "channelSubmissionId",
        "opsNote",
        "mappingRequestedAt",
        "triggerReceiptType",
      ]),
    );
    return r;
  }
  Object.assign(
    r,
    pick(w, [
      "priority",
      "originalAssignee",
      "submittedBy",
      "ruleVersion",
      "approvalReasons",
      "hasNewEvidence",
      "lateHardReject",
      "hardRejectDismissed",
      "missingEvidence",
      "approvalActorIds",
      "requiresDual",
      "overrideAutoReject",
    ]),
  );
  const blind = w.type === "QA" && ["QUEUED", "BLIND"].includes(w.status);
  if (!blind)
    Object.assign(r, pick(w, ["outcome", "pendingDecision", "complianceNote"]));
  r.checkItems = orderChecks(s, w).flatMap((c) => {
    if (
      session.role !== "COMPLIANCE_HEAD" &&
      c.evidenceIds.some((id) => restrictedEvidence(s, id))
    )
      return w.restrictedResolved
        ? [
            {
              id: c.id,
              checkType: c.checkType,
              title: "受限已排除",
              reasonCodes: [],
              evidenceIds: [],
              status: "AUTO_CLOSED" as const,
              conclusion: "RESTRICTED_EXCLUDED",
              conclusionReason: "受限已排除",
              hasNewEvidence: false,
            },
          ]
        : [];
    return [
      blind
        ? pick(c, [
            "id",
            "checkType",
            "title",
            "reasonCodes",
            "evidenceIds",
            "hasNewEvidence",
            "status",
          ])
        : clone(c),
    ];
  });
  if (blind)
    r.checkItems.forEach((c) => {
      c.status = "PENDING";
    });
  if (blind) {
    for (const key of [
      "originalAssignee",
      "submittedBy",
      "approvalReasons",
      "approvalActorIds",
      "requiresDual",
      "overrideAutoReject",
      "lateHardReject",
      "hardRejectDismissed",
      "missingEvidence",
      "hasNewEvidence",
    ] as const)
      delete r[key];
  }
  r.reasonCodes = [...new Set(r.checkItems.flatMap((c) => c.reasonCodes))];
  if (session.role === "COMPLIANCE_HEAD")
    Object.assign(
      r,
      pick(w, [
        "restrictedType",
        "restrictedReason",
        "restrictedActorIds",
        "restrictedResolved",
        "frozenAt",
        "caseId",
        "parentId",
      ]),
    );
  return r;
}
function projectEvidence(
  e: Evidence,
  grant?: { evidenceId: string; mediaId: string },
): Evidence {
  const r = clone(e);
  r.mediaRefs = e.mediaRefs.map((media) =>
    grant?.evidenceId === e.id && grant.mediaId === media.id
      ? clone(media)
      : { id: media.id, label: media.label },
  );
  return r;
}
function projectChannel(
  c: ChannelSubmission,
  session: Session,
): ChannelSubmission {
  const r = pick(c, [
    "id",
    "applicationId",
    "channelId",
    "channelName",
    "submissionNo",
    "status",
    "submittedAt",
    "receiptAt",
    "receiptType",
    "upstreamCode",
    "upstreamReasonRaw",
    "requiredDocuments",
    "documents",
    "lastReminderAt",
    "isRiskType",
  ]);
  if (canEvidence(session.role) || c.mappedReasonCode?.startsWith("CH-"))
    r.mappedReasonCode = c.mappedReasonCode;
  return r;
}
function projectAudit(s: Store, w: WorkOrder, session: Session): AuditLog[] {
  if (
    ["APPROVER", "SALES", "MERCHANT"].includes(session.role) ||
    (w.type === "QA" && ["QUEUED", "BLIND"].includes(w.status))
  )
    return [];
  return s.audit
    .filter(
      (a) =>
        a.objectId === w.id &&
        (!isOps(session.role) ||
          a.visibility === "OPS" ||
          a.visibility === "ALL"),
    )
    .map((a) => {
      const safe = pick(a, [
        "id",
        "objectId",
        "actor",
        "action",
        "snapshotId",
        "at",
        "visibility",
      ]);
      const values = (v: unknown) =>
        v && typeof v === "object"
          ? pick(v, [
              "status",
              "version",
              "assignee",
              "dueAt",
              "remindersSent",
              "sentAt",
              "closedAt",
            ])
          : null;
      safe.before = values(a.before);
      safe.after = values(a.after);
      if (
        canEvidence(session.role) &&
        (session.role === "COMPLIANCE_HEAD" || !locked(s, w.applicationId))
      )
        safe.note = a.note;
      return safe;
    });
}
function detail(
  s: Store,
  w: WorkOrder,
  session: Session,
  grant?: { evidenceId: string; mediaId: string },
): OrderDetail {
  authRead(w, session);
  const a = application(s, w.applicationId),
    m = merchant(s, a);
  const blind = w.type === "QA" && ["QUEUED", "BLIND"].includes(w.status);
  const result: OrderDetail = {
    workOrder: projectOrder(s, w, session),
    merchant: projectMerchant(m, session),
    application: projectApp(s, a, session, blind),
  };
  if (blind)
    result.merchant = pick(result.merchant, [
      "id",
      "legalName",
      "displayName",
      "registrationNo",
      "registrationAuthority",
      "country",
      "declaredMcc",
      "expectedMonthlyVolume",
      "website",
      "businessModel",
    ]);
  if (session.role === "MERCHANT") {
    result.merchant = pick(m, ["id", "legalName", "displayName", "country"]);
    result.application = pick(result.application, [
      "id",
      "merchantId",
      "externalStatus",
      "createdAt",
      "version",
      "communicationLanguage",
    ]);
    return result;
  }
  result.people = s.people
    .filter((p) => p.merchantId === m.id)
    .map((p) => projectPerson(p, session));
  if (canEvidence(session.role))
    result.evidence = orderEvidence(s, w)
      .filter((e) =>
        w.type === "QA"
          ? session.role === "COMPLIANCE_HEAD" || !restrictedEvidence(s, e.id)
          : result.workOrder.checkItems?.some((c) =>
              c.evidenceIds.includes(e.id),
            ),
      )
      .map((e) => projectEvidence(e, grant));
  if (session.role !== "APPROVER") result.audit = projectAudit(s, w, session);
  if ((isOps(session.role) || isCompliance(session.role)) && !blind)
    result.supplements = s.orders
      .filter((v) => v.applicationId === a.id && v.type === "SUPPLEMENT")
      .map((v) => projectOrder(s, v, session));
  if (w.type === "CHANNEL") {
    const c = s.submissions.find((v) => v.id === w.channelSubmissionId);
    if (c) {
      result.channel = projectChannel(c, session);
      result.channel.receiptType ||= w.triggerReceiptType;
    }
    result.otherChannels = s.submissions
      .filter(
        (v) =>
          v.applicationId === a.id &&
          v.id !== c?.id &&
          v.status === "AVAILABLE",
      )
      .map((v) => projectChannel(v, session));
  }
  if (w.type === "QA" && s.qa[w.id])
    result.qa = pick(
      s.qa[w.id],
      blind
        ? ["id", "sampledAt", "batchId", "reviewMode", "blindConclusions"]
        : [
            "id",
            "sampledObjectId",
            "sampledAt",
            "batchId",
            "snapshotId",
            "reviewMode",
            "blindConclusions",
            "originalConclusions",
            "consistent",
            "mismatchReason",
            "correctiveActions",
            "generatedIds",
          ],
    );
  if (
    result.qa?.originalConclusions &&
    result.qa.reviewMode === "CHECK_ITEMS"
  ) {
    const visibleIds = new Set(result.workOrder.checkItems?.map((c) => c.id));
    result.qa.originalConclusions = Object.fromEntries(
      Object.entries(result.qa.originalConclusions).filter(([id]) =>
        visibleIds.has(id),
      ),
    );
  }
  if (canEvidence(session.role) && !blind)
    result.approvalDecisions = clone(
      s.approvalDecisions.filter((v) => v.workOrderId === w.id),
    );
  if (session.role === "COMPLIANCE_HEAD")
    result.restrictedDecisions = clone(
      s.restrictedDecisions.filter((v) => v.workOrderId === w.id),
    );
  else if (canEvidence(session.role) && locked(s, a.id))
    result.restrictedLocked = true;
  return result;
}
function applicationDetail(
  s: Store,
  id: string,
  session: Session,
): ApplicationDetail {
  internal(session);
  const a = application(s, id),
    m = merchant(s, a);
  const result: ApplicationDetail = {
    application: projectApp(s, a, session),
    merchant: projectMerchant(m, session),
  };
  if (session.role === "SALES") {
    result.supplements = s.orders
      .filter((w) => w.applicationId === id && w.type === "SUPPLEMENT")
      .map((w) =>
        pick(
          {
            ...w,
            items: (w.items || []).map((i) =>
              pick(i, ["id", "externalText", "actionType", "status"]),
            ),
          },
          ["id", "type", "status", "dueAt", "items"],
        ),
      );
    return result;
  }
  result.people = s.people
    .filter((p) => p.merchantId === m.id)
    .map((p) => projectPerson(p, session));
  const visible = s.orders.filter(
    (w) =>
      w.applicationId === id &&
      (isOps(session.role)
        ? ["SUPPLEMENT", "CHANNEL"].includes(w.type)
        : w.type === "RESTRICTED"
          ? session.role === "COMPLIANCE_HEAD"
          : w.type === "QA"
            ? isSenior(session.role)
            : session.role === "APPROVER"
              ? w.type === "REVIEW"
              : true),
  );
  if (session.role === "APPROVER")
    Object.assign(result, {
      submittedMaterials: clone(
        s.orders
          .filter((w) => w.applicationId === id && w.type === "SUPPLEMENT")
          .flatMap((w) =>
            (w.items || [])
              .filter((i) => i.status === "PROVIDED")
              .flatMap((i) => i.files || []),
          ),
      ),
    });
  result.workOrders = visible.map((w) => projectOrder(s, w, session));
  if (isOps(session.role) || isCompliance(session.role)) {
    result.supplements = visible
      .filter((w) => w.type === "SUPPLEMENT")
      .map((w) => projectOrder(s, w, session));
    result.channels = s.submissions
      .filter((c) => c.applicationId === id)
      .map((c) => projectChannel(c, session));
    result.contactLog = visible
      .filter((w) => w.type === "SUPPLEMENT")
      .flatMap((w) => clone(w.contactLog || []));
    result.audit = visible.flatMap((w) => projectAudit(s, w, session));
  }
  if (canEvidence(session.role)) {
    const permitted = (ids: string[]) =>
      session.role === "COMPLIANCE_HEAD" ||
      !ids.some((e) => restrictedEvidence(s, e));
    if (!locked(s, id) || session.role === "COMPLIANCE_HEAD") {
      result.events = clone(
        s.events.filter(
          (e) => e.applicationId === id && permitted(e.evidenceIds),
        ),
      );
      result.triage = clone(s.triage.filter((t) => t.applicationId === id));
    }
    result.approvalDecisions = clone(
      s.approvalDecisions.filter((d) =>
        visible.some((w) => w.id === d.workOrderId),
      ),
    );
    if (locked(s, id) && session.role !== "COMPLIANCE_HEAD")
      result.restrictedLocked = true;
  }
  return result;
}

function queueRow(
  s: Store,
  w: WorkOrder,
  session: Session,
  view: QueueView,
  tab: string,
): QueueRow {
  const a = application(s, w.applicationId),
    m = merchant(s, a);
  const r: QueueRow = {
    id: w.id,
    type: w.type,
    applicationId: a.id,
    status: w.status,
    version: w.version,
    merchantName: m.legalName,
    displayName: m.displayName,
    country: m.country,
    isKeyMerchant: a.isKeyMerchant,
    createdAt: w.createdAt,
    enteredStatusAt: w.enteredStatusAt,
    assignee: w.assignee && clone(w.assignee),
    slaDueAt: w.slaDueAt,
    slaPaused: w.slaPaused,
  };
  if (view === "review") {
    r.declaredMcc = m.declaredMcc;
    const visibleChecks = projectOrder(s, w, session).checkItems || [];
    r.pendingCheckCount = visibleChecks.filter(
      (c) => c.status === "PENDING",
    ).length;
    if (isCompliance(session.role))
      r.checkItems = visibleChecks.map((c) =>
        pick(c, ["id", "title", "status"]),
      );
    const safe = projectOrder(s, w, session);
    r.reasonCodes = safe.reasonCodes;
    r.reasonName = safe.reasonCodes?.map(reasonName).join("、");
    r.priority = w.priority;
    r.hasNewEvidence = w.hasNewEvidence;
    if (tab === "supplement") {
      const sup = s.orders.find(
        (v) =>
          v.type === "SUPPLEMENT" &&
          v.applicationId === a.id &&
          !CLOSED.includes(v.status),
      );
      r.supplementStatus = sup?.status;
      r.dueAt = sup?.dueAt;
    }
  } else if (view === "approval") {
    r.expectedMonthlyVolume = clone(m.expectedMonthlyVolume);
    r.approvalReasonNames = w.approvalReasons?.map(reasonName);
    r.mccRisk = m.mccRisk;
    r.countryRisk = m.countryRisk;
    r.submittedBy = clone(w.originalAssignee || w.assignee);
    r.waitingMs = Date.now() - Date.parse(w.enteredStatusAt);
    r.reviewProgress = `${w.approvalActorIds?.length || 0}/${w.requiresDual || w.approvalReasons?.includes("INT-PEP") ? 2 : 1}`;
  } else if (view === "qa") {
    const q = s.qa[w.id];
    r.batchId = q?.batchId;
    r.sampledAt = q?.sampledAt;
    if (tab === "review") {
      r.submittedBy = w.submittedBy;
      r.waitingMs = Date.now() - Date.parse(w.enteredStatusAt);
      r.reviewProgress = `${w.approvalActorIds?.length || 0}/2`;
    }
  } else if (view === "restricted") {
    r.restrictedType = w.restrictedType;
    r.submittedBy = w.originalAssignee;
    r.frozenAt = w.frozenAt || w.createdAt;
    r.reviewProgress = `${w.restrictedActorIds?.length || 0}/2`;
  } else if (view === "channel") {
    const c = s.submissions.find((v) => v.id === w.channelSubmissionId);
    if (c) {
      r.channelId = c.channelId;
      r.channelName = c.channelName;
      r.submissionNo = c.submissionNo;
      r.receiptType = c.receiptType || w.triggerReceiptType;
      r.upstreamCode = c.upstreamCode;
      r.upstreamReasonRaw = c.upstreamReasonRaw;
      r.mappedReasonName = c.mappedReasonCode
        ? canEvidence(session.role) || c.mappedReasonCode.startsWith("CH-")
          ? reasonName(c.mappedReasonCode)
          : "已映射"
        : "未映射";
    }
  } else if (view === "extensions") {
    r.extension = clone(w.extensions?.find((e) => e.status === "PENDING"));
    r.assignee = r.extension?.assignedTo;
    r.extensionCount =
      w.extensions?.filter((e) => e.status === "APPROVED").length || 0;
  } else {
    if (view !== "team") {
      r.contact = clone(m.contacts?.[0]);
      r.supplementCount = w.items?.length || 0;
      r.supplementText = w.items?.map((i) => i.externalText.zh).join("；");
    }
    r.supplementSource = [...new Set(w.items?.map((i) => i.source) || [])].join(
      " / ",
    );
    r.dueAt = w.dueAt;
    if (tab === "waiting") {
      r.remindersSent = w.remindersSent || 0;
      r.recentContact = clone(w.contactLog?.at(-1));
    }
  }
  return r;
}
function inTab(w: WorkOrder, session: Session, view: QueueView, tab: string) {
  if (view === "review")
    return (
      w.type === "REVIEW" &&
      !w.overrideAutoReject &&
      (tab === "screening" ||
        !w.checkItems?.some((c) => c.checkType.startsWith("SCREENING"))) &&
      (tab === "claim"
        ? w.status === "QUEUED" && !w.assignee
        : tab === "mine"
          ? w.status === "IN_PROGRESS" && w.assignee?.id === session.userId
          : tab === "new"
            ? w.status === "IN_PROGRESS" && !!w.hasNewEvidence
            : tab === "screening"
              ? ["QUEUED", "IN_PROGRESS", "WAITING_SUPPLEMENT"].includes(
                  w.status,
                ) &&
                !!w.checkItems?.some((c) => c.checkType.startsWith("SCREENING"))
              : tab === "supplement"
                ? w.status === "WAITING_SUPPLEMENT"
                : false)
    );
  if (view === "ops")
    return (
      w.type === "SUPPLEMENT" &&
      (!w.assignee || w.assignee.id === session.userId) &&
      (tab === "send"
        ? w.status === "TO_SEND"
        : tab === "replied"
          ? w.status === "TO_CHECK"
          : tab === "waiting"
            ? w.status === "WAITING_MERCHANT"
            : false)
    );
  if (view === "team")
    return (
      ["SUPPLEMENT", "CHANNEL"].includes(w.type) && !CLOSED.includes(w.status)
    );
  if (view === "extensions")
    return (
      w.type === "SUPPLEMENT" &&
      !CLOSED.includes(w.status) &&
      !!w.extensions?.some((e) => e.status === "PENDING")
    );
  if (view === "channel")
    return (
      w.type === "CHANNEL" &&
      !CLOSED.includes(w.status) &&
      (tab === "all" ||
        (tab === "mine" && w.assignee?.id === session.userId) ||
        (tab === "waiting" && w.status === "WAITING_CHANNEL"))
    );
  if (view === "restricted")
    return (
      w.type === "RESTRICTED" &&
      !CLOSED.includes(w.status) &&
      (tab === "all" || (tab === "second" && w.status === "PENDING_SECOND"))
    );
  if (view === "approval")
    return (
      w.type === "REVIEW" &&
      w.status === "PENDING_APPROVAL" &&
      !w.overrideAutoReject
    );
  return tab === "review"
    ? w.type === "REVIEW" &&
        !!w.overrideAutoReject &&
        !CLOSED.includes(w.status)
    : w.type === "QA" && !CLOSED.includes(w.status);
}
function neutralText(text: unknown) {
  required(text, "对外文案");
  if (
    /制裁|筛查|可疑|洗钱|\bPEP\b|黑名单|命中|负面新闻|风险评分|不披露|sanction|watchlist|suspici|money.?launder|adverse.media|negative.news|risk.score|\bOFAC\b|\b(?:INT|SCR|AML|KYB|KYC)-/i.test(
      text,
    )
  )
    fail("对外内容只能使用中性资料文案。");
}
function externalText(value: unknown): ExternalText {
  if (!value || typeof value !== "object") fail("请填写中英文对外文案。");
  const text = value as Partial<ExternalText>;
  neutralText(text.zh);
  neutralText(text.en);
  return { zh: text.zh!.trim(), en: text.en!.trim() };
}
function files(value: unknown, actor?: UserRef): UploadedFile[] {
  if (!Array.isArray(value) || !value.length) fail("请上传书面材料。");
  return value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      typeof v.size !== "number" ||
      v.size <= 0 ||
      typeof v.type !== "string" ||
      (!v.content && !v.url)
    )
      fail("上传材料无效。");
    const f = pick(v, [
      "id",
      "name",
      "size",
      "type",
      "uploadedBy",
      "uploadedAt",
      "pages",
      "url",
      "content",
      "digest",
    ]) as UploadedFile;
    if (!f.id) fail("上传材料缺少编号。");
    if (actor) {
      f.uploadedBy = clone(actor);
      f.uploadedAt = now();
    }
    return f;
  });
}
function escalate(s: Store, w: WorkOrder, actor: UserRef, reason: string) {
  const items =
    w.checkItems?.filter((c) => c.checkType.startsWith("SCREENING")) || [];
  if (!items.length && !w.lateHardReject && !w.overrideAutoReject)
    fail("没有可转受限的检查事项。");
  const a = application(s, w.applicationId),
    child = makeOrder(s, a, "RESTRICTED", w.id);
  child.checkItems = clone(items);
  child.reasonCodes = [...new Set(items.flatMap((c) => c.reasonCodes))];
  child.restrictedReason = reason;
  child.restrictedType = w.lateHardReject ? "硬拒例外" : "筛查复核";
  child.frozenAt = now();
  child.originalAssignee = clone(w.assignee);
  child.restrictedActorIds = [];
  pause(w);
  transition(w, "COMPLIANCE_HOLD");
  a.status = "COMPLIANCE_HOLD";
  a.externalStatus = "审核中";
  a.version++;
  audit(s, child, actor, "创建受限工单", null);
  for (const head of USERS.filter((u) => u.roles.includes("COMPLIANCE_HEAD")))
    notify(s, head.id, child, "受限案件待领取", "ASSIGNMENT");
}
function addSupplement(
  s: Store,
  w: WorkOrder,
  payload: Record<string, any>,
  actor: UserRef,
) {
  if (
    w.type === "REVIEW" &&
    w.checkItems?.some(
      (c) =>
        c.checkType.startsWith("SCREENING") &&
        ["TRUE_POSITIVE", "UNCERTAIN"].includes(c.conclusion || ""),
    )
  )
    fail("筛查判断必须转受限，不能以补件替代受限处置。", 409);
  if (!Array.isArray(payload.items) || !payload.items.length)
    fail("至少添加一个补件项。");
  if (payload.noteToOps) neutralText(payload.noteToOps);
  const a = application(s, w.applicationId);
  let sup = s.orders.find(
    (v) =>
      v.applicationId === a.id &&
      v.type === "SUPPLEMENT" &&
      !CLOSED.includes(v.status),
  );
  const before = sup ? clone(sup) : null;
  if (!sup) {
    sup = makeOrder(s, a, "SUPPLEMENT");
    sup.assignee = ref(USERS.find((u) => u.id === "u_2051")!);
    sup.items = [];
    sup.extensions = [];
    sup.contactLog = [];
    sup.remindersSent = 0;
    sup.merchantToken = crypto.randomUUID();
  }
  for (const input of payload.items) {
    const text = externalText(input.externalText);
    if (!["UPLOAD", "REVERIFY", "CONFIRM_FIELD"].includes(input.actionType))
      fail("补件动作无效。");
    const check = input.checkItemId
      ? w.checkItems?.find((c) => c.id === input.checkItemId)
      : undefined;
    if (input.checkItemId && !check) fail("检查项不属于本工单。");
    if (input.actionType === "CONFIRM_FIELD")
      required(input.field, "待确认字段");
    if (
      input.targetPersonId &&
      !s.people.some(
        (p) => p.id === input.targetPersonId && p.merchantId === a.merchantId,
      )
    )
      fail("补件人员不属于此商户。");
    if (
      sup.items?.some(
        (i) =>
          i.sourceWorkOrderId === w.id &&
          input.checkItemId &&
          i.checkItemId === input.checkItemId,
      )
    )
      fail("此检查项已在补件清单中。", 409);
    const code = check?.reasonCodes[0] || input.reasonCode;
    if (code && !REASONS[code]) fail("补件原因无效。");
    sup.items!.push({
      id: uid(s, "SI"),
      sourceWorkOrderId: w.id,
      source: w.type === "CHANNEL" ? "CHANNEL" : "COMPLIANCE",
      ...(code ? { reasonCode: code } : {}),
      ...(check ? { checkItemId: check.id } : {}),
      externalText: text,
      actionType: input.actionType,
      status: "PENDING",
      ...(input.field ? { field: input.field } : {}),
      ...(input.targetPersonId ? { targetPersonId: input.targetPersonId } : {}),
    });
  }
  if (payload.noteToOps) sup.noteToOps = payload.noteToOps.trim();
  if (sup.status === "TO_CHECK") {
    for (const i of sup.items!)
      if (i.status === "PENDING") {
        i.status = "MISSING";
        i.rejectReason = "新增资料待提供";
      }
  }
  if (before) changed(s, sup, actor, "合并补件需求", before);
  else audit(s, sup, actor, "创建补件需求", null);
  w.originalAssignee = clone(w.assignee);
  pause(w);
  transition(w, "WAITING_SUPPLEMENT");
  a.externalStatus = "资料待补充";
  a.status = "WAITING_SUPPLEMENT";
  a.version++;
  if (sup.assignee)
    notify(s, sup.assignee.id, sup, "补件需求已生成，请发送通知", "ASSIGNMENT");
}
function validateConclusion(
  s: Store,
  c: CheckItem,
  p: Record<string, any>,
  session: Session,
) {
  if (c.checkType !== "SCREENING_WATCHLIST") {
    const option = CHECK_OPTIONS[c.checkType].find(
      (o) => o.value === p.conclusion,
    );
    if (!option) fail("该检查项不支持此结论。");
    required(p.conclusionReason, "结论原因");
    if (!option.reasons.includes(p.conclusionReason))
      fail("结论原因不适用于当前结论。");
    if (p.conclusionReason === "其他") required(p.note, "补充说明");
  }
  const evidence = s.evidence.filter((e) => c.evidenceIds.includes(e.id));
  if (c.checkType === "SCREENING_WATCHLIST") {
    const hits = evidence.flatMap((e) => e.fields.hits || []);
    if (!hits.length) fail("没有可判断的筛查证据。");
    const ids = new Set(hits.map((hit) => hit.id));
    if (
      !p.hitConclusions ||
      typeof p.hitConclusions !== "object" ||
      Object.keys(p.hitConclusions).some((id) => !ids.has(id))
    )
      fail("命中处置必须且只能包含本检查项的实际命中。");
    for (const hit of hits) {
      const answer = p.hitConclusions?.[hit.id],
        choice = CHECK_OPTIONS.SCREENING_WATCHLIST.find(
          (o) => o.value === answer?.conclusion,
        );
      if (!choice || !choice.reasons.includes(answer.reason))
        fail("请逐个完成全部命中的结论与原因。");
      if (
        answer.conclusion === "FALSE_POSITIVE" &&
        /strong|high|强/i.test(String(hit.strength)) &&
        !isSenior(session.role)
      )
        fail("强匹配误命中需资深合规判断。", 403);
      if (
        answer.reason === "其他" ||
        (answer.conclusion === "FALSE_POSITIVE" &&
          /strong|high|强/i.test(String(hit.strength)))
      )
        required(answer.note, "该命中的判断说明");
    }
    const answers = hits.map((h) => p.hitConclusions[h.id].conclusion);
    const expected = answers.includes("TRUE_POSITIVE")
      ? "TRUE_POSITIVE"
      : answers.includes("UNCERTAIN")
        ? "UNCERTAIN"
        : "FALSE_POSITIVE";
    p.conclusion = expected;
    p.conclusionReason = [
      ...new Set(hits.map((hit) => p.hitConclusions[hit.id].reason)),
    ].join("；");
    p.hitConclusions = Object.fromEntries(
      hits.map((hit) => [
        hit.id,
        pick(p.hitConclusions[hit.id], ["conclusion", "reason", "note"]),
      ]),
    );
  }
  if (c.checkType === "SCREENING_MEDIA") {
    const articles = evidence.flatMap((e) => e.fields.articles || []);
    for (const article of articles) {
      const answer = p.articles?.[article.id];
      if (!answer || !["RELATED", "UNRELATED"].includes(answer.relevance))
        fail("请标记每篇文章的相关性。");
      if (
        answer.relevance === "UNRELATED" &&
        !["非同一主体", "报道过时", "事件已了结"].includes(answer.reason)
      )
        fail("不相关文章必须说明原因。");
    }
    const related = articles.some(
      (a) => p.articles?.[a.id]?.relevance === "RELATED",
    );
    if (
      (related && p.conclusion === "UNRELATED") ||
      (!related && p.conclusion !== "UNRELATED")
    )
      fail("结论与文章相关性不一致。");
  }
  if (p.conclusion === "CHANGE_MCC") {
    if (typeof p.mcc !== "string" || !/^\d{4}$/.test(p.mcc))
      fail("请选择有效 MCC。");
    required(p.note, "MCC 判断依据");
  }
  if (
    p.conclusion === "RECTIFY" &&
    (!Array.isArray(p.remediationItems) ||
      !p.remediationItems.length ||
      p.remediationItems.some(
        (x: unknown) => typeof x !== "string" || !x.trim(),
      ))
  )
    fail("请选择整改项。");
  if (
    p.conclusion === "TRACED" &&
    (!Array.isArray(p.uboNames) ||
      !p.uboNames.length ||
      p.uboNames.some((x: unknown) => typeof x !== "string" || !x.trim()))
  )
    fail("请录入自然人 UBO 名单。");
  if (c.checkType === "SCHEME_LIST" && p.conclusion === "ACCEPTABLE")
    required(p.note, "对列入原因和时间的判断");
  if (p.conclusion === "MANUAL_PASS") {
    files(p.verificationFiles);
    required(p.note, "人工核验说明");
  }
}
function completeSupplement(s: Store, w: WorkOrder) {
  if (
    !w.items?.length ||
    w.items.some((i) => !i.checked || i.status !== "PROVIDED")
  )
    fail("全部补件项须经运营逐项判定可用后才能完成。");
  transition(w, "DONE");
  w.closedAt = now();
  resume(w);
  const a = application(s, w.applicationId);
  a.lastRerun = [];
  for (const parentId of new Set(w.items.map((i) => i.sourceWorkOrderId))) {
    const p = s.orders.find((v) => v.id === parentId);
    if (p?.type === "QA") {
      a.status = "IN_PROGRESS";
      a.stage = "MANUAL_REVIEW";
      a.externalStatus = "审核中";
      if (
        !s.orders.some(
          (v) =>
            v.applicationId === a.id &&
            v.type === "REVIEW" &&
            !CLOSED.includes(v.status),
        )
      ) {
        const restored = makeOrder(s, a, "REVIEW", p.id);
        restored.checkItems = clone(orderChecks(s, p)).map((c) => ({
          id: uid(s, "CI"),
          checkType: c.checkType,
          title: c.title,
          reasonCodes: clone(c.reasonCodes),
          evidenceIds: clone(c.evidenceIds),
          status: "PENDING",
          hasNewEvidence: true,
        }));
        restored.priority = "NORMAL";
        audit(s, restored, SYSTEM, "商户确认恢复申请", null);
      }
      continue;
    }
    if (!p || p.status !== "WAITING_SUPPLEMENT") continue;
    const before = clone(p);
    resume(p);
    transition(p, "IN_PROGRESS");
    p.assignee = clone(p.originalAssignee || p.assignee);
    for (const item of w.items.filter((i) => i.sourceWorkOrderId === p.id)) {
      const c = p.checkItems?.find((c) => c.id === item.checkItemId);
      if (item.actionType === "REVERIFY" && item.targetPersonId) {
        const person = s.people.find((v) => v.id === item.targetPersonId);
        if (person) {
          person.needsReverify = false;
          person.kycStatus = "VERIFIED";
        }
      }
      if (!c) continue;
      a.lastRerun.push(c.id);
      for (const evidenceId of c.evidenceIds) {
        const e = s.evidence.find((v) => v.id === evidenceId);
        if (!e) continue;
        e.generatedAt = now();
        e.fields.supplementFiles = clone(item.files || []);
        e.fields.supplementResponse = item.response || "";
        if (c.checkType === "DATA_MATCH") {
          e.fields.rows = (e.fields.rows || []).map(
            (row: Record<string, unknown>) => ({
              ...row,
              evidence: row.declared,
              difference: "一致",
              tolerance: "符合",
            }),
          );
        }
        if (c.checkType === "IDENTITY_MEDIA" && item.actionType === "REVERIFY")
          e.fields.checks = (e.fields.checks || []).map(
            (check: Record<string, unknown>) => ({
              ...check,
              passed: true,
              reason: "",
            }),
          );
        if (c.checkType === "ASSOCIATED_PERSONS")
          for (const reported of e.fields.reported || [])
            if (
              !s.people.some(
                (person) =>
                  person.merchantId === a.merchantId &&
                  person.name === reported.name,
              )
            )
              s.people.push({
                id: uid(s, "PERSON"),
                merchantId: a.merchantId,
                name: reported.name,
                role: reported.role || "关联人",
                ownershipPct: reported.ownershipPct,
                declared: true,
                needsReverify: true,
                kycStatus: "PENDING",
              });
      }
      c.hasNewEvidence = true;
      delete c.conclusion;
      delete c.conclusionReason;
      delete c.note;
      delete c.decidedBy;
      delete c.decidedAt;
      delete c.snapshotId;
      if (
        c.checkType === "DATA_MATCH" ||
        (c.checkType === "IDENTITY_MEDIA" && item.actionType === "REVERIFY")
      ) {
        c.status = "AUTO_CLOSED";
        c.conclusion =
          c.checkType === "DATA_MATCH" ? "ACCEPTABLE_DIFF" : "NORMAL";
        c.conclusionReason = "补充材料核验一致";
        c.decidedAt = now();
        c.decidedBy = SYSTEM;
      } else c.status = "PENDING";
    }
    if (p.type === "REVIEW") {
      p.hasNewEvidence = true;
      const remaining = (p.checkItems || []).some(
        (c) =>
          c.status === "PENDING" ||
          SUPPLEMENT_CONCLUSIONS[c.conclusion || ""] ||
          DECLINE_CONCLUSIONS[c.conclusion || ""],
      );
      if (!remaining && !p.approvalReasons?.length && !p.lateHardReject)
        finish(s, p, "APPROVED");
      else {
        a.status = "IN_PROGRESS";
        a.externalStatus = "审核中";
        a.stage = "MANUAL_REVIEW";
      }
    } else {
      a.status = "IN_PROGRESS";
      a.externalStatus = "审核中";
    }
    changed(s, p, SYSTEM, "受影响检查重跑完成", before);
    if (p.assignee)
      notify(
        s,
        p.assignee.id,
        p,
        "新材料已到，请审核更新的检查项",
        "NEW_EVIDENCE",
      );
  }
  a.version++;
}

function readable(w: WorkOrder, session: Session) {
  return w.type === "RESTRICTED"
    ? session.role === "COMPLIANCE_HEAD"
    : w.type === "QA"
      ? isSenior(session.role)
      : w.type === "REVIEW"
        ? canEvidence(session.role)
        : isOps(session.role) || isCompliance(session.role);
}

function actionable(s: Store, w: WorkOrder, session: Session) {
  if (
    !readable(w, session) ||
    CLOSED.includes(w.status) ||
    application(s, w.applicationId).submittedBy?.id === session.userId ||
    (w.assignee && w.assignee.id !== session.userId)
  )
    return false;
  if (
    !w.assignee &&
    ![
      "QUEUED",
      "TO_SEND",
      "TO_CHECK",
      "PENDING_APPROVAL",
      "PENDING_SECOND",
    ].includes(w.status)
  )
    return false;
  if (w.type === "SUPPLEMENT")
    return isOps(session.role) && ["TO_SEND", "TO_CHECK"].includes(w.status);
  if (w.type === "CHANNEL")
    return (
      isOps(session.role) &&
      ["QUEUED", "IN_PROGRESS"].includes(w.status) &&
      !(w.mappingRequestedAt && session.role === "OPS_AGENT")
    );
  if (w.type === "RESTRICTED")
    return (
      session.role === "COMPLIANCE_HEAD" &&
      !w.restrictedActorIds?.includes(session.userId) &&
      ["QUEUED", "IN_PROGRESS", "PENDING_SECOND"].includes(w.status)
    );
  if (w.type === "QA")
    return (
      isSenior(session.role) &&
      !orderChecks(s, w).some((c) => c.decidedBy?.id === session.userId) &&
      ["QUEUED", "BLIND", "COMPARE"].includes(w.status)
    );
  if (w.status === "PENDING_APPROVAL") {
    const u = user(session),
      amount = merchant(s, application(s, w.applicationId))
        .expectedMonthlyVolume.amount;
    const highest = Math.max(
      ...USERS.map((candidate) => candidate.approvalLimit || 0),
    );
    return (
      session.role === "APPROVER" &&
      !w.approvalActorIds?.includes(session.userId) &&
      !w.checkItems?.some((c) => c.decidedBy?.id === session.userId) &&
      (!w.approvalReasons?.includes("INT-PEP") ||
        u.authority === "MANAGEMENT") &&
      !!u.approvalLimit &&
      (amount <= u.approvalLimit ||
        (amount > highest &&
          u.approvalLimit === highest &&
          u.authority === "MANAGEMENT"))
    );
  }
  return (
    isCompliance(session.role) &&
    (!w.overrideAutoReject ||
      (isSenior(session.role) &&
        !w.approvalActorIds?.includes(session.userId))) &&
    ["QUEUED", "IN_PROGRESS"].includes(w.status)
  );
}

function claimOrder(s: Store, w: WorkOrder, session: Session) {
  if (w.assignee)
    throw new ApiError(
      "工单已被领取，请刷新。",
      409,
      w.version,
      clone(w.assignee),
    );
  if (!readable(w, session)) fail("当前角色没有此操作权限。", 403);
  const claimable =
    w.type === "SUPPLEMENT"
      ? ["TO_SEND", "TO_CHECK"].includes(w.status)
      : ["QUEUED", "PENDING_APPROVAL", "PENDING_SECOND"].includes(w.status);
  if (!claimable) fail("当前状态不能领取。", 409);
  if (!actionable(s, w, session)) fail("当前工单不可由你领取。", 403);
  w.assignee = ref(user(session));
  w.firstResponderAt ||= now();
  if (w.status === "QUEUED")
    transition(w, w.type === "QA" ? "BLIND" : "IN_PROGRESS");
  const a = application(s, w.applicationId);
  if (w.type === "REVIEW" && a.stage === "MANUAL_REVIEW") {
    a.status = w.status;
    a.version++;
  }
}

function actionableNotification(
  s: Store,
  n: Notification,
  session: Session,
): boolean {
  if (n.userId !== session.userId) return false;
  if (n.type === "SLA")
    return s.orders.some(
      (w) =>
        w.assignee?.id === session.userId &&
        !w.slaPaused &&
        Date.parse(w.slaDueAt) - Date.now() <= HOUR &&
        actionable(s, w, session),
    );
  const w = s.orders.find((w) => w.id === n.workOrderId);
  if (!w || !readable(w, session)) return false;
  if (n.type === "EXTENSION")
    return (
      session.role === "OPS_LEAD" &&
      w.status === "WAITING_MERCHANT" &&
      !!w.extensions?.some(
        (extension) =>
          extension.status === "PENDING" &&
          extension.requestedBy.id !== session.userId &&
          (!extension.assignedTo || extension.assignedTo.id === session.userId),
      )
    );
  return actionable(s, w, session);
}

function noticePreview(
  s: Store,
  w: WorkOrder,
  payload: { channel: string; recipient?: string },
  session: Session,
): NoticePreview {
  owner(w, session, OPS_ROLES);
  state(w, "SUPPLEMENT", ["TO_SEND", "WAITING_MERCHANT"]);
  duty(s, w, session);
  if (!["EMAIL", "SMS", "PORTAL"].includes(payload.channel))
    fail("通知渠道无效。");
  const a = application(s, w.applicationId);
  const m = merchant(s, a);
  const primaryContact = m.contacts?.[0];
  const recipient =
    payload.recipient ||
    (payload.channel === "SMS"
      ? primaryContact?.phone
      : primaryContact?.email) ||
    "";
  const contact = m.contacts?.find((c) =>
    payload.channel === "EMAIL"
      ? c.email === recipient
      : payload.channel === "SMS"
        ? c.phone === recipient
        : [c.email, c.phone, c.name].includes(recipient),
  );
  if (!contact) fail("只能发送给本商户已登记的联系人。");
  const items = (w.items || []).filter((i) => i.status === "PENDING");
  if (!items.length) fail("没有待发送的补件项。", 409);
  const language = a.communicationLanguage ?? "en";
  const dueAt =
    w.sentAt && w.dueAt
      ? w.dueAt
      : new Date(Date.now() + 7 * DAY).toISOString();
  required(w.merchantToken, "商户安全链接");
  const link = `https://merchant.futurepay.example/supplements/${encodeURIComponent(w.merchantToken)}`;
  const salutation =
    language === "zh" ? `尊敬的 ${contact.name}：` : `Dear ${contact.name},`;
  const lines = items.map((item, i) => {
    const text = item.externalText[language];
    neutralText(text);
    return `${i + 1}. ${text}`;
  });
  return {
    language,
    sender: "FuturePay Onboarding <onboarding@futurepay.example>",
    subject:
      language === "zh"
        ? "FuturePay 申请：请补充资料"
        : "FuturePay application: additional information required",
    salutation,
    link,
    dueAt,
    recipient,
    channel: payload.channel,
    body: [
      salutation,
      language === "zh"
        ? "为继续处理您的申请，请补充以下资料："
        : "To continue processing your application, please provide the following:",
      ...lines,
      language === "zh"
        ? `请在 ${dueAt.slice(0, 10)} 前通过安全链接提交：${link}`
        : `Please submit by ${dueAt.slice(0, 10)} using the secure portal: ${link}`,
    ].join("\n\n"),
    stateChange:
      w.status === "TO_SEND"
        ? "待发送 → 等待商户"
        : "保持等待商户，保留原截止日期",
  };
}

interface UndoScope {
  application: Application;
  merchant: Merchant;
  orders: WorkOrder[];
  people: Person[];
  evidence: Evidence[];
  submissions: ChannelSubmission[];
  approvals: Store["approvalDecisions"];
  restricted: Store["restrictedDecisions"];
}
function undoScope(s: Store, w: WorkOrder): UndoScope {
  const a = application(s, w.applicationId),
    m = merchant(s, a);
  const orders = s.orders.filter((v) => v.applicationId === a.id);
  const evidenceIds = new Set(
    orders.flatMap((v) => v.checkItems?.flatMap((c) => c.evidenceIds) || []),
  );
  return {
    application: a,
    merchant: m,
    orders,
    people: s.people.filter((p) => p.merchantId === m.id),
    evidence: s.evidence.filter((e) => evidenceIds.has(e.id)),
    submissions: s.submissions.filter((c) => c.applicationId === a.id),
    approvals: s.approvalDecisions.filter((d) =>
      orders.some((v) => v.id === d.workOrderId),
    ),
    restricted: s.restrictedDecisions.filter((d) =>
      orders.some((v) => v.id === d.workOrderId),
    ),
  };
}
type UndoEntry = {
  userId: string;
  role: Role;
  orderId: string;
  expires: number;
  before: UndoScope;
  after: string;
};
const undoTokens = new Map<string, UndoEntry>();
function rememberUndo(
  s: Store,
  w: WorkOrder,
  session: Session,
  before: UndoScope,
) {
  for (const [key, entry] of undoTokens)
    if (entry.expires <= Date.now() || entry.orderId === w.id)
      undoTokens.delete(key);
  while (undoTokens.size >= 100)
    undoTokens.delete(undoTokens.keys().next().value!);
  const token = crypto.randomUUID(),
    expires = Date.now() + 5000;
  undoTokens.set(token, {
    userId: session.userId,
    role: session.role,
    orderId: w.id,
    expires,
    before,
    after: JSON.stringify(undoScope(s, w)),
  });
  return { token, expiresAt: new Date(expires).toISOString() };
}

export const api = {
  async me(session: Session): Promise<User> {
    return clone(internal(session));
  },
  async users(session: Session): Promise<User[]> {
    internal(session);
    return clone(USERS.filter((u) => !u.roles.includes("MERCHANT")));
  },
  async actionCounts(
    session: Session,
  ): Promise<Partial<Record<QueueView, number>>> {
    internal(session);
    const s = load(),
      counts: Partial<Record<QueueView, number>> = {};
    for (const menu of MENUS[session.role]) {
      if (!(menu.key in QUEUE_TABS)) continue;
      const view = menu.key as QueueView;
      counts[view] = s.orders.filter((w) => {
        if (view === "extensions")
          return (
            session.role === "OPS_LEAD" &&
            w.status === "WAITING_MERCHANT" &&
            application(s, w.applicationId).submittedBy?.id !==
              session.userId &&
            !!w.extensions?.some(
              (e) =>
                e.status === "PENDING" && e.assignedTo?.id === session.userId,
            )
          );
        return (
          w.assignee?.id === session.userId &&
          actionable(s, w, session) &&
          QUEUE_TABS[view].some((tab) => inTab(w, session, view, tab.key))
        );
      }).length;
    }
    return counts;
  },
  async claimNext(
    ids: string[],
    session: Session,
    excludeId?: string,
  ): Promise<OrderDetail | null> {
    internal(session);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
      fail("队列编号无效。");
    const s = load();
    for (const id of ids) {
      if (id === excludeId) continue;
      const w = s.orders.find((candidate) => candidate.id === id);
      if (!w || !actionable(s, w, session)) continue;
      if (!w.assignee) {
        const before = clone(w);
        claimOrder(s, w, session);
        changed(s, w, ref(user(session)), "claim", before);
        persist(s);
      }
      return detail(s, w, session);
    }
    return null;
  },
  async previewNotice(
    id: string,
    payload: { channel: string; recipient?: string },
    session: Session,
  ): Promise<NoticePreview> {
    internal(session);
    const s = load(),
      w = order(s, id);
    authRead(w, session);
    return noticePreview(s, w, payload, session);
  },
  async undo(token: string, session: Session): Promise<OrderDetail> {
    const actor = ref(internal(session)),
      entry = undoTokens.get(token);
    if (!entry) fail("撤销已失效或已使用。", 409);
    if (entry.userId !== session.userId || entry.role !== session.role)
      fail("只能撤销本人在当前角色下的操作。", 403);
    if (Date.now() >= entry.expires) {
      undoTokens.delete(token);
      fail("已超过五秒撤销时限。", 409);
    }
    const s = load(),
      w = order(s, entry.orderId);
    authRead(w, session);
    duty(s, w, session);
    if (JSON.stringify(undoScope(s, w)) !== entry.after)
      throw new ApiError(
        "工单或相关资料已更新，不能撤销。",
        409,
        w.version,
        w.assignee,
      );
    const before = clone(w),
      original = entry.before;
    const restored = clone(original.orders.find((v) => v.id === w.id)!);
    restored.version = w.version;
    s.orders[s.orders.findIndex((v) => v.id === w.id)] = restored;
    const a = application(s, w.applicationId);
    if (JSON.stringify(a) !== JSON.stringify(original.application)) {
      const restoredApp = clone(original.application);
      restoredApp.version = a.version + 1;
      s.applications[s.applications.findIndex((v) => v.id === a.id)] =
        restoredApp;
    }
    s.merchants[s.merchants.findIndex((v) => v.id === original.merchant.id)] =
      clone(original.merchant);
    s.people = s.people
      .filter((p) => p.merchantId !== original.merchant.id)
      .concat(clone(original.people));
    changed(s, restored, actor, "撤销内部操作", before);
    persist(s);
    undoTokens.delete(token);
    return detail(s, restored, session);
  },
  async listOrders(
    filters: QueueFilters,
    session: Session,
  ): Promise<QueueData> {
    internal(session);
    const view =
      filters.view ||
      (isOps(session.role)
        ? "ops"
        : session.role === "APPROVER"
          ? "approval"
          : "review");
    if (!MENUS[session.role].some((m) => m.key === view))
      fail("无权访问此队列。", 403);
    if (isOps(session.role) && (filters.priority || filters.reasonCode))
      fail("当前角色无权按内部判断筛选。", 403);
    if (filters.mapped && !["true", "false"].includes(filters.mapped))
      fail("是否映射筛选值无效。");
    if (
      filters.receiptType &&
      !["REJECTED", "MORE_INFO", "TIMEOUT"].includes(filters.receiptType)
    )
      fail("回执类型筛选值无效。");
    const tab = filters.tab || QUEUE_TABS[view][0].key;
    if (!QUEUE_TABS[view].some((t) => t.key === tab)) fail("队列页签无效。");
    const s = load(),
      base = s.orders.filter((w) => {
        const a = application(s, w.applicationId),
          m = merchant(s, a);
        if (filters.channel || filters.receiptType || filters.mapped) {
          const c = s.submissions.find((v) => v.id === w.channelSubmissionId);
          if (
            !c ||
            (filters.channel && c.channelId !== filters.channel) ||
            (filters.receiptType &&
              (c.receiptType || w.triggerReceiptType) !==
                filters.receiptType) ||
            (filters.mapped &&
              !!c.mappedReasonCode !== (filters.mapped === "true"))
          )
            return false;
        }
        if (
          (filters.type && filters.type !== w.type) ||
          (filters.priority && filters.priority !== w.priority) ||
          (filters.reasonCode &&
            !w.reasonCodes?.includes(filters.reasonCode)) ||
          (filters.country && filters.country !== m.country)
        )
          return false;
        if (
          filters.key &&
          filters.key !== "all" &&
          a.isKeyMerchant !== (filters.key === "true" || filters.key === "key")
        )
          return false;
        if (
          filters.source &&
          !w.items?.some((i) => i.source === filters.source)
        )
          return false;
        if (
          filters.due === "overdue" &&
          Date.parse(w.dueAt || w.slaDueAt) >= Date.now()
        )
          return false;
        if (
          filters.due === "today" &&
          (w.dueAt || w.slaDueAt).slice(0, 10) !== now().slice(0, 10)
        )
          return false;
        return (
          !filters.search ||
          [w.id, a.id, m.legalName, m.displayName, m.registrationNo].some((v) =>
            v?.toLowerCase().includes(filters.search!.trim().toLowerCase()),
          )
        );
      });
    const counts = Object.fromEntries(
      QUEUE_TABS[view].map((t) => [
        t.key,
        base.filter((w) => inTab(w, session, view, t.key)).length,
      ]),
    );
    const rows = base
      .filter((w) => inTab(w, session, view, tab))
      .map((w) => queueRow(s, w, session, view, tab));
    rows.sort((a, b) =>
      view === "restricted"
        ? Date.parse(b.frozenAt || b.createdAt) -
          Date.parse(a.frozenAt || a.createdAt)
        : view === "extensions"
          ? Date.parse(a.extension!.requestedAt) -
            Date.parse(b.extension!.requestedAt)
          : Date.parse(
              tab === "waiting" || tab === "supplement"
                ? a.dueAt || a.slaDueAt
                : a.slaDueAt,
            ) -
              Date.parse(
                tab === "waiting" || tab === "supplement"
                  ? b.dueAt || b.slaDueAt
                  : b.slaDueAt,
              ) || Number(b.isKeyMerchant) - Number(a.isKeyMerchant),
    );
    return {
      rows,
      counts,
      total: rows.length,
      todayCompleted: base.filter(
        (w) =>
          CLOSED.includes(w.status) &&
          w.closedAt?.slice(0, 10) === now().slice(0, 10) &&
          w.assignee?.id === session.userId,
      ).length,
      updatedAt: now(),
    };
  },
  async getOrder(id: string, session: Session): Promise<OrderDetail> {
    user(session);
    const s = load();
    return detail(s, order(s, id, session), session);
  },
  async getApplication(
    id: string,
    session: Session,
  ): Promise<ApplicationDetail> {
    internal(session);
    return applicationDetail(load(), id, session);
  },
  async listApplications(
    filters: ApplicationFilters,
    session: Session,
  ): Promise<ApplicationRow[]> {
    internal(session);
    if (
      !canEvidence(session.role) &&
      (filters.internalStatus || filters.priority)
    )
      fail("无权按内部判断筛选。", 403);
    if (filters.channel && !isOps(session.role)) fail("无权按渠道筛选。", 403);
    const s = load();
    return s.applications
      .filter((a) => {
        const m = merchant(s, a);
        if (
          (filters.country && m.country !== filters.country) ||
          (filters.stage && a.stage !== filters.stage) ||
          (filters.externalStatus &&
            a.externalStatus !== filters.externalStatus) ||
          (filters.from && a.createdAt < filters.from) ||
          (filters.to &&
            a.createdAt > `${filters.to.slice(0, 10)}T23:59:59.999Z`)
        )
          return false;
        if (
          filters.key &&
          filters.key !== "all" &&
          a.isKeyMerchant !== (filters.key === "true" || filters.key === "key")
        )
          return false;
        if (
          (filters.internalStatus &&
            projectApp(s, a, session).status !== filters.internalStatus) ||
          (filters.priority &&
            !s.orders.some(
              (w) =>
                w.applicationId === a.id && w.priority === filters.priority,
            )) ||
          (filters.channel &&
            !s.submissions.some(
              (c) =>
                c.applicationId === a.id &&
                (c.channelId === filters.channel ||
                  c.channelName === filters.channel),
            ))
        )
          return false;
        return (
          !filters.search ||
          [a.id, m.legalName, m.displayName, m.registrationNo].some((v) =>
            v?.toLowerCase().includes(filters.search!.trim().toLowerCase()),
          )
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => {
        const candidates = s.orders.filter(
          (w) =>
            w.applicationId === a.id &&
            !CLOSED.includes(w.status) &&
            (isOps(session.role)
              ? ["SUPPLEMENT", "CHANNEL"].includes(w.type)
              : readable(w, session)),
        );
        const current =
          (a.stage === "APPROVAL"
            ? candidates.find(
                (w) => w.type === "REVIEW" && w.status === "PENDING_APPROVAL",
              )
            : a.stage === "CHANNEL"
              ? candidates.find((w) => w.type === "CHANNEL")
              : undefined) || candidates.at(-1);
        const row: ApplicationRow = {
          application: projectApp(s, a, session),
          merchant: projectMerchant(merchant(s, a), session, true),
          nextStep:
            a.externalStatus === "资料待补充"
              ? "补充所需资料"
              : a.externalStatus === "未通过"
                ? "申请已结束"
                : a.stage === "LIVE"
                  ? "已开通交易"
                  : a.stage === "CHANNEL"
                    ? "等待渠道回执"
                    : "等待审核结果",
        };
        // Lists never carry whole application internals, even for evidence-authorized roles.
        row.application = pick(row.application, [
          ...SAFE_APP,
          "status",
          "externalCategory",
        ]);
        if (current && session.role !== "SALES")
          row.currentOrder = pick(
            current,
            canEvidence(session.role)
              ? ["id", "type", "status", "assignee", "priority"]
              : ["id", "type", "status", "assignee"],
          );
        if (canEvidence(session.role))
          row.internalStatus = projectApp(s, a, session).status;
        if (isOps(session.role)) {
          row.opsTask =
            current?.type === "SUPPLEMENT"
              ? "补件"
              : current?.type === "CHANNEL"
                ? "渠道进件"
                : undefined;
          row.dueAt = current?.dueAt;
        }
        return row;
      });
  },
  async search(query: string, session: Session): Promise<SearchResult[]> {
    internal(session);
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    const s = load();
    const matches = (id: string, m: Merchant) =>
      [id, m.legalName, m.displayName].some((value) =>
        value?.toLocaleLowerCase().includes(term),
      );
    const results: SearchResult[] = [];
    for (const w of s.orders) {
      if (!readable(w, session)) continue;
      const m = merchant(s, application(s, w.applicationId));
      if (!matches(w.id, m)) continue;
      const projected = projectOrder(s, w, session);
      results.push({
        id: w.id,
        kind: "order",
        path: orderPath(projected),
        label: m.legalName,
        status: projected.status,
      });
    }
    for (const a of s.applications) {
      const m = merchant(s, a);
      if (!matches(a.id, m)) continue;
      results.push({
        id: a.id,
        kind: "application",
        path: `/applications/${a.id}`,
        label: m.legalName,
        status: projectApp(s, a, session).status,
      });
    }
    return results
      .sort(
        (a, b) =>
          Number(b.id.toLocaleLowerCase() === term) -
            Number(a.id.toLocaleLowerCase() === term) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 20);
  },
  async evidence(id: string, session: Session): Promise<Evidence> {
    internal(session);
    if (!canEvidence(session.role)) fail("无权查看风险证据。", 403);
    const s = load(),
      e = s.evidence.find((v) => v.id === id);
    if (!e) fail("证据不存在。", 404);
    if (restrictedEvidence(s, id) && session.role !== "COMPLIANCE_HEAD")
      fail("无权查看此证据。", 403);
    return projectEvidence(e);
  },
  async snapshot(id: string, session: Session): Promise<EvidenceSnapshot> {
    internal(session);
    if (!canEvidence(session.role)) fail("无权查看证据快照。", 403);
    const s = load(),
      snap = s.snapshots[id];
    if (!snap) fail("快照不存在。", 404);
    if (
      s.orders.some(
        (candidate) =>
          candidate.type === "QA" &&
          s.qa[candidate.id]?.snapshotId === id &&
          ["QUEUED", "BLIND"].includes(candidate.status),
      )
    )
      fail("盲审阶段不能查看原决策快照。", 403);
    const w = order(s, snap.workOrderId);
    authRead(w, session);
    if (w.type === "QA" && ["QUEUED", "BLIND"].includes(w.status))
      fail("盲审阶段不能查看原决策快照。", 403);
    if (
      session.role !== "COMPLIANCE_HEAD" &&
      snap.evidence.some((e) => restrictedEvidence(s, e.id))
    )
      fail("无权查看此快照。", 403);
    return {
      ...clone(snap),
      evidence: snap.evidence.map((e) => projectEvidence(e)),
    };
  },
  async notifications(session: Session) {
    internal(session);
    const s = load();
    return s.notifications
      .filter((n) => actionableNotification(s, n, session))
      .map((n) => {
        const result = pick(n, [
          "id",
          "userId",
          "workOrderId",
          "title",
          "type",
          "at",
          "read",
          "count",
        ]);
        if (n.type === "SLA") {
          result.count = s.orders.filter(
            (w) =>
              w.assignee?.id === session.userId &&
              !w.slaPaused &&
              Date.parse(w.slaDueAt) - Date.now() <= HOUR &&
              actionable(s, w, session),
          ).length;
          result.title = `${result.count} 张待处理工单即将或已经超时，请及时处理`;
          delete result.workOrderId;
        }
        return result;
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  },
  async markNotificationsRead(
    ids: string[] | "all",
    session: Session,
  ): Promise<void> {
    internal(session);
    if (
      ids !== "all" &&
      (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
    )
      fail("通知编号无效。");
    const s = load(),
      selected = ids === "all" ? null : new Set(ids);
    for (const n of s.notifications)
      if (
        n.userId === session.userId &&
        (!selected || selected.has(n.id)) &&
        actionableNotification(s, n, session)
      )
        n.read = true;
    persist(s);
  },
  async mutate(
    id: string,
    action: MutationAction,
    payload: Record<string, any>,
    version: number,
    session: Session,
  ): Promise<OrderDetail> {
    const actor = ref(user(session));
    const actionRoles: Record<MutationAction, Role[]> = {
      claim: [...OPS_ROLES, ...COMPLIANCE_ROLES, "APPROVER"],
      release: [...OPS_ROLES, ...COMPLIANCE_ROLES],
      assign: ["OPS_LEAD", "COMPLIANCE_HEAD"],
      conclusion: COMPLIANCE_ROLES,
      "supplement-needs": COMPLIANCE_ROLES,
      escalate: COMPLIANCE_ROLES,
      "late-decline": COMPLIANCE_ROLES,
      finalize: COMPLIANCE_ROLES,
      approval: ["APPROVER"],
      "restricted-decision": ["COMPLIANCE_HEAD"],
      qa: ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"],
      notices: OPS_ROLES,
      "contact-logs": OPS_ROLES,
      reminders: OPS_ROLES,
      extensions: OPS_ROLES,
      "approve-extension": ["OPS_LEAD"],
      "supplement-check": OPS_ROLES,
      "return-to-merchant": OPS_ROLES,
      "complete-supplement": OPS_ROLES,
      withdraw: OPS_ROLES,
      "merchant-submit": ["MERCHANT"],
      "channel-supplement": OPS_ROLES,
      "channel-resubmit": OPS_ROLES,
      "channel-switch": OPS_ROLES,
      "channel-escalate": OPS_ROLES,
      "channel-terminate": ["OPS_LEAD"],
      "channel-remind": OPS_ROLES,
      "channel-mapping": ["OPS_LEAD"],
      "mapping-request": ["OPS_AGENT"],
      note: [...OPS_ROLES, ...COMPLIANCE_ROLES],
      "read-evidence": [...COMPLIANCE_ROLES, "APPROVER"],
      media: COMPLIANCE_ROLES,
      persona: COMPLIANCE_ROLES,
      "reopen-item": COMPLIANCE_ROLES,
    };
    if (!actionRoles[action]) fail("不支持此操作。", 403);
    roles(session, actionRoles[action]);
    const s = load(),
      w = order(s, id, session);
    authRead(w, session);
    stale(w, version);
    if (!["read-evidence", "media", "persona"].includes(action))
      duty(
        s,
        w,
        session,
        ["approval", "qa", "restricted-decision"].includes(action),
      );
    const a = application(s, w.applicationId),
      m = merchant(s, a),
      before = clone(w);
    const undoBefore = ["conclusion", "contact-logs", "note"].includes(action)
      ? clone(undoScope(s, w))
      : undefined;
    payload = clone(payload);
    let grant: { evidenceId: string; mediaId: string } | undefined;
    const review = () => {
      owner(w, session, COMPLIANCE_ROLES);
      state(w, "REVIEW", ["IN_PROGRESS"]);
    };
    const supplement = (statuses: Status[]) => {
      owner(w, session, OPS_ROLES);
      state(w, "SUPPLEMENT", statuses);
    };
    const channel = (statuses: Status[] = ["IN_PROGRESS"]) => {
      owner(w, session, OPS_ROLES);
      state(w, "CHANNEL", statuses);
      const c = s.submissions.find((v) => v.id === w.channelSubmissionId);
      if (!c) fail("渠道提交不存在。", 409);
      return c;
    };
    switch (action) {
      case "claim": {
        if (w.type === "SUPPLEMENT" && w.status === "WAITING_MERCHANT") {
          roles(session, OPS_ROLES);
          if (w.assignee)
            throw new ApiError(
              "工单已被领取，请刷新。",
              409,
              w.version,
              clone(w.assignee),
            );
          w.assignee = actor;
          w.firstResponderAt ||= now();
        } else claimOrder(s, w, session);
        break;
      }
      case "release": {
        owner(
          w,
          session,
          w.type === "SUPPLEMENT" || w.type === "CHANNEL"
            ? OPS_ROLES
            : COMPLIANCE_ROLES,
        );
        required(payload.reason, "释放原因");
        if (w.type === "SUPPLEMENT") {
          if (!["TO_SEND", "WAITING_MERCHANT", "TO_CHECK"].includes(w.status))
            fail("当前状态不能释放。", 409);
        } else {
          if (!["IN_PROGRESS", "BLIND"].includes(w.status))
            fail("当前状态不能释放。", 409);
          transition(w, "QUEUED");
        }
        delete w.assignee;
        break;
      }
      case "assign": {
        const ops = w.type === "SUPPLEMENT" || w.type === "CHANNEL";
        roles(session, ops ? ["OPS_LEAD"] : ["COMPLIANCE_HEAD"]);
        if (
          CLOSED.includes(w.status) ||
          ["PENDING_SECOND", "PENDING_APPROVAL", "COMPLIANCE_HOLD"].includes(
            w.status,
          )
        )
          fail("当前状态不可指派。", 409);
        const target = USERS.find((u) => u.id === payload.assigneeId);
        if (!target) fail("处理人无效。");
        if (
          ops
            ? !target.roles.some(isOps)
            : w.type === "RESTRICTED"
              ? !target.roles.includes("COMPLIANCE_HEAD")
              : w.type === "QA" || w.overrideAutoReject
                ? !target.roles.some(isSenior)
                : !target.roles.some(isCompliance)
        )
          fail("不能跨职责组指派。", 403);
        duty(s, w, { ...session, userId: target.id }, w.type === "QA");
        w.assignee = ref(target);
        w.firstResponderAt ||= now();
        if (w.status === "QUEUED")
          transition(w, w.type === "QA" ? "BLIND" : "IN_PROGRESS");
        notify(s, target.id, w, "你被指派了一张工单", "ASSIGNMENT");
        break;
      }
      case "conclusion": {
        review();
        const c = w.checkItems?.find((c) => c.id === payload.itemId);
        if (!c) fail("检查项不存在。", 404);
        if (c.status !== "PENDING") fail("检查项已结论，请先重新打开。", 409);
        if (
          c.evidenceIds.some((e) => restrictedEvidence(s, e)) &&
          session.role !== "COMPLIANCE_HEAD"
        )
          fail("该检查项仅负责人可处理。", 403);
        validateConclusion(s, c, payload, session);
        Object.assign(
          c,
          pick(payload, [
            "conclusion",
            "conclusionReason",
            "note",
            "hitConclusions",
            "articles",
            "mcc",
            "uboNames",
            "remediationItems",
          ]),
        );
        if (payload.verificationFiles?.length)
          c.verificationFiles = files(payload.verificationFiles, actor);
        c.status = "DECIDED";
        c.decidedBy = actor;
        c.decidedAt = now();
        c.hasNewEvidence = false;
        if (c.conclusion === "CHANGE_MCC") {
          m.declaredMcc = payload.mcc;
          a.version++;
          if (
            ["4722", "7995", "6051", "6211"].includes(payload.mcc) &&
            !w.approvalReasons?.includes("CLS-HIGH-RISK")
          )
            (w.approvalReasons ||= []).push("CLS-HIGH-RISK");
        }
        if (
          c.checkType === "SCHEME_LIST" &&
          c.conclusion === "ACCEPTABLE" &&
          !w.approvalReasons?.includes("INT-SCHEME-LIST")
        )
          (w.approvalReasons ||= []).push("INT-SCHEME-LIST");
        if (c.conclusion === "TRACED")
          for (const name of payload.uboNames as string[])
            if (
              !s.people.some(
                (p) => p.merchantId === m.id && p.name === name.trim(),
              )
            )
              s.people.push({
                id: uid(s, "PERSON"),
                merchantId: m.id,
                name: name.trim(),
                role: "UBO",
                declared: true,
                needsReverify: true,
                kycStatus: "PENDING",
              });
        if (c.conclusion === "MANUAL_PASS") {
          const supplied = new Set(
            s.evidence
              .filter((e) => c.evidenceIds.includes(e.id))
              .flatMap((e) =>
                (e.fields.missing || []).map((v: { name: string }) => v.name),
              ),
          );
          w.missingEvidence = (w.missingEvidence || []).filter(
            (x) =>
              !c.evidenceIds.includes(x) &&
              x !== c.id &&
              x !== c.reasonCodes[0] &&
              !supplied.has(x),
          );
        }
        c.snapshotId = snapshot(s, w);
        w.hasNewEvidence = w.checkItems?.some((c) => c.hasNewEvidence);
        break;
      }
      case "reopen-item": {
        review();
        required(payload.reason, "重新调查原因");
        const c = w.checkItems?.find((c) => c.id === payload.itemId);
        if (!c || c.status === "PENDING") fail("该检查项不能重新打开。", 409);
        c.status = "PENDING";
        delete c.conclusion;
        delete c.conclusionReason;
        delete c.note;
        delete c.decidedBy;
        delete c.decidedAt;
        delete c.snapshotId;
        break;
      }
      case "supplement-needs":
        review();
        addSupplement(s, w, payload, actor);
        break;
      case "escalate":
        review();
        required(payload.reason, "转受限原因");
        escalate(s, w, actor, payload.reason);
        break;
      case "late-decline": {
        review();
        if (!w.lateHardReject) fail("没有待处理硬拒事件。", 409);
        if (payload.action === "confirm") finish(s, w, "DECLINED");
        else if (payload.action === "ignore") {
          required(payload.reason, "忽略原因");
          w.hardRejectDismissed = true;
        } else fail("无效的硬拒处理动作。");
        break;
      }
      case "finalize": {
        review();
        if (
          !["APPROVED", "DECLINED", "PENDING_APPROVAL"].includes(
            payload.outcome,
          )
        )
          fail("结案结果无效。");
        if (
          w.checkItems?.some((c) =>
            ["TRUE_POSITIVE", "UNCERTAIN"].includes(c.conclusion || ""),
          )
        )
          fail("筛查判断必须转受限，不能直接结案。", 409);
        if (w.lateHardReject && payload.outcome !== "DECLINED")
          fail("硬拒不可推翻；例外须转受限。", 403);
        if (w.checkItems?.some((c) => c.status === "PENDING"))
          fail("请完成全部检查项。");
        if (
          w.checkItems?.some((c) => SUPPLEMENT_CONCLUSIONS[c.conclusion || ""])
        )
          fail("请先完成待提交或未完成的补件。");
        if (w.missingEvidence?.length && payload.outcome !== "DECLINED")
          fail("证据尚未齐备。");
        const suggested = w.checkItems?.some(
          (c) => DECLINE_CONCLUSIONS[c.conclusion || ""],
        )
          ? "DECLINED"
          : w.approvalReasons?.length
            ? "PENDING_APPROVAL"
            : "APPROVED";
        if (payload.outcome !== suggested)
          required(payload.overrideReason, "改判原因");
        if (w.approvalReasons?.length && payload.outcome === "APPROVED")
          fail("不能绕过必需审批。", 403);
        if (w.overrideAutoReject && payload.outcome === "APPROVED") {
          roles(session, ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"]);
          if (w.approvalActorIds?.includes(session.userId))
            fail("推翻自动拒绝需要另一位资深合规确认。", 403);
          (w.approvalActorIds ||= []).push(session.userId);
          w.requiresDual = true;
          if (w.approvalActorIds.length < 2) {
            w.originalAssignee = actor;
            delete w.assignee;
            transition(w, "QUEUED");
            break;
          }
        }
        if (payload.outcome === "PENDING_APPROVAL") {
          if (!w.approvalReasons?.length) fail("没有需要审批的事项。");
          w.originalAssignee = actor;
          w.approvalActorIds = [];
          w.requiresDual =
            !!w.approvalReasons.includes("INT-PEP") ||
            m.expectedMonthlyVolume.amount >
              Math.max(...USERS.map((u) => u.approvalLimit || 0));
          transition(w, "PENDING_APPROVAL");
          delete w.assignee;
          a.status = "PENDING_APPROVAL";
          a.stage = "APPROVAL";
          a.stageTimes.APPROVAL = now();
          a.version++;
          for (const u of USERS.filter((u) => u.roles.includes("APPROVER")))
            notify(s, u.id, w, "申请已提交审批，请领取处理", "ASSIGNMENT");
        } else finish(s, w, payload.outcome);
        break;
      }
      case "approval": {
        state(w, "REVIEW", ["PENDING_APPROVAL"]);
        if (w.assignee && w.assignee.id !== session.userId)
          fail("仅当前审批处理人可操作。", 403);
        w.assignee = actor;
        const decision = payload.decision,
          u = user(session);
        if (
          ![
            "APPROVED",
            "APPROVED_WITH_CONDITIONS",
            "DECLINED",
            "RETURN",
            "DISAGREE",
          ].includes(decision)
        )
          fail("审批决定无效。");
        if (decision === "RETURN") {
          required(payload.reason, "退回说明");
          transition(w, "IN_PROGRESS");
          w.assignee = clone(w.originalAssignee);
          w.approvalActorIds = [];
          delete w.pendingDecision;
          a.status = "IN_PROGRESS";
          a.stage = "MANUAL_REVIEW";
          a.version++;
          break;
        }
        if (
          w.approvalReasons?.includes("INT-PEP") &&
          u.authority !== "MANAGEMENT"
        )
          fail("PEP 审批需要高级管理层权限。", 403);
        const highest = Math.max(...USERS.map((u) => u.approvalLimit || 0));
        if (
          !u.approvalLimit ||
          (m.expectedMonthlyVolume.amount > u.approvalLimit &&
            !(
              m.expectedMonthlyVolume.amount > highest &&
              u.approvalLimit === highest &&
              u.authority === "MANAGEMENT"
            ))
        )
          fail("超出你的审批额度。", 403);
        if (w.approvalActorIds?.includes(u.id))
          fail("第二审批人必须是另一人。", 403);
        if (decision === "DISAGREE") {
          if (!w.approvalActorIds?.length) fail("尚无第一人决定。", 409);
          required(payload.reason, "驳回原因");
          w.assignee = ref(USERS.find((u) => u.id === w.approvalActorIds![0])!);
          w.approvalActorIds = [];
          delete w.pendingDecision;
          break;
        }
        if (
          w.checkItems?.some((c) => c.status === "PENDING") ||
          w.missingEvidence?.length
        )
          fail("调查尚未完成。");
        if (decision === "DECLINED") required(payload.reason, "拒绝原因");
        let conditions: ApprovalConditions | undefined;
        if (decision === "APPROVED_WITH_CONDITIONS") {
          const keys = [
            "singleLimit",
            "monthlyLimit",
            "reservePct",
            "reserveDays",
            "reviewDays",
          ];
          if (
            keys.some(
              (k) =>
                typeof payload.conditions?.[k] !== "number" ||
                !Number.isFinite(payload.conditions[k]) ||
                payload.conditions[k] < 0,
            )
          )
            fail("请完整填写有效的审批条件。");
          conditions = pick(payload.conditions, keys) as ApprovalConditions;
          if (
            conditions.singleLimit <= 0 ||
            conditions.monthlyLimit < conditions.singleLimit ||
            conditions.reservePct > 100 ||
            conditions.reviewDays <= 0
          )
            fail("审批条件范围无效。");
        }
        (w.approvalActorIds ||= []).push(u.id);
        w.pendingDecision = decision;
        s.approvalDecisions.push({
          id: uid(s, "APD"),
          workOrderId: w.id,
          decision,
          reason: payload.reason,
          conditions,
          approvers: [actor],
          at: now(),
        });
        const dual =
          w.requiresDual ||
          w.approvalReasons?.includes("INT-PEP") ||
          m.expectedMonthlyVolume.amount > highest;
        if (!dual || w.approvalActorIds.length >= 2) {
          const ds = s.approvalDecisions
            .filter(
              (d) =>
                d.workOrderId === w.id &&
                d.approvers.some((u) => w.approvalActorIds!.includes(u.id)),
            )
            .slice(-w.approvalActorIds.length);
          const outcome = ds.some((d) => d.decision === "DECLINED")
            ? "DECLINED"
            : ds.some((d) => d.decision === "APPROVED_WITH_CONDITIONS")
              ? "APPROVED_WITH_CONDITIONS"
              : "APPROVED";
          if (outcome === "APPROVED_WITH_CONDITIONS")
            m.conditions = clone(
              ds.filter((d) => d.conditions).at(-1)!.conditions!,
            );
          finish(s, w, outcome);
        } else {
          delete w.assignee;
          for (const candidate of USERS.filter(
            (candidate) =>
              candidate.roles.includes("APPROVER") && candidate.id !== actor.id,
          ))
            notify(s, candidate.id, w, "申请待第二位审批人确认", "ASSIGNMENT");
        }
        break;
      }
      case "restricted-decision": {
        state(w, "RESTRICTED", ["IN_PROGRESS", "PENDING_SECOND"]);
        required(payload.reason, "处置原因");
        const decision = payload.decision;
        if (!["EXCLUDE", "DECLINE", "CASE", "DISAGREE"].includes(decision))
          fail("受限决定无效。");
        if (w.status === "IN_PROGRESS") owner(w, session, ["COMPLIANCE_HEAD"]);
        if (
          w.status === "PENDING_SECOND" &&
          w.assignee &&
          w.assignee.id !== actor.id
        )
          fail("仅当前第二确认人可操作。", 403);
        if (w.restrictedActorIds?.includes(actor.id))
          fail("第二确认人必须是另一位合规负责人。", 403);
        if (decision === "DISAGREE") {
          if (w.status !== "PENDING_SECOND") fail("尚无第一人决定。", 409);
          transition(w, "IN_PROGRESS");
          w.assignee = ref(
            USERS.find(
              (candidate) => candidate.id === w.restrictedActorIds?.[0],
            )!,
          );
          w.restrictedActorIds = [];
          delete w.pendingDecision;
          break;
        }
        if (w.status === "PENDING_SECOND" && decision !== w.pendingDecision)
          fail("第二人需确认相同决定，或选择驳回。", 409);
        (w.restrictedActorIds ||= []).push(actor.id);
        w.pendingDecision = decision;
        s.restrictedDecisions.push({
          id: uid(s, "RSD"),
          workOrderId: w.id,
          decision,
          reason: payload.reason,
          reviewers: [actor],
          at: now(),
        });
        if (w.restrictedActorIds.length < 2) {
          transition(w, "PENDING_SECOND");
          delete w.assignee;
          for (const head of USERS.filter(
            (candidate) =>
              candidate.roles.includes("COMPLIANCE_HEAD") &&
              candidate.id !== actor.id,
          ))
            notify(s, head.id, w, "受限案件待第二位负责人确认", "ASSIGNMENT");
          break;
        }
        transition(w, "CLOSED");
        w.closedAt = now();
        w.outcome = decision;
        const parent = w.parentId
          ? s.orders.find((p) => p.id === w.parentId)
          : undefined;
        if (decision === "CASE") {
          w.caseId = uid(s, "CASE");
          s.correctiveObjects.push({
            id: w.caseId,
            type: "RESTRICTED_CASE",
            applicationId: a.id,
            createdAt: now(),
          });
        }
        if (parent) {
          const pb = clone(parent);
          if (decision === "EXCLUDE") {
            w.restrictedResolved = true;
            resume(parent);
            transition(parent, "IN_PROGRESS");
            parent.restrictedResolved = true;
            for (const c of parent.checkItems || [])
              if (w.checkItems?.some((x) => x.id === c.id)) {
                c.status = "AUTO_CLOSED";
                c.conclusion = "RESTRICTED_EXCLUDED";
                c.conclusionReason = "受限已排除";
                delete c.note;
                delete c.hitConclusions;
              }
            a.status = "IN_PROGRESS";
            a.externalStatus = "审核中";
            a.version++;
          } else if (decision === "DECLINE") finish(s, parent, "DECLINED");
          changed(s, parent, actor, "受限处置已完成", pb);
        }
        break;
      }
      case "qa": {
        owner(w, session, ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"]);
        state(w, "QA", ["BLIND", "COMPARE"]);
        const q = s.qa[w.id];
        if (!q) fail("抽检记录不存在。", 409);
        if (w.status === "BLIND") {
          const answers = payload.blindConclusions;
          if (!answers || typeof answers !== "object" || Array.isArray(answers))
            fail("请提交独立结论。");
          const checks = orderChecks(s, w);
          let keys: string[];
          if (q.reviewMode === "APPLICATION") {
            keys = ["overall"];
            if (
              Object.keys(answers).length !== 1 ||
              !Object.hasOwn(answers, "overall") ||
              !["APPROVED", "DECLINED", "MANUAL_REVIEW"].includes(
                answers.overall,
              )
            )
              fail("请选择整单独立结论。");
          } else if (q.reviewMode === "CHECK_ITEMS") {
            if (!checks.length) fail("抽检样本缺少检查项。", 409);
            keys = checks.map((c) => c.id);
            if (Object.keys(answers).length !== keys.length)
              fail("请提交全部抽检项的独立结论。");
            for (const c of checks) {
              if (
                !Object.hasOwn(answers, c.id) ||
                !CHECK_OPTIONS[c.checkType].some(
                  (option) => option.value === answers[c.id],
                )
              )
                fail("请完成每个抽检项的独立结论。");
            }
          } else fail("抽检判断模式无效。", 409);
          if (
            !q.originalConclusions ||
            keys.some((key) => !Object.hasOwn(q.originalConclusions!, key))
          )
            fail("抽样时的原始结论不存在。", 409);
          q.blindConclusions = Object.fromEntries(
            keys.map((key) => [key, answers[key]]),
          );
          q.consistent = keys.every(
            (key) => q.blindConclusions![key] === q.originalConclusions![key],
          );
          transition(w, "COMPARE");
        } else {
          if (payload.complete !== true) fail("请确认完成抽检。");
          if (!q.consistent) {
            required(payload.mismatchReason, "差异原因");
            if (
              !Array.isArray(payload.correctiveActions) ||
              !payload.correctiveActions.length ||
              payload.correctiveActions.some(
                (v: unknown) =>
                  ![
                    "REOPEN_REVIEW",
                    "RESTORE_APPLICATION",
                    "RULE_CHANGE",
                  ].includes(String(v)),
              )
            )
              fail("请选择有效纠正动作。");
            q.mismatchReason = payload.mismatchReason;
            q.correctiveActions = [
              ...new Set<string>(payload.correctiveActions),
            ];
            q.generatedIds = [];
            for (const correction of q.correctiveActions) {
              if (correction === "REOPEN_REVIEW") {
                const review = makeOrder(s, a, "REVIEW", w.id);
                review.checkItems = clone(orderChecks(s, w)).map((c) => ({
                  id: uid(s, "CI"),
                  checkType: c.checkType,
                  title: c.title,
                  reasonCodes: clone(c.reasonCodes),
                  evidenceIds: clone(c.evidenceIds),
                  status: "PENDING",
                  hasNewEvidence: true,
                }));
                review.reasonCodes = [
                  ...new Set(review.checkItems.flatMap((c) => c.reasonCodes)),
                ];
                review.priority = "HIGH";
                q.generatedIds.push(review.id);
                audit(s, review, actor, "抽检生成复审", null);
                a.status = "IN_PROGRESS";
                a.stage = "MANUAL_REVIEW";
                a.externalStatus = "审核中";
                a.version++;
              } else {
                const obj = {
                  id: uid(s, correction === "RULE_CHANGE" ? "RULE" : "RESTORE"),
                  type: correction,
                  applicationId: a.id,
                  createdAt: now(),
                };
                s.correctiveObjects.push(obj);
                q.generatedIds.push(obj.id);
                if (correction === "RESTORE_APPLICATION") {
                  let task = s.orders.find(
                    (v) =>
                      v.applicationId === a.id &&
                      v.type === "SUPPLEMENT" &&
                      !CLOSED.includes(v.status),
                  );
                  const old = task ? clone(task) : null;
                  if (!task) {
                    task = makeOrder(s, a, "SUPPLEMENT", w.id);
                    task.assignee = ref(USERS.find((u) => u.id === "u_2051")!);
                    task.items = [];
                    task.merchantToken = crypto.randomUUID();
                  }
                  (task.items ||= []).push({
                    id: uid(s, "SI"),
                    sourceWorkOrderId: w.id,
                    source: "COMPLIANCE",
                    externalText: {
                      zh: "请确认是否继续申请，并确认当前经营信息。",
                      en: "Confirm that you wish to continue your application and verify your current business information.",
                    },
                    actionType: "CONFIRM_FIELD",
                    field: "继续申请",
                    status: task.status === "TO_CHECK" ? "MISSING" : "PENDING",
                    ...(task.status === "TO_CHECK"
                      ? { rejectReason: "新增资料待提供" }
                      : {}),
                  });
                  if (old) changed(s, task, actor, "合并恢复申请联系任务", old);
                  else audit(s, task, actor, "创建恢复申请联系任务", null);
                  q.generatedIds.push(task.id);
                }
              }
            }
          }
          finish(s, w, q.consistent ? "CONSISTENT" : "CORRECTED");
        }
        break;
      }
      case "notices": {
        supplement(["TO_SEND", "WAITING_MERCHANT"]);
        required(payload.recipient, "收件人");
        const preview = noticePreview(
          s,
          w,
          { channel: payload.channel, recipient: payload.recipient },
          session,
        );
        const unsent = (w.items || []).filter((i) => i.status === "PENDING");
        const body = payload.body ?? preview.body;
        neutralText(body);
        if (
          !body.includes(preview.link) ||
          unsent.some(
            (item) => !body.includes(item.externalText[preview.language]),
          )
        )
          fail("不可删改补件要求或安全提交链接，仅可补充模板措辞。");
        if (!body.includes(preview.dueAt.slice(0, 10)))
          fail("通知中的截止日期必须与当前预览一致，请重新预览。", 409);
        const subject = payload.subject ?? preview.subject,
          sender = payload.sender ?? preview.sender;
        neutralText(subject);
        if (sender !== preview.sender) fail("通知必须使用系统发件人。");
        for (const item of unsent) item.status = "SENT";
        if (!w.sentAt) {
          w.sentAt = now();
          w.dueAt = new Date(Date.parse(w.sentAt) + 7 * DAY).toISOString();
        }
        pause(w);
        if (w.status === "TO_SEND") transition(w, "WAITING_MERCHANT");
        (w.contactLog ||= []).push({
          id: uid(s, "CONTACT"),
          at: now(),
          channel: payload.channel,
          contact: preview.recipient,
          subject,
          sender,
          body,
          summary: `补件通知已发送，共 ${unsent.length} 项。`,
          by: actor,
        });
        break;
      }
      case "contact-logs": {
        supplement(["TO_SEND", "WAITING_MERCHANT", "TO_CHECK"]);
        if (!["PHONE", "EMAIL", "IM"].includes(payload.channel))
          fail("沟通方式无效。");
        required(payload.summary, "沟通摘要");
        neutralText(payload.summary);
        required(payload.contact, "联系人");
        if (!["CONNECTED", "NO_ANSWER", "PROMISED"].includes(payload.result))
          fail("请选择有效沟通结果。");
        const at =
          payload.at === undefined ? Date.now() : Date.parse(payload.at);
        if (
          !Number.isFinite(at) ||
          at > Date.now() + 60000 ||
          at < Date.parse(w.createdAt)
        )
          fail("沟通时间须在工单创建后且不能晚于当前时间。");
        const promised = payload.promisedAt
          ? Date.parse(payload.promisedAt)
          : undefined;
        if (
          payload.result === "PROMISED" &&
          (!promised || !Number.isFinite(promised) || promised <= at)
        )
          fail("承诺提交日期必须晚于沟通时间。");
        if (payload.result !== "PROMISED" && payload.promisedAt)
          fail("仅承诺提交可填写提交日期。");
        (w.contactLog ||= []).push({
          id: uid(s, "CONTACT"),
          at: new Date(at).toISOString(),
          channel: payload.channel,
          summary: payload.summary.trim(),
          by: actor,
          contact: payload.contact.trim(),
          result: payload.result,
          ...(promised ? { promisedAt: new Date(promised).toISOString() } : {}),
        });
        break;
      }
      case "reminders": {
        supplement(["WAITING_MERCHANT"]);
        if (
          payload.channel &&
          !["EMAIL", "SMS", "PORTAL"].includes(payload.channel)
        )
          fail("催办渠道无效。");
        w.remindersSent = (w.remindersSent || 0) + 1;
        (w.contactLog ||= []).push({
          id: uid(s, "CONTACT"),
          at: now(),
          channel: payload.channel || "PORTAL",
          summary: "请于截止日期前完成补件清单。",
          by: actor,
        });
        break;
      }
      case "extensions": {
        supplement(["WAITING_MERCHANT"]);
        required(payload.reason, "延期原因");
        const due = Date.parse(payload.dueAt),
          current = Date.parse(w.dueAt || "");
        if (
          !Number.isFinite(current) ||
          !Number.isFinite(due) ||
          due <= current ||
          due <= Date.now()
        )
          fail("新截止日期必须晚于原截止日期。");
        if (w.extensions?.some((e) => e.status === "PENDING"))
          fail("已有待批准的延期申请。", 409);
        const first = !w.extensions?.some((e) => e.status === "APPROVED");
        if (first && due - current > 7 * DAY) fail("首次延期最多七天。");
        const extension = {
          id: uid(s, "EXT"),
          requestedBy: actor,
          originalDueAt: w.dueAt!,
          ...(!first
            ? {
                assignedTo: ref(
                  USERS.find((candidate) =>
                    candidate.roles.includes("OPS_LEAD"),
                  )!,
                ),
              }
            : {}),
          requestedDueAt: new Date(due).toISOString(),
          reason: payload.reason,
          requestedAt: now(),
          status: first ? ("APPROVED" as const) : ("PENDING" as const),
          ...(first ? { approvedBy: actor, approvedAt: now() } : {}),
        };
        (w.extensions ||= []).push(extension);
        if (first) w.dueAt = extension.requestedDueAt;
        else
          for (const lead of USERS.filter(
            (u) => u.id === extension.assignedTo?.id,
          ))
            notify(s, lead.id, w, "补件延期申请待批准", "EXTENSION");
        break;
      }
      case "approve-extension": {
        state(w, "SUPPLEMENT", ["WAITING_MERCHANT"]);
        const e = w.extensions?.find(
          (e) => e.id === payload.extensionId && e.status === "PENDING",
        );
        if (!e) fail("没有可审批的延期申请。", 409);
        if (e.assignedTo && e.assignedTo.id !== session.userId)
          fail("仅当前延期审批人可操作。", 403);
        if (typeof payload.approved !== "boolean") fail("延期审批结果无效。");
        if (!payload.approved) required(payload.reason, "拒绝延期原因");
        e.status = payload.approved ? "APPROVED" : "REJECTED";
        e.approvedBy = actor;
        e.approvedAt = now();
        if (payload.approved) w.dueAt = e.requestedDueAt;
        break;
      }
      case "merchant-submit": {
        state(w, "SUPPLEMENT", ["WAITING_MERCHANT"]);
        if (!payload.responses || typeof payload.responses !== "object")
          fail("请填写补件清单。");
        if (w.items?.some((i) => i.status === "PENDING"))
          fail("运营尚未发出新增补件要求。", 409);
        const pending = (w.items || []).filter((i) => !i.checked);
        for (const item of pending) {
          const response = payload.responses[item.id];
          if (!response) fail("请完成全部待补正项目。");
          if (item.actionType === "UPLOAD")
            item.files = files(response.files, actor);
          if (item.actionType === "CONFIRM_FIELD") {
            required(response.value, "待确认信息");
            item.response = response.value.trim();
            if (response.files?.length)
              item.files = files(response.files, actor);
          }
          if (item.actionType === "REVERIFY") {
            if (response.reverified !== true) fail("请完成个人重新验证。");
            item.response =
              typeof response.value === "string" && response.value.trim()
                ? response.value.trim()
                : "个人验证已重新提交";
            if (response.files?.length)
              item.files = files(response.files, actor);
          }
          item.status = "PROVIDED";
          item.checked = false;
          delete item.rejectReason;
          delete item.checkedBy;
          delete item.checkedAt;
        }
        resume(w);
        w.slaDueAt = new Date(Date.now() + 4 * HOUR).toISOString();
        transition(w, "TO_CHECK");
        if (w.assignee)
          notify(
            s,
            w.assignee.id,
            w,
            "商户新材料已到，请进行齐套检查",
            "NEW_EVIDENCE",
          );
        break;
      }
      case "supplement-check": {
        supplement(["TO_CHECK"]);
        const item = w.items?.find((i) => i.id === payload.itemId);
        if (!item) fail("补件项不存在。", 404);
        if (!["USABLE", "REJECTED", "MISSING"].includes(payload.result))
          fail("齐套检查结果无效。");
        if (payload.result === "USABLE") {
          if (item.status !== "PROVIDED") fail("尚未提供的项目不能判定可用。");
          item.checked = true;
          delete item.rejectReason;
        } else {
          required(payload.reason, "退回原因");
          neutralText(payload.reason);
          item.status = payload.result;
          item.checked = false;
          item.rejectReason = payload.reason;
        }
        item.checkedBy = actor;
        item.checkedAt = now();
        break;
      }
      case "return-to-merchant": {
        supplement(["TO_CHECK"]);
        const rejected =
          w.items?.filter((i) => ["REJECTED", "MISSING"].includes(i.status)) ||
          [];
        if (!rejected.length) fail("没有需要退回补正的项目。");
        if (w.items?.some((i) => i.status === "PROVIDED" && !i.checked))
          fail("请先完成其余项目的齐套检查。");
        pause(w);
        transition(w, "WAITING_MERCHANT");
        (w.contactLog ||= []).push({
          id: uid(s, "CONTACT"),
          at: now(),
          channel: "PORTAL",
          summary: `退回补正：${rejected.map((i) => `${i.externalText.zh}（${i.rejectReason}）`).join("；")}`,
          by: actor,
        });
        break;
      }
      case "complete-supplement":
        supplement(["TO_CHECK"]);
        completeSupplement(s, w);
        break;
      case "withdraw": {
        supplement(["TO_SEND", "WAITING_MERCHANT", "TO_CHECK"]);
        required(payload.reason, "商户放弃原因");
        neutralText(payload.reason);
        const evidence = files(payload.files, actor);
        w.opsNote = `${payload.reason}；书面凭证：${evidence.map((f) => f.name).join("、")}`;
        (w.items ||= []).push({
          id: uid(s, "SI"),
          sourceWorkOrderId: w.id,
          source: "COMPLIANCE",
          externalText: {
            zh: "商户书面撤回确认",
            en: "Written confirmation of application withdrawal",
          },
          actionType: "UPLOAD",
          status: "PROVIDED",
          files: evidence,
          checked: true,
          checkedBy: actor,
          checkedAt: now(),
        });
        transition(w, "WITHDRAWN");
        w.closedAt = now();
        w.outcome = "WITHDRAWN";
        resume(w);
        closeSupplementParents(s, w, "WITHDRAWN");
        break;
      }
      case "channel-mapping": {
        state(w, "CHANNEL", ["IN_PROGRESS"]);
        const c = s.submissions.find(
          (submission) => submission.id === w.channelSubmissionId,
        );
        if (!c) fail("渠道提交不存在。", 409);
        if (c.mappedReasonCode) fail("当前回执已映射。", 409);
        if (
          !payload.reasonCode ||
          !REASONS[payload.reasonCode] ||
          typeof payload.isRiskType !== "boolean"
        )
          fail("请选择有效原因与类型。");
        if (
          ![
            "CH-REJECT-DOCS",
            "CH-REJECT-POLICY",
            "CH-MORE-INFO",
            "CH-TIMEOUT",
          ].includes(payload.reasonCode)
        )
          fail("请选择渠道原因。");
        if (
          c.receiptType === "REJECTED" &&
          !["CH-REJECT-DOCS", "CH-REJECT-POLICY"].includes(payload.reasonCode)
        )
          fail("驳回回执须映射为资料问题、政策或风险驳回。");
        c.mappedReasonCode = payload.reasonCode;
        c.isRiskType = payload.isRiskType;
        s.channelMappings.push({
          id: uid(s, "MAP"),
          channelId: c.channelId,
          upstreamCode: c.upstreamCode || "",
          rawReason: c.upstreamReasonRaw,
          reasonCode: payload.reasonCode,
          isRiskType: payload.isRiskType,
          createdBy: actor,
        });
        delete w.mappingRequestedAt;
        break;
      }
      case "mapping-request": {
        const c = channel();
        if (c.receiptType !== "REJECTED" || c.mappedReasonCode)
          fail("仅未映射的驳回回执可通知组长映射。", 409);
        if (w.mappingRequestedAt) fail("已通知组长，请等待映射。", 409);
        w.mappingRequestedAt = now();
        break;
      }
      case "channel-supplement": {
        const c = channel();
        if (c.receiptType !== "MORE_INFO") {
          if (c.isRiskType) fail("此回执必须先由合规判断。", 403);
          if (
            c.receiptType !== "REJECTED" ||
            c.mappedReasonCode !== "CH-REJECT-DOCS"
          )
            fail("仅要求补充材料或已映射的资料问题可发起补件。");
        }
        addSupplement(s, w, payload, actor);
        break;
      }
      case "channel-resubmit": {
        const c = channel();
        if (
          c.receiptType === "REJECTED" &&
          c.isRiskType &&
          !w.outcome?.startsWith("APPROVED")
        )
          fail("风险回执必须先完成合规判断。", 403);
        if (
          c.receiptType !== "MORE_INFO" &&
          c.mappedReasonCode !== "CH-REJECT-DOCS" &&
          !w.outcome?.startsWith("APPROVED")
        )
          fail("当前回执不支持修正后重新提交。", 409);
        if (
          c.receiptType === "MORE_INFO" &&
          !s.orders.some(
            (task) =>
              task.type === "SUPPLEMENT" &&
              task.status === "DONE" &&
              task.items?.some((item) => item.sourceWorkOrderId === w.id),
          )
        )
          fail("请先完成渠道要求的商户补件。", 409);
        if (!Array.isArray(payload.documents) || !payload.documents.length)
          fail("请填写重新提交资料。");
        c.documents = payload.documents.map((d: Record<string, any>) => {
          required(d.name, "资料名称");
          required(d.value, "资料内容");
          return {
            name: d.name,
            value: d.value,
            ...(d.file ? { file: files([d.file], actor)[0] } : {}),
          };
        });
        if (
          c.requiredDocuments.some(
            (name) => !c.documents.some((d) => d.name === name),
          )
        )
          fail("请补齐渠道要求的资料。");
        c.status = "SUBMITTED";
        c.submittedAt = now();
        c.submissionNo = uid(s, "SUBNO");
        w.triggerReceiptType = c.receiptType || w.triggerReceiptType;
        pause(w);
        transition(w, "WAITING_CHANNEL");
        a.status = "WAITING_CHANNEL";
        a.stage = "CHANNEL";
        a.version++;
        break;
      }
      case "channel-switch": {
        const c = channel();
        if (c.isRiskType) fail("风险类驳回不能由运营改投。", 403);
        if (
          c.receiptType !== "REJECTED" ||
          c.mappedReasonCode !== "CH-REJECT-POLICY"
        )
          fail("仅已映射的政策驳回可改投渠道。", 409);
        const alternative = s.submissions.find(
          (v) =>
            v.applicationId === a.id &&
            v.channelId === payload.channelId &&
            v.status === "AVAILABLE" &&
            v.channelId !== c.channelId,
        );
        if (!alternative) fail("请选择其他可用渠道。");
        c.status = "TERMINATED";
        const next = clone(alternative);
        next.id = uid(s, "SUB");
        next.submissionNo = uid(s, "SUBNO");
        next.status = "SUBMITTED";
        next.submittedAt = now();
        w.triggerReceiptType = c.receiptType || w.triggerReceiptType;
        s.submissions.push(next);
        alternative.status = "SELECTED";
        w.channelSubmissionId = next.id;
        pause(w);
        transition(w, "WAITING_CHANNEL");
        a.status = "WAITING_CHANNEL";
        a.stage = "CHANNEL";
        a.version++;
        break;
      }
      case "channel-escalate": {
        const c = channel();
        if (c.receiptType !== "REJECTED" || !c.isRiskType)
          fail("仅风险类驳回可转合规判断。");
        const review = makeOrder(s, a, "REVIEW", w.id);
        review.stage = "CHANNEL";
        review.assignee = ref(USERS.find((u) => u.id === "u_1023")!);
        review.originalAssignee = review.assignee;
        review.status = "IN_PROGRESS";
        review.reasonCodes = ["CH-REJECT-POLICY"];
        review.priority = "NORMAL";
        const e: Evidence = {
          id: uid(s, "EV"),
          applicationId: a.id,
          kind: "MANUAL_VERIFY",
          sourceRef: c.id,
          generatedAt: now(),
          fields: {
            missing: [
              {
                name: "渠道风险回执判断",
                reason: "渠道要求合规核实后继续处理",
              },
            ],
            materials: [],
            upstreamReasonRaw: c.upstreamReasonRaw,
            channelName: c.channelName,
          },
          mediaRefs: [],
        };
        s.evidence.push(e);
        review.checkItems = [
          {
            id: uid(s, "CI"),
            checkType: "MANUAL_VERIFY",
            title: "渠道回执人工核验",
            reasonCodes: ["CH-REJECT-POLICY"],
            evidenceIds: [e.id],
            status: "PENDING",
            hasNewEvidence: true,
          },
        ];
        audit(s, review, actor, "渠道转合规判断", null);
        notify(
          s,
          review.assignee.id,
          review,
          "渠道已转合规，请审核新检查项",
          "ASSIGNMENT",
        );
        pause(w);
        transition(w, "WAITING_COMPLIANCE");
        a.status = "IN_PROGRESS";
        a.externalStatus = "审核中";
        a.stage = "MANUAL_REVIEW";
        a.version++;
        break;
      }
      case "channel-terminate": {
        const c = channel();
        if (c.isRiskType) fail("风险类驳回不能由运营终止。", 403);
        required(payload.reason, "终止原因");
        c.status = "TERMINATED";
        transition(w, "CLOSED");
        w.closedAt = now();
        w.outcome = "TERMINATED";
        if (
          !s.submissions.some(
            (v) =>
              v.applicationId === a.id &&
              v.id !== c.id &&
              !["TERMINATED", "SELECTED"].includes(v.status),
          )
        ) {
          a.status = "CLOSED";
          a.externalStatus = "未通过";
          a.externalCategory = "综合评估";
          a.version++;
        }
        break;
      }
      case "channel-remind": {
        const c = channel(["IN_PROGRESS", "WAITING_CHANNEL"]);
        if (w.status === "IN_PROGRESS" && c.receiptType !== "TIMEOUT")
          fail("仅超时回执或等待渠道回执时可催询上游。", 409);
        required(payload.method, "催询方式");
        c.lastReminderAt = now();
        w.enteredStatusAt = now();
        w.opsNote = `催询方式：${payload.method}`;
        if (w.status === "IN_PROGRESS") {
          pause(w);
          transition(w, "WAITING_CHANNEL");
          a.status = "WAITING_CHANNEL";
          a.stage = "CHANNEL";
          a.version++;
        }
        break;
      }
      case "note": {
        required(payload.note, "备注");
        if (CLOSED.includes(w.status)) fail("已结束工单不可修改。", 409);
        if (isOps(session.role)) {
          owner(w, session, OPS_ROLES);
          if (!["SUPPLEMENT", "CHANNEL"].includes(w.type))
            fail("无权添加此备注。", 403);
          neutralText(payload.note);
          w.opsNote = payload.note.trim();
        } else {
          if (w.type !== "REVIEW" && w.type !== "RESTRICTED")
            fail("此工单不支持合规备注。", 403);
          owner(w, session, COMPLIANCE_ROLES);
          w.complianceNote = payload.note.trim();
        }
        break;
      }
      case "read-evidence":
      case "media":
      case "persona": {
        const c =
          action === "read-evidence"
            ? orderChecks(s, w).find((c) => c.id === payload.itemId)
            : orderChecks(s, w).find((c) =>
                c.evidenceIds.includes(payload.evidenceId),
              );
        const e =
          action === "read-evidence"
            ? undefined
            : orderEvidence(s, w).find((e) => e.id === payload.evidenceId);
        if (!c && !(w.type === "QA" && e)) fail("证据不属于本工单。", 404);
        if (
          (c ? c.evidenceIds : [e!.id]).some((id) =>
            restrictedEvidence(s, id),
          ) &&
          session.role !== "COMPLIANCE_HEAD"
        )
          fail("无权查看此证据。", 403);
        if (action === "media") {
          if (!e?.mediaRefs.some((m) => m.id === payload.mediaId))
            fail("影像不存在。", 404);
          grant = { evidenceId: e.id, mediaId: payload.mediaId };
        }
        break;
      }
      default:
        fail("不支持此操作。", 403);
    }
    changed(s, w, actor, action, before, payload.reason || payload.note);
    if (action === "conclusion") {
      const c = w.checkItems!.find((c) => c.id === payload.itemId)!;
      c.snapshotId = s.audit.at(-1)!.snapshotId;
    }
    persist(s);
    const result = detail(s, w, session, grant);
    if (undoBefore && w.status === before.status)
      result.undo = rememberUndo(s, w, session, undoBefore);
    return result;
  },
  async applicationAction(
    id: string,
    action: "key-merchant" | "review-request",
    payload: Record<string, any>,
    version: number,
    session: Session,
  ): Promise<ApplicationDetail> {
    const u = internal(session),
      s = load(),
      a = application(s, id),
      before = clone(a);
    if (action === "key-merchant") {
      if (
        session.role !== "OPS_LEAD" &&
        !(session.role === "SALES" && u.salesLead)
      )
        fail("只有运营组长或销售负责人可标记重点商户。", 403);
      stale(a, version);
      required(payload.reason, "标记原因");
      a.isKeyMerchant =
        typeof payload.isKeyMerchant === "boolean"
          ? payload.isKeyMerchant
          : true;
      for (const w of s.orders.filter(
        (w) => w.applicationId === id && !CLOSED.includes(w.status),
      )) {
        const old = clone(w);
        if (a.isKeyMerchant)
          w.priority = w.priority === "LOW" ? "NORMAL" : "HIGH";
        changed(s, w, ref(u), "重点商户调整", old);
      }
    } else if (action === "review-request") {
      roles(session, ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"]);
      stale(a, version);
      required(payload.reason, "复核原因");
      if (a.submittedBy?.id === u.id) fail("不能复核本人代提交的申请。", 403);
      if (a.autoDecision !== "DECLINED") fail("仅自动拒绝的申请可发起复核。");
      const codes = [
        ...s.events
          .filter((e) => e.applicationId === id)
          .map((e) => e.reasonCode),
        ...s.triage
          .filter((t) => t.applicationId === id)
          .flatMap((t) => t.reasonCodes),
      ];
      if (
        codes.some((c) => ["KYB-REG-INACTIVE", "INT-BLOCK-EXACT"].includes(c))
      )
        fail("硬拒不能推翻；例外须进入受限案件。", 403);
      if (
        s.orders.some(
          (w) =>
            w.applicationId === id &&
            w.type === "REVIEW" &&
            !CLOSED.includes(w.status),
        )
      )
        fail("已有进行中的复核。", 409);
      const w = makeOrder(s, a, "REVIEW");
      w.overrideAutoReject = true;
      w.requiresDual = true;
      w.priority = "HIGH";
      w.reasonCodes = codes;
      w.checkItems = [];
      w.approvalActorIds = [];
      w.submittedBy = ref(u);
      w.complianceNote = payload.reason;
      audit(s, w, ref(u), "发起自动拒绝复核", null);
      a.status = "QUEUED";
      a.stage = "MANUAL_REVIEW";
      a.externalStatus = "审核中";
    } else fail("不支持此申请操作。", 403);
    a.version++;
    const object = s.orders.find((w) => w.applicationId === id);
    const snap = object ? snapshot(s, object) : uid(s, "SNAP");
    if (!object)
      s.snapshots[snap] = {
        id: snap,
        at: now(),
        workOrderId: id,
        checkItems: [],
        evidence: [],
      };
    s.audit.push({
      id: uid(s, "AUD"),
      objectId: id,
      actor: ref(u),
      action,
      before,
      after: clone(a),
      snapshotId: snap,
      at: now(),
      note: payload.reason,
      visibility: action === "key-merchant" ? "ALL" : "COMPLIANCE",
    });
    persist(s);
    return applicationDetail(s, id, session);
  },
  async metrics(
    filters: {
      from?: string;
      to?: string;
      stage?: string;
      reasonCode?: string;
    },
    session: Session,
  ): Promise<MetricData> {
    internal(session);
    roles(session, ["OPS_LEAD", "COMPLIANCE_HEAD", "APPROVER"]);
    if (session.role === "OPS_LEAD" && filters.reasonCode)
      fail("运营无权按内部原因筛选。", 403);
    const s = load(),
      end = filters.to
        ? Date.parse(`${filters.to.slice(0, 10)}T23:59:59.999Z`)
        : Date.now(),
      start = filters.from ? Date.parse(filters.from) : end - 30 * DAY;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
      fail("指标日期范围无效。");
    const reasonCode = filters.reasonCode;
    const selected = s.applications.filter(
      (a) =>
        (!filters.stage || a.stage === filters.stage) &&
        (!reasonCode ||
          s.orders.some(
            (w) =>
              w.applicationId === a.id && w.reasonCodes?.includes(reasonCode),
          )),
    );
    const current = selected.filter(
        (a) =>
          Date.parse(a.createdAt) >= start && Date.parse(a.createdAt) <= end,
      ),
      previous = selected.filter(
        (a) =>
          Date.parse(a.createdAt) >= start - (end - start) &&
          Date.parse(a.createdAt) < start,
      );
    const summarize = (apps: Application[]) => {
      const ids = new Set(apps.map((a) => a.id)),
        orders = s.orders.filter((w) => ids.has(w.applicationId)),
        finished = orders.filter((w) => w.closedAt),
        qa = orders.filter((w) => w.type === "QA" && w.status === "CLOSED"),
        sup = orders.filter((w) => w.type === "SUPPLEMENT");
      return {
        orders,
        automatic:
          (apps.filter((a) => a.autoDecision === "APPROVED").length /
            (apps.length || 1)) *
          100,
        perHundred: (orders.length / (apps.length || 1)) * 100,
        sla:
          (finished.filter(
            (w) => Date.parse(w.closedAt!) <= Date.parse(w.slaDueAt),
          ).length /
            (finished.length || 1)) *
          100,
        qa:
          (qa.filter((w) => s.qa[w.id]?.consistent === false).length /
            (qa.length || 1)) *
          100,
        loss:
          (sup.filter((w) =>
            ["CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(w.status),
          ).length /
            (sup.length || 1)) *
          100,
      };
    };
    const c = summarize(current),
      p = summarize(previous);
    const config = [
      ["直通率", "automatic", "自动通过申请数 / 全部申请数", true],
      ["每百单工单数", "perHundred", "工单数 / 申请数 × 100", false],
      ["SLA 达成率", "sla", "按时完成工单数 / 已完成工单数", true],
      ["抽检差错率", "qa", "不一致抽检数 / 已完成抽检数", false],
    ] as const;
    const reasons: Record<string, number> = {};
    if (session.role !== "OPS_LEAD")
      for (const w of c.orders)
        for (const code of new Set(w.reasonCodes || []))
          reasons[code] = (reasons[code] || 0) + 1;
    const durations = current
      .filter((a) => a.stage === "LIVE" && a.stageTimes.LIVE)
      .map(
        (a) => (Date.parse(a.stageTimes.LIVE!) - Date.parse(a.createdAt)) / DAY,
      );
    const trend = Array.from(
      { length: Math.min(8, Math.max(1, Math.ceil((end - start) / DAY))) },
      (_, i) => {
        const size =
            (end - start) /
            Math.min(8, Math.max(1, Math.ceil((end - start) / DAY))),
          from = start + i * size,
          to = from + size,
          apps = current.filter(
            (a) =>
              Date.parse(a.createdAt) >= from && Date.parse(a.createdAt) < to,
          ),
          group = summarize(apps);
        return {
          label: new Date(from).toISOString().slice(5, 10),
          automatic: apps.filter((a) => a.autoDecision === "APPROVED").length,
          manual: apps.filter((a) => a.autoDecision !== "APPROVED").length,
          lossRate: Number(group.loss.toFixed(1)),
        };
      },
    );
    return {
      cards: config.map(([label, key, definition, higher]) => ({
        label,
        value: `${c[key].toFixed(1)}${key === "perHundred" ? "" : "%"}`,
        delta: `${c[key] - p[key] >= 0 ? "+" : ""}${(c[key] - p[key]).toFixed(1)}${key === "perHundred" ? "" : "pp"}`,
        good: higher ? c[key] >= p[key] : c[key] <= p[key],
        definition,
      })),
      reasons: Object.entries(reasons)
        .map(([code, count]) => ({ code, name: reasonName(code), count }))
        .sort((a, b) => b.count - a.count),
      duration: [
        { label: "1 天内", count: durations.filter((d) => d < 1).length },
        {
          label: "1–3 天",
          count: durations.filter((d) => d >= 1 && d < 3).length,
        },
        {
          label: "3–7 天",
          count: durations.filter((d) => d >= 3 && d < 7).length,
        },
        { label: "7 天以上", count: durations.filter((d) => d >= 7).length },
      ],
      lossRate: Number(c.loss.toFixed(1)),
      trend,
      total: current.length,
    };
  },
  reset(): void {
    undoTokens.clear();
    persist(createSeed());
  },
};
