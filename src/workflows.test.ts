import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { api, ApiError } from "./api";
import { sessionFor, USERS } from "./access";
import type {
  CheckItem,
  MutationAction,
  OrderDetail,
  Session,
  UploadedFile,
} from "./types";

const session = (id: string) =>
  sessionFor(USERS.find((user) => user.id === id)!);
const reviewer = session("u_1023");
const senior = session("u_1101");
const head = session("u_1201");
const secondHead = session("u_1202");
const ops = session("u_2051");
const lead = session("u_2101");
const approver = session("u_3001");
const secondApprover = session("u_3002");
const merchant = session("u_5001");
const sales = session("u_4001");
const wo = (number: number) => `WO-20261005-${String(number).padStart(4, "0")}`;
const file = (name = "Address_confirmation.pdf"): UploadedFile => ({
  id: `file-${name}`,
  name,
  type: "application/pdf",
  size: 29,
  uploadedBy: USERS.find((user) => user.id === merchant.userId)!,
  uploadedAt: "2026-10-05T08:00:00.000Z",
  pages: 1,
  content: "data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=",
});
const act = async (
  id: string,
  action: MutationAction,
  payload: Record<string, unknown>,
  actor: Session,
) => {
  const before = await api.getOrder(id, actor);
  return api.mutate(id, action, payload, before.workOrder.version, actor);
};
async function claim(id: string, actor: Session) {
  const detail = await api.getOrder(id, actor);
  if (!detail.workOrder.assignee) return act(id, "claim", {}, actor);
  assert.equal(
    detail.workOrder.assignee.id,
    actor.userId,
    "fixture must be owned by the acting account",
  );
  return detail;
}
function item(detail: OrderDetail, reason?: string): CheckItem {
  const found = detail.workOrder.checkItems?.find(
    (check) => !reason || check.reasonCodes.includes(reason),
  );
  assert.ok(
    found,
    `expected check ${reason ?? "item"} on ${detail.workOrder.id}`,
  );
  return found;
}
async function decide(
  id: string,
  check: CheckItem,
  conclusion: string,
  conclusionReason: string,
  extra: Record<string, unknown> = {},
  actor = reviewer,
) {
  return act(
    id,
    "conclusion",
    { itemId: check.id, conclusion, conclusionReason, ...extra },
    actor,
  );
}
async function request(id: string, check: CheckItem, actor = reviewer) {
  return act(
    id,
    "supplement-needs",
    {
      items: [
        {
          checkItemId: check.id,
          reasonCode: check.reasonCodes[0],
          externalText: "请提供当前注册地址的有效证明。",
          actionType: "UPLOAD",
        },
      ],
      noteToOps: "请核对材料有效期和清晰度。",
    },
    actor,
  );
}
async function supplementFor(applicationId: string) {
  const detail = await api.getApplication(applicationId, ops);
  const active = detail.workOrders?.filter(
    (order) =>
      order.type === "SUPPLEMENT" &&
      !["DONE", "WITHDRAWN", "CLOSED_NO_RESPONSE"].includes(order.status),
  );
  assert.equal(active?.length, 1, "one active supplement per application");
  return claim(active![0].id, ops);
}
async function notify(id: string) {
  const detail = await api.getOrder(id, ops);
  const contact = detail.merchant.contacts?.[0];
  assert.ok(contact);
  return act(
    id,
    "notices",
    {
      channel: "EMAIL",
      recipient: contact.email,
    },
    ops,
  );
}
async function submit(id: string, onlyIds?: string[]) {
  const detail = await api.getOrder(id, ops);
  const token = detail.workOrder.merchantToken;
  assert.ok(token, "merchant submission uses the generated scoped token");
  const portal = await api.getOrder(token, merchant);
  const responses = Object.fromEntries(
    (portal.workOrder.items ?? [])
      .filter((entry) => !onlyIds || onlyIds.includes(entry.id))
      .map((entry) => [
        entry.id,
        entry.actionType === "UPLOAD"
          ? { files: [file(`${entry.id}.pdf`)] }
          : entry.actionType === "REVERIFY"
            ? { reverified: true }
            : { value: "42 King Street, London, EC2V 8EA" },
      ]),
  );
  return api.mutate(
    token,
    "merchant-submit",
    { responses },
    portal.workOrder.version,
    merchant,
  );
}
async function usable(id: string) {
  const detail = await api.getOrder(id, ops);
  for (const entry of detail.workOrder.items ?? []) {
    if (!entry.checked)
      await act(
        id,
        "supplement-check",
        { itemId: entry.id, result: "USABLE" },
        ops,
      );
  }
}
async function rejectUnchanged(
  id: string,
  action: MutationAction,
  payload: Record<string, unknown>,
  actor: Session,
  observer = actor,
  expectedStatus?: number,
) {
  const before = await api.getOrder(id, observer);
  const applicationBefore = await api.getApplication(
    before.application.id,
    observer,
  );
  await assert.rejects(
    api.mutate(id, action, payload, before.workOrder.version, actor),
    (error) => {
      assert.ok(error instanceof ApiError);
      if (expectedStatus) assert.equal(error.status, expectedStatus);
      else assert.ok([400, 403, 409, 422].includes(error.status));
      return true;
    },
  );
  assert.deepEqual(
    await api.getOrder(id, observer),
    before,
    "rejection must not change workorder, evidence or audit",
  );
  assert.deepEqual(
    await api.getApplication(before.application.id, observer),
    applicationBefore,
    "rejection must not change application or linked orders",
  );
}

beforeEach(() => api.reset());

test("S1 blind QA hides the original decision until independent submission, then closes without correction", async () => {
  const blind = await claim(wo(1), senior);
  assert.equal(blind.workOrder.status, "BLIND");
  assert.equal(blind.qa?.originalConclusions, undefined);
  assert.equal(blind.application.autoDecision, undefined);
  const compared = await act(
    wo(1),
    "qa",
    { blindConclusions: { overall: "APPROVED" } },
    senior,
  );
  assert.equal(compared.workOrder.status, "COMPARE");
  assert.equal(compared.qa?.consistent, true);
  const done = await act(wo(1), "qa", { complete: true }, senior);
  assert.equal(done.workOrder.status, "CLOSED");
  assert.deepEqual(done.qa?.generatedIds ?? [], []);
});

test("S2 per-hit false positives preserve reasons and approve the application into channel intake", async () => {
  const detail = await claim(wo(2), reviewer);
  const check = item(detail);
  const evidence = await api.evidence(check.evidenceIds[0], reviewer);
  const hits = evidence.fields.hits as { id: string }[];
  assert.equal(hits.length, 2);
  const hitConclusions = Object.fromEntries(
    hits.map((hit, index) => [
      hit.id,
      {
        conclusion: "FALSE_POSITIVE",
        reason: index ? "标识号不同" : "注册地不同",
      },
    ]),
  );
  const decided = await decide(wo(2), check, "FALSE_POSITIVE", "标识号不同", {
    hitConclusions,
  });
  assert.deepEqual(item(decided).hitConclusions, hitConclusions);
  const done = await act(wo(2), "finalize", { outcome: "APPROVED" }, reviewer);
  assert.equal(done.workOrder.outcome, "APPROVED");
  assert.equal(done.workOrder.status, "CLOSED");
  assert.equal(done.application.stage, "CHANNEL");
  assert.equal(done.application.externalStatus, "已通过");
});

test("S3 address-only rerun preserves the accepted name decision and its immutable evidence snapshot", async () => {
  const initial = await claim(wo(3), reviewer);
  const name = item(initial, "KYB-REG-NAME");
  const address = item(initial, "KYB-REG-ADDR");
  const named = await decide(wo(3), name, "ACCEPTABLE_DIFF", "缩写");
  const nameDecision = structuredClone(item(named, "KYB-REG-NAME"));
  assert.ok(nameDecision.snapshotId);
  const snapshot = await api.snapshot(nameDecision.snapshotId, reviewer);
  const snapshotBefore = structuredClone(snapshot);
  const auditRecord = named.audit?.find(
    (entry) => entry.snapshotId === nameDecision.snapshotId,
  );
  assert.ok(auditRecord);
  const auditBefore = structuredClone(auditRecord);
  auditRecord.after = { alteredByConsumer: true };
  const persistedAudit = (await api.getOrder(wo(3), reviewer)).audit?.find(
    (entry) => entry.id === auditBefore.id,
  );
  assert.deepEqual(
    persistedAudit,
    auditBefore,
    "returned audit records must not expose writable stored history",
  );
  snapshot.checkItems.length = 0;
  snapshot.evidence.length = 0;
  assert.deepEqual(
    await api.snapshot(nameDecision.snapshotId, reviewer),
    snapshotBefore,
    "API callers cannot mutate a persisted snapshot",
  );
  await decide(wo(3), address, "REQUEST_INFO", "地址证明");
  const waiting = await request(wo(3), address);
  assert.equal(waiting.workOrder.status, "WAITING_SUPPLEMENT");
  assert.equal(waiting.workOrder.slaPaused, true);
  const supplement = await supplementFor(initial.application.id);
  await notify(supplement.workOrder.id);
  await submit(supplement.workOrder.id);
  await usable(supplement.workOrder.id);
  await act(supplement.workOrder.id, "complete-supplement", {}, ops);
  const completed = await api.getOrder(wo(3), reviewer);
  assert.equal(completed.workOrder.status, "CLOSED");
  assert.equal(completed.workOrder.outcome, "APPROVED");
  assert.equal(completed.application.stage, "CHANNEL");
  assert.deepEqual(
    item(completed, "KYB-REG-NAME"),
    nameDecision,
    "unaffected conclusion, author and snapshot must be preserved",
  );
  assert.deepEqual(completed.application.lastRerun, [address.id]);
  assert.deepEqual(
    await api.snapshot(nameDecision.snapshotId, reviewer),
    snapshotBefore,
    "later reruns cannot rewrite earlier evidence",
  );
  assert.deepEqual(
    completed.audit?.find((entry) => entry.id === auditBefore.id),
    auditBefore,
    "subsequent decisions and reruns preserve the original audit entry",
  );
});

test("S4 PEP needs two distinct management approvers and persists second approval conditions", async () => {
  await act(wo(4), "finalize", { outcome: "PENDING_APPROVAL" }, reviewer);
  const first = await act(
    wo(4),
    "approval",
    { decision: "APPROVED" },
    approver,
  );
  assert.equal(first.workOrder.status, "PENDING_APPROVAL");
  assert.notEqual(first.application.externalStatus, "已通过");
  await rejectUnchanged(
    wo(4),
    "approval",
    { decision: "APPROVED" },
    approver,
    reviewer,
  );
  const conditions = {
    singleLimit: 10000,
    monthlyLimit: 180000,
    reservePct: 10,
    reserveDays: 90,
    reviewDays: 180,
  };
  const final = await act(
    wo(4),
    "approval",
    { decision: "APPROVED_WITH_CONDITIONS", conditions },
    secondApprover,
  );
  assert.equal(final.workOrder.status, "CLOSED");
  assert.equal(final.workOrder.outcome, "APPROVED_WITH_CONDITIONS");
  assert.deepEqual(final.merchant.conditions, conditions);
  assert.equal(final.application.stage, "CHANNEL");
  const actors = new Set(
    final.approvalDecisions?.flatMap((decision) =>
      decision.approvers.map((person) => person.id),
    ),
  );
  assert.deepEqual(actors, new Set([approver.userId, secondApprover.userId]));
});

test("S5 original-media access is audited and fraud rejection blacklists without disclosing the cause externally", async () => {
  const initial = await claim(wo(5), reviewer);
  const check = item(initial);
  const evidence = await api.evidence(check.evidenceIds[0], reviewer);
  const media = evidence.mediaRefs[0];
  assert.ok(media);
  assert.equal(
    media.url,
    undefined,
    "ordinary evidence reads must not expose an original image",
  );
  assert.equal(media.file, undefined);
  const revealed = await act(
    wo(5),
    "media",
    { evidenceId: evidence.id, mediaId: media.id },
    reviewer,
  );
  const access = revealed.audit?.find((entry) => entry.action === "media");
  assert.ok(
    access,
    "image access must be recorded before revealing the original",
  );
  assert.equal(access.actor.id, reviewer.userId);
  const original = revealed.evidence
    ?.find((entry) => entry.id === evidence.id)
    ?.mediaRefs.find((entry) => entry.id === media.id);
  assert.ok(
    original?.url || original?.file?.content || original?.file?.url,
    "logged access returns the actual original image",
  );
  await decide(wo(5), check, "FRAUD_DECLINE", "证件篡改");
  const done = await act(wo(5), "finalize", { outcome: "DECLINED" }, reviewer);
  assert.equal(done.workOrder.outcome, "DECLINED");
  assert.equal(
    (await api.getApplication(done.application.id, head)).merchant.blacklisted,
    true,
  );
  const external = await api.getApplication(done.application.id, sales);
  assert.equal(external.application.externalStatus, "未通过");
  assert.doesNotMatch(
    JSON.stringify(external),
    /FRAUD_DECLINE|KYC-ID-TAMPER|证件篡改|blacklisted/,
  );
});

test("S6 true match freezes, cannot be finalized directly, and needs two heads to reject", async () => {
  const initial = await claim(wo(6), reviewer);
  const check = item(initial);
  const evidence = await api.evidence(check.evidenceIds[0], reviewer);
  const hitConclusions = Object.fromEntries(
    (evidence.fields.hits as { id: string }[]).map((hit) => [
      hit.id,
      { conclusion: "TRUE_POSITIVE", reason: "标识号一致" },
    ]),
  );
  const decided = await decide(wo(6), check, "TRUE_POSITIVE", "标识号一致", {
    hitConclusions,
  });
  if (decided.workOrder.status === "IN_PROGRESS")
    await act(wo(6), "escalate", { reason: "标识号一致" }, reviewer);
  const frozen = await api.getOrder(wo(6), reviewer);
  assert.equal(frozen.workOrder.status, "COMPLIANCE_HOLD");
  assert.equal(frozen.workOrder.slaPaused, true);
  await rejectUnchanged(
    wo(6),
    "finalize",
    { outcome: "APPROVED", overrideReason: "人工确认" },
    reviewer,
  );
  const application = await api.getApplication(initial.application.id, head);
  const restricted = application.workOrders?.find(
    (order) => order.type === "RESTRICTED" && order.status !== "CLOSED",
  );
  assert.ok(restricted);
  await claim(restricted.id, head);
  const first = await act(
    restricted.id,
    "restricted-decision",
    { decision: "DECLINE", reason: "标识号一致" },
    head,
  );
  assert.equal(first.workOrder.status, "PENDING_SECOND");
  await rejectUnchanged(
    restricted.id,
    "restricted-decision",
    { decision: "DECLINE", reason: "再次确认" },
    head,
  );
  const second = await act(
    restricted.id,
    "restricted-decision",
    { decision: "DECLINE", reason: "独立核对标识号一致" },
    secondHead,
  );
  assert.equal(second.workOrder.status, "CLOSED");
  assert.equal((await api.getOrder(wo(6), head)).workOrder.outcome, "DECLINED");
  const external = await api.getApplication(initial.application.id, sales);
  assert.equal(external.application.externalStatus, "未通过");
  assert.doesNotMatch(
    JSON.stringify(external),
    /TRUE_POSITIVE|restrictedReason|restrictedDecisions|标识号一致/,
  );
});

test("S7 channel mapping, merchant material and resubmission return to the channel, not compliance rerun", async () => {
  const initial = await claim(wo(7), lead);
  const mapped = await act(
    wo(7),
    "channel-mapping",
    { reasonCode: "CH-MORE-INFO", isRiskType: false },
    lead,
  );
  assert.equal(mapped.channel?.mappedReasonCode, "CH-MORE-INFO");
  assert.equal(mapped.channel?.isRiskType, false);
  await act(
    wo(7),
    "channel-supplement",
    {
      items: [
        {
          externalText: "请提供最近三个月的银行账户证明。",
          actionType: "UPLOAD",
        },
      ],
    },
    lead,
  );
  const supplement = await supplementFor(initial.application.id);
  await notify(supplement.workOrder.id);
  await submit(supplement.workOrder.id);
  await usable(supplement.workOrder.id);
  await act(supplement.workOrder.id, "complete-supplement", {}, ops);
  const resumed = await api.getOrder(wo(7), lead);
  assert.equal(resumed.workOrder.status, "IN_PROGRESS");
  assert.deepEqual(
    resumed.application.lastRerun ?? [],
    initial.application.lastRerun ?? [],
  );
  const documents = (resumed.channel?.requiredDocuments ?? []).map((name) => ({
    name,
    value: "已核实补交材料",
    file: file(`${name}.pdf`),
  }));
  const resubmitted = await act(wo(7), "channel-resubmit", { documents }, lead);
  assert.equal(resubmitted.workOrder.status, "WAITING_CHANNEL");
  assert.equal(resubmitted.workOrder.slaPaused, true);
});

test("S8 late hard rejection needs an ignore reason, and ignoring the alert is not permission to approve", async () => {
  await rejectUnchanged(wo(8), "late-decline", { action: "ignore" }, reviewer);
  const ignored = await act(
    wo(8),
    "late-decline",
    { action: "ignore", reason: "等待登记机构出具复核证明" },
    reviewer,
  );
  assert.equal(ignored.workOrder.hardRejectDismissed, true);
  await rejectUnchanged(
    wo(8),
    "finalize",
    { outcome: "APPROVED", overrideReason: "忽略提示后尝试通过" },
    reviewer,
  );
  const rejected = await act(
    wo(8),
    "late-decline",
    { action: "confirm" },
    reviewer,
  );
  assert.equal(rejected.workOrder.status, "CLOSED");
  assert.equal(rejected.application.externalStatus, "未通过");
});

test("S9 quality return requests only the rejected item and preserves the accepted response", async () => {
  const initial = await api.getOrder(wo(9), ops);
  assert.equal(initial.workOrder.items?.length, 2);
  const [good, blurred] = initial.workOrder.items!;
  await act(
    wo(9),
    "supplement-check",
    { itemId: good.id, result: "USABLE" },
    ops,
  );
  await act(
    wo(9),
    "supplement-check",
    { itemId: blurred.id, result: "REJECTED", reason: "模糊" },
    ops,
  );
  await rejectUnchanged(wo(9), "complete-supplement", {}, ops);
  const acceptedBefore = (await api.getOrder(wo(9), ops)).workOrder.items!.find(
    (entry) => entry.id === good.id,
  )!;
  const returned = await act(wo(9), "return-to-merchant", {}, ops);
  assert.equal(returned.workOrder.status, "WAITING_MERCHANT");
  assert.deepEqual(
    returned.workOrder.items!.find((entry) => entry.id === good.id),
    acceptedBefore,
  );
  const portal = await api.getOrder("MT-S9", merchant);
  const actionable = portal.workOrder.items!.filter((entry) => !entry.checked);
  assert.deepEqual(
    actionable.map((entry) => entry.id),
    [blurred.id],
  );
  await submit(wo(9), [blurred.id]);
  await rejectUnchanged(wo(9), "complete-supplement", {}, ops);
  await act(
    wo(9),
    "supplement-check",
    { itemId: blurred.id, result: "USABLE" },
    ops,
  );
  const done = await act(wo(9), "complete-supplement", {}, ops);
  assert.equal(done.workOrder.status, "DONE");
  assert.deepEqual(
    done.workOrder.items!.find((entry) => entry.id === good.id),
    acceptedBefore,
  );
});

test("S10 cross-role deep links and mutations are forbidden even with a current version", async () => {
  const external = await api.getApplication("APP-88206", ops);
  assert.doesNotMatch(
    JSON.stringify(external),
    /SCR-WL|SCREENING|evidenceIds|reasonCodes|restrictedReason|complianceNote/,
  );
  await assert.rejects(api.getOrder(wo(6), ops), { status: 403 });
  const supplement = await api.getOrder(wo(9), reviewer);
  assert.equal(supplement.merchant.contacts, undefined);
  await rejectUnchanged(
    wo(9),
    "contact-logs",
    { channel: "PHONE", summary: "联系商户" },
    reviewer,
    ops,
    403,
  );
  await rejectUnchanged(
    wo(9),
    "notices",
    { channel: "EMAIL", recipient: "contact@example.test" },
    reviewer,
    ops,
    403,
  );
});

test("S11 first extension takes effect, second waits for an independent lead approval", async () => {
  const initial = await claim(wo(11), reviewer);
  const check = item(initial);
  await decide(wo(11), check, "REQUEST_INFO", "核验材料不足");
  await request(wo(11), check);
  const supplement = await supplementFor(initial.application.id);
  const sent = await notify(supplement.workOrder.id);
  assert.ok(sent.workOrder.dueAt);
  const firstDue = new Date(
    Date.parse(sent.workOrder.dueAt) + 7 * 86400000,
  ).toISOString();
  const first = await act(
    supplement.workOrder.id,
    "extensions",
    { dueAt: firstDue, reason: "登记机构出具材料需要时间" },
    ops,
  );
  assert.equal(first.workOrder.dueAt, firstDue);
  assert.equal(first.workOrder.extensions?.at(-1)?.status, "APPROVED");
  const secondDue = new Date(Date.parse(firstDue) + 3 * 86400000).toISOString();
  const second = await act(
    supplement.workOrder.id,
    "extensions",
    { dueAt: secondDue, reason: "等待原件寄达" },
    ops,
  );
  assert.equal(second.workOrder.dueAt, firstDue);
  const extension = second.workOrder.extensions?.at(-1);
  assert.ok(extension);
  assert.equal(extension.status, "PENDING");
  const queue = await api.listOrders(
    { view: "extensions", tab: "pending" },
    lead,
  );
  assert.ok(queue.rows.some((row) => row.id === supplement.workOrder.id));
  await rejectUnchanged(
    supplement.workOrder.id,
    "approve-extension",
    { extensionId: extension.id, approved: true },
    ops,
    ops,
    403,
  );
  const approved = await act(
    supplement.workOrder.id,
    "approve-extension",
    { extensionId: extension.id, approved: true },
    lead,
  );
  assert.equal(approved.workOrder.dueAt, secondDue);
  assert.equal(
    approved.workOrder.extensions?.at(-1)?.approvedBy?.id,
    lead.userId,
  );
});

test("S12 upstream risk cannot be bypassed by resubmission, switching, termination or relabeling", async () => {
  const initial = await api.getOrder(wo(12), ops);
  await rejectUnchanged(
    wo(12),
    "channel-resubmit",
    { documents: [{ name: "说明", value: "已修正" }] },
    ops,
  );
  await rejectUnchanged(wo(12), "channel-switch", { channelId: "CH-ALT" }, ops);
  await rejectUnchanged(
    wo(12),
    "channel-terminate",
    { reason: "改用其他渠道" },
    lead,
    ops,
  );
  await rejectUnchanged(
    wo(12),
    "channel-mapping",
    { reasonCode: "CH-MORE-INFO", isRiskType: false },
    lead,
    ops,
  );
  const escalated = await act(
    wo(12),
    "channel-escalate",
    { reason: "请合规判断上游风险原因" },
    ops,
  );
  assert.equal(escalated.workOrder.status, "WAITING_COMPLIANCE");
  assert.equal(escalated.workOrder.slaPaused, true);
  const application = await api.getApplication(
    initial.application.id,
    reviewer,
  );
  const review = application.workOrders?.find(
    (order) => order.type === "REVIEW" && order.status !== "CLOSED",
  );
  assert.ok(review);
  const reviewDetail = await api.getOrder(review.id, reviewer);
  assert.ok(
    reviewDetail.workOrder.checkItems?.some((check) =>
      check.reasonCodes.includes("CH-REJECT-POLICY"),
    ),
  );
  await rejectUnchanged(wo(12), "channel-switch", { channelId: "CH-ALT" }, ops);
});

test("same-application compliance and channel requests merge into one notification and route each source independently", async () => {
  const review = await api.getOrder(wo(392), reviewer);
  const check = item(review);
  for (const other of review.workOrder.checkItems ?? [])
    if (other.id !== check.id && other.status === "PENDING")
      await decide(wo(392), other, "ACCEPTABLE_DIFF", "格式");
  await decide(wo(392), check, "REQUEST_INFO", "地址证明");
  await request(wo(392), check);
  await act(
    wo(393),
    "channel-mapping",
    { reasonCode: "CH-REJECT-DOCS", isRiskType: false },
    lead,
  );
  await act(
    wo(393),
    "channel-supplement",
    { items: [{ externalText: "请提供银行账户证明。", actionType: "UPLOAD" }] },
    ops,
  );
  const supplement = await supplementFor("APP-88392");
  const sources = new Set(
    supplement.workOrder.items?.map((entry) => entry.source),
  );
  assert.deepEqual(sources, new Set(["COMPLIANCE", "CHANNEL"]));
  const beforeNotices = supplement.workOrder.contactLog?.length ?? 0;
  const notified = await notify(supplement.workOrder.id);
  assert.equal(
    notified.workOrder.contactLog?.length,
    beforeNotices + 1,
    "a merged demand sends one outward notification",
  );
  assert.ok(
    notified.workOrder.items?.every((entry) => entry.status === "SENT"),
  );
  await submit(supplement.workOrder.id);
  await usable(supplement.workOrder.id);
  await act(supplement.workOrder.id, "complete-supplement", {}, ops);
  const resumedReview = await api.getOrder(wo(392), reviewer);
  const resumedChannel = await api.getOrder(wo(393), ops);
  assert.equal(resumedChannel.workOrder.status, "IN_PROGRESS");
  assert.equal(resumedReview.workOrder.status, "CLOSED");
  assert.deepEqual(resumedReview.application.lastRerun, [check.id]);
});

test("hard auto-rejection cannot be overridden through senior or head review requests", async () => {
  for (const actor of [senior, head]) {
    const before = await api.getApplication("APP-88391", actor);
    await assert.rejects(
      api.applicationAction(
        before.application.id,
        "review-request",
        { reason: "要求复核", overrideReason: "主管授权" },
        before.application.version,
        actor,
      ),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.ok([400, 403, 409, 422].includes(error.status));
        return true;
      },
    );
    assert.deepEqual(
      await api.getApplication(before.application.id, actor),
      before,
    );
  }
});

test("stale workorder and application versions reject atomically with the current version", async () => {
  const before = await api.getOrder(wo(3), reviewer);
  const current = await act(wo(3), "claim", {}, reviewer);
  await assert.rejects(
    api.mutate(
      wo(3),
      "note",
      { note: "过期更新" },
      before.workOrder.version,
      reviewer,
    ),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.currentVersion, current.workOrder.version);
      return true;
    },
  );
  assert.deepEqual(await api.getOrder(wo(3), reviewer), current);
  const appBefore = await api.getApplication("APP-88203", lead);
  const appCurrent = await api.applicationAction(
    appBefore.application.id,
    "key-merchant",
    {
      isKeyMerchant: !appBefore.application.isKeyMerchant,
      reason: "服务等级调整",
    },
    appBefore.application.version,
    lead,
  );
  await assert.rejects(
    api.applicationAction(
      appBefore.application.id,
      "key-merchant",
      {
        isKeyMerchant: appBefore.application.isKeyMerchant,
        reason: "过期更新",
      },
      appBefore.application.version,
      lead,
    ),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 409);
      assert.equal(error.currentVersion, appCurrent.application.version);
      return true;
    },
  );
  assert.deepEqual(
    await api.getApplication(appBefore.application.id, lead),
    appCurrent,
  );
});

for (const transition of [
  {
    name: "queued review cannot finalize",
    id: wo(3),
    actor: reviewer,
    action: "finalize",
    payload: { outcome: "APPROVED" },
  },
  {
    name: "queued review cannot decide before claiming",
    id: wo(3),
    actor: reviewer,
    action: "conclusion",
    payload: {
      itemId: "CI-3-1",
      conclusion: "ACCEPTABLE_DIFF",
      conclusionReason: "缩写",
    },
  },
  {
    name: "unsubmitted review cannot receive an approval",
    id: wo(4),
    actor: approver,
    action: "approval",
    payload: { decision: "APPROVED" },
    observer: reviewer,
  },
  {
    name: "unclaimed QA cannot submit independent conclusions",
    id: wo(1),
    actor: senior,
    action: "qa",
    payload: { blindConclusions: { overall: "APPROVED" } },
  },
  {
    name: "unreviewed material cannot complete a supplement",
    id: wo(9),
    actor: ops,
    action: "complete-supplement",
    payload: {},
  },
  {
    name: "unrejected supplement cannot return material",
    id: wo(9),
    actor: ops,
    action: "return-to-merchant",
    payload: {},
  },
] as const) {
  test(`illegal transition: ${transition.name}`, async () => {
    await rejectUnchanged(
      transition.id,
      transition.action,
      transition.payload,
      transition.actor,
      "observer" in transition ? transition.observer : transition.actor,
    );
  });
}

test("terminal states cannot be reopened by ordinary claim, conclusion, notification or quality actions", async () => {
  await claim(wo(5), reviewer);
  const check = item(await api.getOrder(wo(5), reviewer));
  await decide(wo(5), check, "FRAUD_DECLINE", "证件篡改");
  await act(wo(5), "finalize", { outcome: "DECLINED" }, reviewer);
  await rejectUnchanged(wo(5), "claim", {}, reviewer);
  await rejectUnchanged(
    wo(5),
    "conclusion",
    { itemId: check.id, conclusion: "NORMAL", conclusionReason: "光线" },
    reviewer,
  );
  await usable(wo(9));
  await act(wo(9), "complete-supplement", {}, ops);
  await rejectUnchanged(wo(9), "claim", {}, ops);
  await rejectUnchanged(
    wo(9),
    "supplement-check",
    {
      itemId: (await api.getOrder(wo(9), ops)).workOrder.items![0].id,
      result: "REJECTED",
      reason: "模糊",
    },
    ops,
  );
});

test("quality-check state rejects an otherwise valid first extension without recording a request", async () => {
  const initial = await api.getOrder(wo(9), ops);
  assert.ok(initial.workOrder.dueAt);
  const dueAt = new Date(
    Date.parse(initial.workOrder.dueAt) + 86400000,
  ).toISOString();
  await rejectUnchanged(
    wo(9),
    "extensions",
    { dueAt, reason: "等待材料" },
    ops,
    ops,
    409,
  );
});

test("soft auto-rejection needs two different senior confirmations before approval takes effect", async () => {
  const initial = await api.getApplication("APP-88390", senior);
  const requested = await api.applicationAction(
    initial.application.id,
    "review-request",
    { reason: "取得官方更正资料" },
    initial.application.version,
    senior,
  );
  const review = requested.workOrders?.find(
    (order) => order.type === "REVIEW" && order.status !== "CLOSED",
  );
  assert.ok(review);
  await claim(review.id, senior);
  const first = await act(
    review.id,
    "finalize",
    { outcome: "APPROVED" },
    senior,
  );
  assert.notEqual(first.application.externalStatus, "已通过");
  await rejectUnchanged(review.id, "claim", {}, senior, senior, 403);
  await claim(review.id, head);
  const second = await act(
    review.id,
    "finalize",
    { outcome: "APPROVED" },
    head,
  );
  assert.equal(second.workOrder.status, "CLOSED");
  assert.equal(second.application.externalStatus, "已通过");
});

test("submitted approval and channel-wait states cannot be reprocessed by their original owners", async () => {
  await act(wo(4), "finalize", { outcome: "PENDING_APPROVAL" }, reviewer);
  await rejectUnchanged(
    wo(4),
    "finalize",
    { outcome: "PENDING_APPROVAL" },
    reviewer,
  );
  await rejectUnchanged(wo(4), "release", { reason: "重新领取" }, reviewer);
  await act(
    wo(393),
    "channel-mapping",
    { reasonCode: "CH-REJECT-DOCS", isRiskType: false },
    lead,
  );
  const channel = await api.getOrder(wo(393), ops);
  const documents = channel.channel!.requiredDocuments.map((name) => ({
    name,
    value: "材料已核实",
    file: file(`${name}.pdf`),
  }));
  await act(wo(393), "channel-resubmit", { documents }, ops);
  await rejectUnchanged(wo(393), "channel-resubmit", { documents }, ops);
  await rejectUnchanged(
    wo(393),
    "channel-supplement",
    { items: [{ externalText: "请提供地址证明。", actionType: "UPLOAD" }] },
    ops,
  );
});

test("restricted confirmation disagreement cannot silently change the first decision", async () => {
  await claim(wo(6), reviewer);
  await act(wo(6), "escalate", { reason: "独立核实筛查命中" }, reviewer);
  const application = await api.getApplication("APP-88206", head);
  const restricted = application.workOrders!.find(
    (order) => order.type === "RESTRICTED",
  )!;
  await claim(restricted.id, head);
  await act(
    restricted.id,
    "restricted-decision",
    { decision: "EXCLUDE", reason: "登记标识号不同" },
    head,
  );
  await rejectUnchanged(
    restricted.id,
    "restricted-decision",
    { decision: "DECLINE", reason: "不同处置意见" },
    secondHead,
    head,
    409,
  );
  const excluded = await act(
    restricted.id,
    "restricted-decision",
    { decision: "EXCLUDE", reason: "第二人核实登记标识号不同" },
    secondHead,
  );
  assert.equal(excluded.workOrder.status, "CLOSED");
  const resumed = await api.getOrder(wo(6), reviewer);
  assert.equal(resumed.workOrder.status, "IN_PROGRESS");
  assert.equal(resumed.workOrder.slaPaused, false);
  assert.doesNotMatch(
    JSON.stringify(resumed),
    /restrictedReason|restrictedDecisions|登记标识号不同/,
  );
  await rejectUnchanged(
    restricted.id,
    "restricted-decision",
    { decision: "CASE", reason: "结束后改判" },
    head,
    head,
    409,
  );
});

test("quality-check state rejects an otherwise complete initial merchant notice", async () => {
  const detail = await api.getOrder(wo(9), ops);
  await rejectUnchanged(
    wo(9),
    "notices",
    {
      channel: "EMAIL",
      recipient: detail.merchant.contacts![0].email,
    },
    ops,
    ops,
    409,
  );
});

test("watchlist aggregate cannot be forged by a client to bypass a true match", async () => {
  const detail = await claim(wo(6), reviewer);
  const check = item(detail);
  const hits = detail.evidence!.flatMap(
    (evidence) => evidence.fields.hits ?? [],
  );
  const result = await decide(wo(6), check, "FALSE_POSITIVE", "名称不同", {
    hitConclusions: Object.fromEntries(
      hits.map((hit) => [
        hit.id,
        { conclusion: "TRUE_POSITIVE", reason: "标识号一致" },
      ]),
    ),
  });
  assert.equal(item(result).conclusion, "TRUE_POSITIVE");
  await rejectUnchanged(
    wo(6),
    "finalize",
    { outcome: "APPROVED" },
    reviewer,
    reviewer,
    409,
  );
});

test("next-case acquisition follows supplied order without stealing another reviewer work", async () => {
  const other = session("u_1024");
  const selected = await api.claimNext([wo(8), wo(3), wo(5)], other);
  assert.equal(selected?.workOrder.id, wo(3));
  assert.equal(selected?.workOrder.assignee?.id, other.userId);
  assert.equal(
    (await api.getOrder(wo(8), reviewer)).workOrder.assignee?.id,
    reviewer.userId,
  );
  const following = await api.claimNext([wo(8), wo(3), wo(5)], other, wo(3));
  assert.equal(following?.workOrder.id, wo(5));
  assert.equal(await api.claimNext([wo(3), wo(5)], reviewer), null);
});

test("personal action count excludes public work and decreases when work waits for a merchant", async () => {
  const before = await api.actionCounts(reviewer);
  const claimed = await claim(wo(3), reviewer);
  assert.equal(
    (await api.actionCounts(reviewer)).review,
    (before.review ?? 0) + 1,
  );
  const address = item(claimed, "KYB-REG-ADDR");
  await decide(wo(3), address, "REQUEST_INFO", "地址证明");
  await request(wo(3), address);
  assert.equal((await api.actionCounts(reviewer)).review, before.review ?? 0);
  const rows = await api.listOrders({ view: "ops", tab: "send" }, ops);
  const replied = await api.listOrders({ view: "ops", tab: "replied" }, ops);
  assert.equal(
    (await api.actionCounts(ops)).ops,
    [...rows.rows, ...replied.rows].filter(
      (row) => row.assignee?.id === ops.userId,
    ).length,
  );
});

test("German merchant notice is localized and first-send time starts the seven-day deadline", async () => {
  const review = await claim(wo(11), reviewer);
  await request(wo(11), item(review));
  const supplement = await supplementFor(review.application.id);
  assert.equal(supplement.workOrder.dueAt, undefined);
  const preview = await api.previewNotice(
    supplement.workOrder.id,
    { channel: "EMAIL" },
    ops,
  );
  assert.equal(preview.language, "en");
  assert.doesNotMatch(
    preview.body + preview.subject + preview.salutation,
    /[\u4e00-\u9fff]/,
  );
  assert.equal(new URL(preview.link).hostname, "merchant.futurepay.example");
  assert.match(preview.sender, /@/);
  assert.equal(
    (await api.getOrder(supplement.workOrder.id, ops)).workOrder.dueAt,
    undefined,
  );
  const sent = await notify(supplement.workOrder.id);
  assert.equal(
    Date.parse(sent.workOrder.dueAt!) - Date.parse(sent.workOrder.sentAt!),
    7 * 86400000,
  );
  const reminded = await act(supplement.workOrder.id, "reminders", {}, ops);
  assert.equal(reminded.workOrder.dueAt, sent.workOrder.dueAt);
});

test("undo restores a conclusion but retains its immutable decision snapshot and audit record", async () => {
  const initial = await claim(wo(3), reviewer);
  const check = item(initial, "KYB-REG-NAME");
  const saved = await decide(wo(3), check, "ACCEPTABLE_DIFF", "缩写");
  assert.ok(saved.undo);
  const decidedCheck = item(saved, "KYB-REG-NAME");
  const snapshot = await api.snapshot(decidedCheck.snapshotId!, reviewer);
  const audit = saved.audit!.find(
    (entry) => entry.snapshotId === decidedCheck.snapshotId,
  )!;
  const restored = await api.undo(saved.undo.token, reviewer);
  assert.equal(item(restored, "KYB-REG-NAME").status, "PENDING");
  assert.equal(item(restored, "KYB-REG-NAME").conclusion, undefined);
  assert.deepEqual(await api.snapshot(snapshot.id, reviewer), snapshot);
  assert.deepEqual(
    restored.audit?.find((entry) => entry.id === audit.id),
    audit,
  );
  await assert.rejects(api.undo(saved.undo.token, reviewer));
});

test("undo refuses another actor, expiry and a superseding mutation without losing the newer note", async () => {
  const saved = await act(
    wo(9),
    "note",
    { note: "已联系商户确认材料有效期" },
    ops,
  );
  assert.ok(saved.undo);
  await assert.rejects(api.undo(saved.undo.token, lead));
  const newer = await act(wo(9), "note", { note: "商户已承诺补交原件" }, ops);
  assert.ok(newer.undo);
  await assert.rejects(api.undo(saved.undo.token, ops));
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(newer.undo!.expiresAt) + 1;
    await assert.rejects(api.undo(newer.undo.token, ops));
  } finally {
    Date.now = originalNow;
  }
  assert.equal(
    (await api.getOrder(wo(9), ops)).workOrder.opsNote,
    "商户已承诺补交原件",
  );
});
