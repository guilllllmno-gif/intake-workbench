import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { api, ApiError } from "./api";
import { sessionFor, USERS } from "./access";
import type {
  MutationAction,
  OrderDetail,
  Role,
  Session,
  UploadedFile,
} from "./types";

const identity = (id: string) =>
  sessionFor(USERS.find((user) => user.id === id)!);
const actors: Session[] = [
  "u_2051",
  "u_2101",
  "u_1023",
  "u_1101",
  "u_1201",
  "u_3001",
  "u_4001",
  "u_5001",
].map(identity);
const ops = identity("u_2051");
const lead = identity("u_2101");
const reviewer = identity("u_1023");
const head = identity("u_1201");
const senior = identity("u_1101");
const compliance: Role[] = [
  "COMPLIANCE_REVIEWER",
  "COMPLIANCE_SENIOR",
  "COMPLIANCE_HEAD",
];
const operations: Role[] = ["OPS_AGENT", "OPS_LEAD"];
const internal: Role[] = [...operations, ...compliance, "APPROVER", "SALES"];
const id = (number: number) => `WO-20261005-${String(number).padStart(4, "0")}`;
const s1Conclusions = { overall: "APPROVED" };
const upload: UploadedFile = {
  id: "permission-proof",
  name: "Signed_confirmation.pdf",
  size: 29,
  type: "application/pdf",
  pages: 1,
  uploadedAt: "2026-10-05T08:00:00.000Z",
  uploadedBy: USERS.find((user) => user.id === ops.userId)!,
  content: "data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y=",
};
async function act(
  orderId: string,
  action: MutationAction,
  payload: Record<string, unknown>,
  actor: Session,
) {
  const before = await api.getOrder(orderId, actor);
  return api.mutate(orderId, action, payload, before.workOrder.version, actor);
}
async function take(orderId: string, actor: Session) {
  const detail = await api.getOrder(orderId, actor);
  if (!detail.workOrder.assignee) return act(orderId, "claim", {}, actor);
  if (detail.workOrder.assignee.id !== actor.userId) {
    await act(
      orderId,
      "assign",
      { assigneeId: actor.userId },
      operations.includes(actor.role) ? lead : head,
    );
  }
  return api.getOrder(orderId, actor);
}
async function mappedChannel(actor: Session, reasonCode = "CH-REJECT-DOCS") {
  await take(id(393), actor);
  await act(
    id(393),
    "channel-mapping",
    { reasonCode, isRiskType: false },
    lead,
  );
  return api.getOrder(id(393), actor);
}
async function openSupplement(actor = ops) {
  const review = await take(id(3), reviewer);
  const check = review.workOrder.checkItems!.find((entry) =>
    entry.reasonCodes.includes("KYB-REG-ADDR"),
  )!;
  await act(
    id(3),
    "conclusion",
    {
      itemId: check.id,
      conclusion: "REQUEST_INFO",
      conclusionReason: "地址证明",
    },
    reviewer,
  );
  await act(
    id(3),
    "supplement-needs",
    {
      items: [
        {
          checkItemId: check.id,
          reasonCode: "KYB-REG-ADDR",
          externalText: {
            zh: "请补充有效地址证明。",
            en: "Provide valid proof of address.",
          },
          actionType: "UPLOAD",
        },
      ],
    },
    reviewer,
  );
  const application = await api.getApplication(review.application.id, ops);
  const supplement = application.workOrders!.find(
    (order) => order.type === "SUPPLEMENT" && order.status === "TO_SEND",
  );
  assert.ok(supplement);
  return take(supplement.id, actor);
}
async function waitingSupplement(actor = ops) {
  const detail = await openSupplement(actor);
  return act(
    detail.workOrder.id,
    "notices",
    {
      channel: "EMAIL",
      recipient: detail.merchant.contacts![0].email,
    },
    actor,
  );
}
async function restricted() {
  await take(id(6), reviewer);
  await act(id(6), "escalate", { reason: "需负责人核实筛查命中" }, reviewer);
  const application = await api.getApplication("APP-88206", head);
  const order = application.workOrders!.find(
    (entry) => entry.type === "RESTRICTED" && entry.status !== "CLOSED",
  );
  assert.ok(order);
  return take(order.id, head);
}
function assertKeysAbsent(value: unknown, keys: readonly string[]) {
  const serialized = JSON.stringify(value);
  for (const key of keys)
    assert.ok(
      !serialized.includes(`"${key}":`),
      `prohibited field ${key} leaked in serialized API response`,
    );
}
async function denied(call: Promise<unknown>) {
  await assert.rejects(call, (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    return true;
  });
}

beforeEach(() => api.reset());

interface MutationCell {
  name: string;
  action: MutationAction;
  allowed: Role[];
  prepare: (actor: Session) => Promise<{
    detail: OrderDetail;
    payload: Record<string, unknown>;
    verify: (result: OrderDetail) => void;
  }>;
}
const mutations: MutationCell[] = [
  {
    name: "下检查项结论",
    action: "conclusion",
    allowed: compliance,
    prepare: async (actor) => {
      const detail = await take(id(3), actor);
      const check = detail.workOrder.checkItems!.find((entry) =>
        entry.reasonCodes.includes("KYB-REG-NAME"),
      )!;
      return {
        detail,
        payload: {
          itemId: check.id,
          conclusion: "ACCEPTABLE_DIFF",
          conclusionReason: "缩写",
        },
        verify: (result) => {
          const decided = result.workOrder.checkItems!.find(
            (entry) => entry.id === check.id,
          )!;
          assert.equal(decided.conclusion, "ACCEPTABLE_DIFF");
          assert.equal(decided.decidedBy?.id, actor.userId);
        },
      };
    },
  },
  {
    name: "结案",
    action: "finalize",
    allowed: compliance,
    prepare: async (actor) => {
      const detail = await take(id(5), actor);
      await act(
        id(5),
        "conclusion",
        {
          itemId: detail.workOrder.checkItems![0].id,
          conclusion: "FRAUD_DECLINE",
          conclusionReason: "证件篡改",
        },
        actor,
      );
      return {
        detail: await api.getOrder(id(5), actor),
        payload: { outcome: "DECLINED" },
        verify: (result) => {
          assert.equal(result.workOrder.status, "CLOSED");
          assert.equal(result.application.externalStatus, "未通过");
        },
      };
    },
  },
  {
    name: "提补件需求",
    action: "supplement-needs",
    allowed: compliance,
    prepare: async (actor) => {
      const detail = await take(id(3), actor);
      const check = detail.workOrder.checkItems![1];
      return {
        detail,
        payload: {
          items: [
            {
              checkItemId: check.id,
              reasonCode: check.reasonCodes[0],
              externalText: {
                zh: "请提供有效地址证明。",
                en: "Provide valid proof of address.",
              },
              actionType: "UPLOAD",
            },
          ],
        },
        verify: (result) =>
          assert.equal(result.workOrder.status, "WAITING_SUPPLEMENT"),
      };
    },
  },
  {
    name: "编辑并发送补件通知",
    action: "notices",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await openSupplement(actor);
      return {
        detail,
        payload: {
          channel: "EMAIL",
          recipient: detail.merchant.contacts![0].email,
        },
        verify: (result) => {
          assert.equal(result.workOrder.status, "WAITING_MERCHANT");
          assert.ok(result.workOrder.sentAt);
        },
      };
    },
  },
  {
    name: "催办",
    action: "reminders",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await waitingSupplement(actor);
      return {
        detail,
        payload: { channel: "EMAIL" },
        verify: (result) => {
          assert.equal(
            result.workOrder.remindersSent,
            (detail.workOrder.remindersSent ?? 0) + 1,
          );
          assert.equal(
            result.workOrder.contactLog?.length,
            (detail.workOrder.contactLog?.length ?? 0) + 1,
          );
        },
      };
    },
  },
  {
    name: "记录沟通",
    action: "contact-logs",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await take(id(9), actor);
      return {
        detail,
        payload: {
          channel: "PHONE",
          contact: detail.merchant.contacts![0].name,
          result: "CONNECTED",
          summary: "商户确认周五补交清晰文件",
        },
        verify: (result) => {
          assert.equal(
            result.workOrder.contactLog?.at(-1)?.summary,
            "商户确认周五补交清晰文件",
          );
          assert.equal(
            result.workOrder.contactLog?.at(-1)?.by.id,
            actor.userId,
          );
        },
      };
    },
  },
  {
    name: "齐套检查",
    action: "supplement-check",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await take(id(9), actor);
      const check = detail.workOrder.items![0];
      return {
        detail,
        payload: { itemId: check.id, result: "USABLE" },
        verify: (result) =>
          assert.equal(
            result.workOrder.items!.find((entry) => entry.id === check.id)
              ?.checked,
            true,
          ),
      };
    },
  },
  {
    name: "退回补正",
    action: "return-to-merchant",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await take(id(9), actor);
      await act(
        id(9),
        "supplement-check",
        { itemId: detail.workOrder.items![0].id, result: "USABLE" },
        actor,
      );
      await act(
        id(9),
        "supplement-check",
        {
          itemId: detail.workOrder.items![1].id,
          result: "REJECTED",
          reason: "模糊",
        },
        actor,
      );
      return {
        detail: await api.getOrder(id(9), actor),
        payload: {},
        verify: (result) =>
          assert.equal(result.workOrder.status, "WAITING_MERCHANT"),
      };
    },
  },
  {
    name: "完成补件",
    action: "complete-supplement",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await take(id(9), actor);
      for (const check of detail.workOrder.items!)
        await act(
          id(9),
          "supplement-check",
          { itemId: check.id, result: "USABLE" },
          actor,
        );
      return {
        detail: await api.getOrder(id(9), actor),
        payload: {},
        verify: (result) => assert.equal(result.workOrder.status, "DONE"),
      };
    },
  },
  {
    name: "第一次延期",
    action: "extensions",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await waitingSupplement(actor);
      const dueAt = new Date(
        Date.parse(detail.workOrder.dueAt!) + 3 * 86400000,
      ).toISOString();
      return {
        detail,
        payload: { dueAt, reason: "登记材料待签发" },
        verify: (result) => assert.equal(result.workOrder.dueAt, dueAt),
      };
    },
  },
  {
    name: "第二次延期批准",
    action: "approve-extension",
    allowed: ["OPS_LEAD"],
    prepare: async () => {
      const waiting = await waitingSupplement();
      const firstDue = new Date(
        Date.parse(waiting.workOrder.dueAt!) + 86400000,
      ).toISOString();
      await act(
        waiting.workOrder.id,
        "extensions",
        { dueAt: firstDue, reason: "等待原件" },
        ops,
      );
      const secondDue = new Date(Date.parse(firstDue) + 86400000).toISOString();
      const detail = await act(
        waiting.workOrder.id,
        "extensions",
        { dueAt: secondDue, reason: "物流延期" },
        ops,
      );
      return {
        detail,
        payload: {
          extensionId: detail.workOrder.extensions!.at(-1)!.id,
          approved: true,
        },
        verify: (result) => assert.equal(result.workOrder.dueAt, secondDue),
      };
    },
  },
  {
    name: "记录商户放弃",
    action: "withdraw",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await take(id(9), actor);
      return {
        detail,
        payload: { reason: "商户书面确认暂停申请", files: [upload] },
        verify: (result) => {
          assert.equal(result.workOrder.status, "WITHDRAWN");
          assert.notEqual(result.application.externalStatus, "已通过");
        },
      };
    },
  },
  {
    name: "渠道重提",
    action: "channel-resubmit",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await mappedChannel(actor);
      return {
        detail,
        payload: {
          documents: detail.channel!.requiredDocuments.map((name) => ({
            name,
            value: "已核实",
            file: upload,
          })),
        },
        verify: (result) =>
          assert.equal(result.workOrder.status, "WAITING_CHANNEL"),
      };
    },
  },
  {
    name: "渠道改投",
    action: "channel-switch",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await mappedChannel(actor, "CH-REJECT-POLICY");
      const target = detail.otherChannels?.find(
        (channel) =>
          channel.status === "AVAILABLE" &&
          channel.channelId !== detail.channel?.channelId,
      );
      assert.ok(
        target,
        "channel-switch fixture needs a real available alternate channel",
      );
      return {
        detail,
        payload: { channelId: target.channelId },
        verify: (result) => {
          assert.equal(result.workOrder.status, "WAITING_CHANNEL");
          assert.equal(result.channel?.channelId, target.channelId);
        },
      };
    },
  },
  {
    name: "终止渠道进件",
    action: "channel-terminate",
    allowed: ["OPS_LEAD"],
    prepare: async (actor) => {
      const detail = await take(id(393), actor);
      return {
        detail,
        payload: { reason: "商户确认终止本渠道进件" },
        verify: (result) => assert.equal(result.workOrder.status, "CLOSED"),
      };
    },
  },
  {
    name: "渠道风险类驳回转合规",
    action: "channel-escalate",
    allowed: operations,
    prepare: async (actor) => {
      const detail = await take(id(12), actor);
      return {
        detail,
        payload: { reason: "请合规复核风险原因" },
        verify: (result) =>
          assert.equal(result.workOrder.status, "WAITING_COMPLIANCE"),
      };
    },
  },
  {
    name: "转受限",
    action: "escalate",
    allowed: compliance,
    prepare: async (actor) => {
      const detail = await take(id(6), actor);
      return {
        detail,
        payload: { reason: "需独立核实标识号" },
        verify: (result) =>
          assert.equal(result.workOrder.status, "COMPLIANCE_HOLD"),
      };
    },
  },
  ...(["EXCLUDE", "DECLINE", "CASE"] as const).map((decision) => ({
    name: `受限处置/${decision}`,
    action: "restricted-decision" as const,
    allowed: ["COMPLIANCE_HEAD"] as Role[],
    prepare: async () => {
      const detail = await restricted();
      return {
        detail,
        payload: { decision, reason: "负责人独立核查结论" },
        verify: (result: OrderDetail) =>
          assert.equal(result.workOrder.status, "PENDING_SECOND"),
      };
    },
  })),
  {
    name: "审批",
    action: "approval",
    allowed: ["APPROVER"],
    prepare: async () => {
      await act(id(4), "finalize", { outcome: "PENDING_APPROVAL" }, reviewer);
      return {
        detail: await api.getOrder(id(4), reviewer),
        payload: { decision: "APPROVED" },
        verify: (result) => {
          assert.equal(result.workOrder.status, "PENDING_APPROVAL");
          assert.ok(
            result.approvalDecisions?.some((decision) =>
              decision.approvers.some((actor) => actor.id === "u_3001"),
            ),
          );
        },
      };
    },
  },
  {
    name: "抽检",
    action: "qa",
    allowed: ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"],
    prepare: async (actor) => {
      const detail = await take(id(1), actor);
      return {
        detail,
        payload: { blindConclusions: s1Conclusions },
        verify: (result) => {
          assert.equal(result.workOrder.status, "COMPARE");
          assert.equal(result.qa?.consistent, true);
        },
      };
    },
  },
  {
    name: "指派运营工单",
    action: "assign",
    allowed: ["OPS_LEAD"],
    prepare: async () => ({
      detail: await api.getOrder(id(7), lead),
      payload: { assigneeId: "u_2052" },
      verify: (result) => assert.equal(result.workOrder.assignee?.id, "u_2052"),
    }),
  },
  {
    name: "指派合规工单",
    action: "assign",
    allowed: ["COMPLIANCE_HEAD"],
    prepare: async () => ({
      detail: await api.getOrder(id(3), head),
      payload: { assigneeId: "u_1024" },
      verify: (result) => assert.equal(result.workOrder.assignee?.id, "u_1024"),
    }),
  },
  {
    name: "补充渠道映射",
    action: "channel-mapping",
    allowed: ["OPS_LEAD"],
    prepare: async (actor) => ({
      detail: await take(id(7), actor),
      payload: { reasonCode: "CH-MORE-INFO", isRiskType: false },
      verify: (result) =>
        assert.equal(result.channel?.mappedReasonCode, "CH-MORE-INFO"),
    }),
  },
  {
    name: "查看原图",
    action: "media",
    allowed: compliance,
    prepare: async (actor) => {
      const detail = await take(id(5), actor);
      const evidence = await api.evidence(
        detail.workOrder.checkItems![0].evidenceIds[0],
        actor,
      );
      return {
        detail,
        payload: { evidenceId: evidence.id, mediaId: evidence.mediaRefs[0].id },
        verify: (result) =>
          assert.ok(
            result.audit?.some(
              (entry) =>
                entry.action === "media" && entry.actor.id === actor.userId,
            ),
          ),
      };
    },
  },
  {
    name: "渠道发起补件",
    action: "channel-supplement",
    allowed: operations,
    prepare: async (actor) => ({
      detail: await mappedChannel(actor),
      payload: {
        items: [
          {
            externalText: {
              zh: "请提供银行账户证明。",
              en: "Provide proof of your bank account.",
            },
            actionType: "UPLOAD",
          },
        ],
      },
      verify: (result) =>
        assert.equal(result.workOrder.status, "WAITING_SUPPLEMENT"),
    }),
  },
  {
    name: "迟到硬拒确认",
    action: "late-decline",
    allowed: compliance,
    prepare: async (actor) => ({
      detail: await take(id(8), actor),
      payload: { action: "confirm" },
      verify: (result) => {
        assert.equal(result.workOrder.status, "CLOSED");
        assert.equal(result.application.externalStatus, "未通过");
      },
    }),
  },
  {
    name: "领取审核工单",
    action: "claim",
    allowed: compliance,
    prepare: async () => ({
      detail: await api.getOrder(id(3), reviewer),
      payload: {},
      verify: (result) => {
        assert.equal(result.workOrder.status, "IN_PROGRESS");
        assert.ok(result.workOrder.assignee);
      },
    }),
  },
  {
    name: "领取渠道工单",
    action: "claim",
    allowed: operations,
    prepare: async () => {
      const detail = await api.getOrder(id(7), ops);
      assert.equal(detail.workOrder.assignee, undefined);
      return {
        detail,
        payload: {},
        verify: (result) => {
          assert.equal(result.workOrder.status, "IN_PROGRESS");
          assert.ok(result.workOrder.assignee);
        },
      };
    },
  },
  {
    name: "领取抽检工单",
    action: "claim",
    allowed: ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"],
    prepare: async () => ({
      detail: await api.getOrder(id(1), senior),
      payload: {},
      verify: (result) => {
        assert.equal(result.workOrder.status, "BLIND");
        assert.ok(result.workOrder.assignee);
      },
    }),
  },
  {
    name: "释放审核工单",
    action: "release",
    allowed: compliance,
    prepare: async (actor) => ({
      detail: await take(id(3), actor),
      payload: { reason: "交由同组其他人员继续调查" },
      verify: (result) => {
        assert.equal(result.workOrder.status, "QUEUED");
        assert.equal(result.workOrder.assignee, undefined);
      },
    }),
  },
  {
    name: "释放运营工单",
    action: "release",
    allowed: operations,
    prepare: async (actor) => ({
      detail: await take(id(7), actor),
      payload: { reason: "交由其他运营人员继续跟进" },
      verify: (result) => {
        assert.equal(result.workOrder.status, "QUEUED");
        assert.equal(result.workOrder.assignee, undefined);
      },
    }),
  },
];

for (const cell of mutations) {
  for (const actor of actors) {
    test(`permission matrix: ${cell.name} / ${actor.role}`, async () => {
      const allowed = cell.allowed.includes(actor.role);
      const owner = allowed
        ? actor
        : actors.find((candidate) => cell.allowed.includes(candidate.role))!;
      const fixture = await cell.prepare(owner);
      const before = await api.getOrder(fixture.detail.workOrder.id, owner);
      const operation = api.mutate(
        before.workOrder.id,
        cell.action,
        fixture.payload,
        before.workOrder.version,
        actor,
      );
      if (allowed) {
        const result = await operation;
        fixture.verify(result);
      } else {
        await denied(operation);
        assert.deepEqual(
          await api.getOrder(before.workOrder.id, owner),
          before,
          "forbidden mutation must not change state or audit",
        );
      }
    });
  }
}

for (const actor of actors) {
  test(`permission matrix: 申请进度与对外状态 / ${actor.role}`, async () => {
    if (!internal.includes(actor.role)) {
      await denied(api.getApplication("APP-88209", actor));
      await denied(api.listApplications({}, actor));
      return;
    }
    const detail = await api.getApplication("APP-88209", actor);
    assert.equal(detail.application.id, "APP-88209");
    assert.equal(typeof detail.application.externalStatus, "string");
    assert.equal(
      (await api.listApplications({ search: "APP-88209" }, actor)).some(
        (row) => row.application.id === "APP-88209",
      ),
      true,
    );
  });

  test(`permission matrix: 联系方式、沟通、提交材料与筛查字段 / ${actor.role}`, async () => {
    await act(
      id(9),
      "contact-logs",
      {
        channel: "PHONE",
        contact: "商户联系人",
        result: "CONNECTED",
        summary: "商户确认提交清晰文件",
      },
      ops,
    );
    if (actor.role === "MERCHANT") {
      await denied(api.getApplication("APP-88209", actor));
      return;
    }
    const detail = await api.getApplication("APP-88209", actor);
    const canContact =
      operations.includes(actor.role) || actor.role === "SALES";
    if (canContact)
      assert.ok(
        detail.merchant.contacts?.some(
          (contact) => contact.email && contact.phone,
        ),
      );
    else
      assertKeysAbsent(detail, [
        "contacts",
        "email",
        "phone",
        "preferredChannel",
      ]);
    const canReadCommunication =
      operations.includes(actor.role) || compliance.includes(actor.role);
    if (canReadCommunication)
      assert.match(JSON.stringify(detail), /商户确认提交清晰文件/);
    else assertKeysAbsent(detail, ["contactLog", "opsNote", "noteToOps"]);
    const providedFiles = (
      await api.getOrder(id(9), ops)
    ).workOrder.items!.flatMap((entry) => entry.files ?? []);
    assert.ok(
      providedFiles.length >= 2,
      "the fixture includes both merchant-submitted documents",
    );
    if (actor.role === "SALES") {
      assertKeysAbsent(detail, [
        "files",
        "verificationFiles",
        "submittedMaterials",
        "people",
        "workOrders",
        "channels",
        "audit",
      ]);
      for (const file of providedFiles)
        assert.ok(!JSON.stringify(detail).includes(file.name));
    } else {
      for (const file of providedFiles)
        assert.ok(
          JSON.stringify(detail).includes(file.name),
          "authorized viewer can inspect each submitted document",
        );
    }
    const screening = await api.getApplication("APP-88202", actor);
    if (compliance.includes(actor.role) || actor.role === "APPROVER") {
      assert.ok(
        screening.workOrders?.some((order) =>
          order.checkItems?.some(
            (check) => check.checkType === "SCREENING_WATCHLIST",
          ),
        ),
      );
    } else {
      assertKeysAbsent(screening, [
        "reasonCodes",
        "reasonCode",
        "evidenceIds",
        "checkItems",
        "events",
        "triage",
        "priority",
        "complianceNote",
        "ownershipPct",
        "kycStatus",
      ]);
      assert.doesNotMatch(
        JSON.stringify(screening),
        /SCR-WL-POTENTIAL|SCREENING_WATCHLIST/,
      );
    }
  });

  test(`permission matrix: 风险证据读取 / ${actor.role}`, async () => {
    const reference = await api.getOrder(id(2), reviewer);
    const evidenceId = reference.workOrder.checkItems![0].evidenceIds[0];
    if (compliance.includes(actor.role) || actor.role === "APPROVER") {
      const evidence = await api.evidence(evidenceId, actor);
      assert.equal(evidence.kind, "SCREENING_WATCHLIST");
      assert.equal(evidence.fields.hits.length, 2);
    } else await denied(api.evidence(evidenceId, actor));
  });

  test(`permission matrix: 受限内容 / ${actor.role}`, async () => {
    const detail = await restricted();
    if (actor.role === "COMPLIANCE_HEAD") {
      const visible = await api.getOrder(detail.workOrder.id, actor);
      assert.equal(visible.workOrder.type, "RESTRICTED");
      assert.ok(
        visible.workOrder.restrictedReason || visible.workOrder.restrictedType,
      );
    } else {
      await denied(api.getOrder(detail.workOrder.id, actor));
      if (actor.role !== "MERCHANT") {
        const application = await api.getApplication(
          detail.application.id,
          actor,
        );
        assertKeysAbsent(application, [
          "restrictedReason",
          "restrictedType",
          "restrictedDecisions",
          "restrictedActorIds",
          "caseId",
          "pendingDecision",
        ]);
        assert.doesNotMatch(
          JSON.stringify(application),
          /需负责人核实筛查命中/,
        );
      }
    }
  });

  test(`permission matrix: 发起复核推翻自动拒绝 / ${actor.role}`, async () => {
    const before = await api.getApplication("APP-88390", senior);
    const operation = api.applicationAction(
      before.application.id,
      "review-request",
      { reason: "取得登记机构更正文件" },
      before.application.version,
      actor,
    );
    if (["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"].includes(actor.role)) {
      const result = await operation;
      assert.ok(
        result.workOrders?.some(
          (order) => order.type === "REVIEW" && order.status !== "CLOSED",
        ),
      );
      assert.notEqual(
        result.application.externalStatus,
        "已通过",
        "requesting review does not itself override rejection",
      );
    } else {
      await denied(operation);
      assert.deepEqual(
        await api.getApplication(before.application.id, senior),
        before,
      );
    }
  });

  test(`permission matrix: 标记重点商户 / ${actor.role}`, async () => {
    const before = await api.getApplication("APP-88203", lead);
    const operation = api.applicationAction(
      before.application.id,
      "key-merchant",
      {
        isKeyMerchant: !before.application.isKeyMerchant,
        reason: "商户服务等级调整",
      },
      before.application.version,
      actor,
    );
    if (actor.role === "OPS_LEAD")
      assert.equal(
        (await operation).application.isKeyMerchant,
        !before.application.isKeyMerchant,
      );
    else {
      await denied(operation);
      assert.deepEqual(
        await api.getApplication(before.application.id, lead),
        before,
      );
    }
  });
}

test("sales-lead exception permits priority marking but no processing actions", async () => {
  const actor = identity("u_4101");
  const before = await api.getApplication("APP-88203", actor);
  const result = await api.applicationAction(
    before.application.id,
    "key-merchant",
    {
      isKeyMerchant: !before.application.isKeyMerchant,
      reason: "关键客户服务安排",
    },
    before.application.version,
    actor,
  );
  assert.equal(
    result.application.isKeyMerchant,
    !before.application.isKeyMerchant,
  );
  const review = await api.getOrder(id(3), reviewer);
  await denied(api.mutate(id(3), "claim", {}, review.workOrder.version, actor));
});

for (const actor of actors) {
  test(`merchant-token isolation / ${actor.role}`, async () => {
    const waiting = await waitingSupplement();
    const token = waiting.workOrder.merchantToken;
    assert.ok(token);
    const payload = {
      responses: Object.fromEntries(
        waiting.workOrder.items!.map((entry) => [
          entry.id,
          { files: [upload] },
        ]),
      ),
    };
    if (actor.role === "MERCHANT") {
      const portal = await api.getOrder(token, actor);
      assertKeysAbsent(portal, [
        "contacts",
        "audit",
        "reasonCode",
        "evidenceIds",
        "checkItems",
        "sourceWorkOrderId",
      ]);
      const result = await api.mutate(
        token,
        "merchant-submit",
        payload,
        portal.workOrder.version,
        actor,
      );
      assert.equal(result.workOrder.status, "TO_CHECK");
      await denied(api.getOrder(id(9), actor));
      await denied(api.getOrder(id(3), actor));
    } else {
      await denied(
        api.mutate(
          waiting.workOrder.id,
          "merchant-submit",
          payload,
          waiting.workOrder.version,
          actor,
        ),
      );
    }
  });
}

test("serialized OPS, SALES and APPROVER projections omit entire unauthorized field groups", async () => {
  const full = await take(id(2), reviewer);
  await act(id(2), "note", { note: "内部专用核对记录-938714" }, reviewer);
  const evidenceId = full.workOrder.checkItems![0].evidenceIds[0];
  for (const actor of [ops, lead, identity("u_4001"), identity("u_3001")]) {
    const detail = await api.getApplication(full.application.id, actor);
    if (actor.role === "APPROVER") {
      assertKeysAbsent(detail, [
        "contacts",
        "audit",
        "contactLog",
        "channels",
        "supplements",
        "opsNote",
        "noteToOps",
      ]);
      assert.ok(
        detail.workOrders?.some((order) =>
          order.checkItems?.some((check) =>
            check.evidenceIds.includes(evidenceId),
          ),
        ),
      );
    } else {
      assertKeysAbsent(detail, [
        "evidence",
        "evidenceIds",
        "reasonCode",
        "reasonCodes",
        "checkItems",
        "events",
        "triage",
        "complianceNote",
        "blacklisted",
      ]);
      assert.ok(!JSON.stringify(detail).includes(evidenceId));
      assert.doesNotMatch(JSON.stringify(detail), /内部专用核对记录-938714/);
    }
  }
  for (const actor of [ops, lead]) {
    const queues = await api.listOrders(
      {
        view: actor.role === "OPS_LEAD" ? "team" : "ops",
        tab: actor.role === "OPS_LEAD" ? "all" : "send",
      },
      actor,
    );
    assert.ok(queues.rows.some((row) => row.type === "SUPPLEMENT"));
    assertKeysAbsent(queues, [
      "priority",
      "reasonCode",
      "reasonCodes",
      "checkItems",
      "pendingCheckCount",
      "evidenceIds",
      "declaredMcc",
      "expectedMonthlyVolume",
    ]);
  }
});

test("all returned personnel references resolve to the canonical named user, including new audit authors", async () => {
  await take(id(3), reviewer);
  await act(id(3), "note", { note: "独立核对登记信息" }, reviewer);
  const objects = [
    await api.getOrder(id(3), reviewer),
    await api.getOrder(id(9), ops),
    await api.getApplication("APP-88204", head),
  ];
  function inspect(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value) inspect(child);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && record.id.startsWith("u_")) {
      const canonical = USERS.find((user) => user.id === record.id);
      assert.ok(canonical, `unknown user ${record.id}`);
      assert.equal(record.name, canonical.name);
      if (record.account !== undefined)
        assert.equal(record.account, canonical.account);
      if (record.team !== undefined) assert.equal(record.team, canonical.team);
    }
    for (const child of Object.values(record)) inspect(child);
  }
  for (const object of objects) inspect(object);
  const review = objects[0] as OrderDetail;
  assert.equal(
    review.workOrder.assignee?.name,
    USERS.find((user) => user.id === reviewer.userId)!.name,
  );
  assert.equal(
    review.audit?.at(-1)?.actor.name,
    USERS.find((user) => user.id === reviewer.userId)!.name,
  );
});

test("live search enforces order visibility and exposes only projected application status", async () => {
  const restrictedDetail = await restricted();
  assert.deepEqual(await api.search(restrictedDetail.workOrder.id, ops), []);
  assert.deepEqual(await api.search(restrictedDetail.workOrder.id, senior), []);
  const permitted = await api.search(restrictedDetail.workOrder.id, head);
  assert.deepEqual(
    permitted.map((result) => result.id),
    [restrictedDetail.workOrder.id],
  );
  assert.equal(
    permitted[0].path,
    `/restricted/${restrictedDetail.workOrder.id}`,
  );
  assert.deepEqual(await api.search(id(3), ops), []);
  assert.deepEqual(
    (await api.search(id(3).toLowerCase(), reviewer)).map(
      (result) => result.id,
    ),
    [id(3)],
  );
  const application = await api.getApplication(
    restrictedDetail.application.id,
    ops,
  );
  const progress = await api.search(application.application.id, ops);
  assert.equal(progress[0].status, application.application.externalStatus);
  assertKeysAbsent(progress, [
    "restrictedReason",
    "restrictedType",
    "reasonCodes",
    "evidence",
    "merchantToken",
  ]);
  const salesResults = await api.search(
    restrictedDetail.merchant.legalName,
    identity("u_4001"),
  );
  assert.ok(
    salesResults.some(
      (result) => result.id === restrictedDetail.application.id,
    ),
  );
  assert.ok(salesResults.every((result) => result.kind === "application"));
  await denied(
    api.search(restrictedDetail.merchant.legalName, identity("u_5001")),
  );
  assert.deepEqual(await api.search("   ", reviewer), []);
});
