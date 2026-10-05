import type { QueueView, Role, Session, User } from "./types";
export const ROLE_LABELS: Record<Role, string> = {
  OPS_AGENT: "运营专员",
  OPS_LEAD: "运营组长",
  COMPLIANCE_REVIEWER: "合规审核员",
  COMPLIANCE_SENIOR: "资深合规",
  COMPLIANCE_HEAD: "合规负责人",
  APPROVER: "审批人",
  SALES: "销售",
  MERCHANT: "商户",
};
export const OPS_ROLES: Role[] = ["OPS_AGENT", "OPS_LEAD"];
export const COMPLIANCE_ROLES: Role[] = [
  "COMPLIANCE_REVIEWER",
  "COMPLIANCE_SENIOR",
  "COMPLIANCE_HEAD",
];
export const USERS: User[] = [
  {
    id: "u_1023",
    name: "林予安",
    account: "lin.yuan",
    team: "合规审核组",
    roles: ["COMPLIANCE_REVIEWER"],
  },
  {
    id: "u_1024",
    name: "陈知微",
    account: "chen.zhiwei",
    team: "合规审核组",
    roles: ["COMPLIANCE_REVIEWER"],
  },
  {
    id: "u_1101",
    name: "顾景行",
    account: "gu.jingxing",
    team: "合规复核组",
    roles: ["COMPLIANCE_SENIOR"],
  },
  {
    id: "u_1201",
    name: "沈知行",
    account: "shen.zhixing",
    team: "合规管理组",
    roles: ["COMPLIANCE_HEAD"],
  },
  {
    id: "u_1202",
    name: "苏亦宁",
    account: "su.yining",
    team: "合规管理组",
    roles: ["COMPLIANCE_HEAD"],
  },
  {
    id: "u_2051",
    name: "周以宁",
    account: "zhou.yining",
    team: "商户运营组",
    roles: ["OPS_AGENT"],
  },
  {
    id: "u_2052",
    name: "许言",
    account: "xu.yan",
    team: "商户运营组",
    roles: ["OPS_AGENT"],
  },
  {
    id: "u_2101",
    name: "程悦",
    account: "cheng.yue",
    team: "运营管理组",
    roles: ["OPS_LEAD"],
  },
  {
    id: "u_3001",
    name: "顾衡",
    account: "gu.heng",
    team: "高级管理层",
    roles: ["APPROVER"],
    approvalLimit: 5000000,
    authority: "MANAGEMENT",
  },
  {
    id: "u_3002",
    name: "陆珩",
    account: "lu.heng",
    team: "高级管理层",
    roles: ["APPROVER"],
    approvalLimit: 5000000,
    authority: "MANAGEMENT",
  },
  {
    id: "u_3003",
    name: "许淮",
    account: "xu.huai",
    team: "风控审批组",
    roles: ["APPROVER"],
    approvalLimit: 200000,
    authority: "RISK",
  },
  {
    id: "u_4001",
    name: "陈雨桐",
    account: "chen.yutong",
    team: "商户销售组",
    roles: ["SALES"],
  },
  {
    id: "u_4002",
    name: "陆清和",
    account: "lu.qinghe",
    team: "商户销售组",
    roles: ["SALES"],
  },
  {
    id: "u_4003",
    name: "宋嘉宁",
    account: "song.jianing",
    team: "商户销售组",
    roles: ["SALES"],
  },
  {
    id: "u_4004",
    name: "江予白",
    account: "jiang.yubai",
    team: "商户销售组",
    roles: ["SALES"],
  },
  {
    id: "u_4101",
    name: "方予真",
    account: "fang.yuzhen",
    team: "销售管理组",
    roles: ["SALES"],
    salesLead: true,
  },
  {
    id: "u_5001",
    name: "商户联系人",
    account: "merchant.portal",
    team: "商户",
    roles: ["MERCHANT"],
  },
];
export const sessionFor = (u: User): Session => ({
  role: u.roles[0],
  userId: u.id,
  name: u.name,
  account: u.account,
  team: u.team,
});
export const DEFAULT_SESSION = sessionFor(USERS[0]);
export interface MenuEntry {
  key: QueueView | "applications" | "metrics";
  label: string;
}
const m = (key: MenuEntry["key"], label: string): MenuEntry => ({ key, label });
const search = m("applications", "申请查询");
const metrics = m("metrics", "指标看板");
export const MENUS: Record<Role, MenuEntry[]> = {
  OPS_AGENT: [m("ops", "我的待办"), m("channel", "渠道进件"), search],
  OPS_LEAD: [
    m("team", "团队工单"),
    m("ops", "我的待办"),
    m("extensions", "延期审批"),
    m("channel", "渠道进件"),
    search,
    metrics,
  ],
  COMPLIANCE_REVIEWER: [m("review", "审核任务"), search],
  COMPLIANCE_SENIOR: [m("review", "审核任务"), m("qa", "复核与抽检"), search],
  COMPLIANCE_HEAD: [
    m("restricted", "受限案件"),
    m("review", "审核任务"),
    m("qa", "复核与抽检"),
    search,
    metrics,
  ],
  APPROVER: [m("approval", "待审批"), search, metrics],
  SALES: [search],
  MERCHANT: [],
};
export const QUEUE_TABS: Record<QueueView, { key: string; label: string }[]> = {
  review: [
    { key: "claim", label: "待领取" },
    { key: "mine", label: "待我审核" },
    { key: "new", label: "新材料已到" },
    { key: "screening", label: "筛查队列" },
    { key: "supplement", label: "补件中" },
  ],
  ops: [
    { key: "send", label: "待发送补件" },
    { key: "replied", label: "商户已回复" },
    { key: "waiting", label: "等待商户" },
  ],
  team: [{ key: "all", label: "全部工单" }],
  extensions: [{ key: "pending", label: "待审批" }],
  channel: [
    { key: "all", label: "全部" },
    { key: "mine", label: "待我处理" },
    { key: "waiting", label: "等待渠道回执" },
  ],
  qa: [
    { key: "review", label: "待复核" },
    { key: "sample", label: "抽检队列" },
  ],
  restricted: [
    { key: "all", label: "全部" },
    { key: "second", label: "待第二人确认" },
  ],
  approval: [{ key: "all", label: "待审批" }],
};
export function menuPath(key: MenuEntry["key"]) {
  return key === "applications" || key === "metrics"
    ? `/${key}`
    : `/queue/${key}`;
}
export function homePath(role: Role) {
  return role === "MERCHANT" ? "/merchant" : menuPath(MENUS[role][0].key);
}
export function orderPath(order: { id: string; type: string; status: string }) {
  const route =
    order.type === "SUPPLEMENT"
      ? "supplements"
      : order.type === "RESTRICTED"
        ? "restricted"
        : order.type === "QA"
          ? "qa"
          : order.type === "CHANNEL"
            ? "channels"
            : order.status === "PENDING_APPROVAL"
              ? "approvals"
              : "orders";
  return `/${route}/${order.id}`;
}
export const SCENARIOS = [
  {
    key: "S1",
    name: "干净申请抽检",
    role: "COMPLIANCE_SENIOR",
    path: "/qa/WO-20261005-0001",
  },
  {
    key: "S2",
    name: "名单误命中",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0002",
  },
  {
    key: "S3",
    name: "名称与地址补件",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0003",
  },
  {
    key: "S4",
    name: "PEP 双人审批",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0004",
  },
  {
    key: "S5",
    name: "证件疑似篡改",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0005",
  },
  {
    key: "S6",
    name: "名单真命中",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0006",
  },
  {
    key: "S7",
    name: "渠道资料补充",
    role: "OPS_LEAD",
    path: "/channels/WO-20261005-0007",
  },
  {
    key: "S8",
    name: "迟到硬拒",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0008",
  },
  {
    key: "S9",
    name: "齐套检查退回",
    role: "OPS_AGENT",
    path: "/supplements/WO-20261005-0009",
  },
  {
    key: "S10",
    name: "角色隔离",
    role: "OPS_AGENT",
    path: "/applications/APP-88206",
  },
  {
    key: "S11",
    name: "人工核验与延期",
    role: "COMPLIANCE_REVIEWER",
    path: "/orders/WO-20261005-0011",
  },
  {
    key: "S12",
    name: "渠道风险驳回",
    role: "OPS_AGENT",
    path: "/channels/WO-20261005-0012",
  },
] satisfies { key: string; name: string; role: Role; path: string }[];
