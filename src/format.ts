import dayjs from "dayjs";
import type { Money, Status } from "./types";
export const COUNTRY_NAMES: Record<string, string> = {
  GB: "英国",
  SG: "新加坡",
  HK: "中国香港",
  DE: "德国",
  CN: "中国",
  US: "美国",
};
export const MCC_NAMES: Record<string, string> = {
  "5712": "家具店",
  "5719": "家居用品",
  "4722": "旅行社",
  "5732": "电子产品",
  "5734": "软件",
  "5999": "其他零售",
  "7333": "商业设计",
  "5499": "食品零售",
  "5977": "化妆品",
  "5815": "数字内容",
  "5411": "食品杂货",
  "5967": "电话服务",
  "7995": "博彩",
};
export const countryName = (code?: string) =>
  code ? `${COUNTRY_NAMES[code] ?? code} ${code}` : "—";
export const mccName = (code?: string) =>
  code ? `${code} ${MCC_NAMES[code] ?? ""}`.trim() : "—";
export const money = (value?: Money) =>
  value
    ? `${value.currency} ${value.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "—";
export const dateTime = (value?: string, list = false) =>
  value && dayjs(value).isValid()
    ? dayjs(value).format(list ? "MM-DD HH:mm" : "YYYY-MM-DD HH:mm:ss")
    : "—";
export function duration(ms: number) {
  const minutes = Math.max(0, Math.floor(Math.abs(ms) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h`
    : `${hours}h ${minutes % 60}m`;
}
export const STAGE_LABELS: Record<string, string> = {
  SUBMITTED: "提交",
  AUTO_CHECK: "自动核验",
  MANUAL_REVIEW: "人工审核",
  APPROVAL: "审批",
  CHANNEL: "渠道进件",
  LIVE: "可交易",
  FORM_SUBMITTED: "表单提交后",
  POST_APPROVAL: "审核通过后",
  VA_CHANNEL: "VA 渠道进件",
};
export const RECEIPT_LABELS: Record<string, string> = {
  REJECTED: "驳回",
  MORE_INFO: "要求补充材料",
  TIMEOUT: "超时",
};
export const TYPE_LABELS: Record<string, string> = {
  REVIEW: "审核",
  SUPPLEMENT: "补件",
  CHANNEL: "渠道",
  RESTRICTED: "受限",
  QA: "抽检",
};
export const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: "已验证",
  PENDING: "待验证",
  FAILED: "验证失败",
  IN_PROGRESS: "验证中",
};
export const verificationStatus = (status?: string) =>
  status ? (VERIFICATION_LABELS[status] ?? status) : "—";

export const STATUS_LABELS: Record<Status, string> = {
  QUEUED: "待领取",
  IN_PROGRESS: "处理中",
  WAITING_SUPPLEMENT: "补件中",
  PENDING_APPROVAL: "待审批",
  COMPLIANCE_HOLD: "合规冻结",
  CLOSED: "已结案",
  TO_SEND: "待发送",
  WAITING_MERCHANT: "等待商户",
  TO_CHECK: "待齐套检查",
  DONE: "已完成",
  CLOSED_NO_RESPONSE: "超时关闭",
  WITHDRAWN: "商户放弃",
  WAITING_COMPLIANCE: "等待合规",
  WAITING_CHANNEL: "等待渠道回执",
  PENDING_SECOND: "待第二人确认",
  BLIND: "盲审中",
  COMPARE: "比对中",
};
const RESULT_LABELS: Record<string, string> = {
  HIGH: "高",
  MEDIUM: "中",
  NORMAL: "常规",
  LOW: "低",
  ACTIVE: "存续",
  INACTIVE: "已注销",
  VERIFIED: "已验证",
  FAILED: "未通过",
  Active: "存续",
  Dissolved: "已注销",
  CASE: "已升级案件",
  RETURN: "退回补充调查",
  DISAGREE: "退回重新研判",
  RESTRICTED_EXCLUDED: "受限已排除",
  CONNECTED: "已接通",
  NO_ANSWER: "未接通",
  PROMISED: "承诺提交",
  APPROVED: "通过",
  APPROVED_WITH_CONDITIONS: "附条件通过",
  DECLINED: "拒绝",
  DECLINE: "拒绝",
  REJECTED: "不合格",
  TERMINATED: "终止合作",
  PENDING: "待处理",
  DECIDED: "已结论",
  AUTO_CLOSED: "自动关闭",
  PROVIDED: "已提交",
  SENT: "已发送",
  MISSING: "缺失",
  SUBMITTED: "已提交",
  ACTION_REQUIRED: "待处理",
  EXCLUDE: "排除命中",
  ESCALATE: "升级案件",
};
export const statusLabel = (value?: string): string =>
  value
    ? (STATUS_LABELS[value as Status] ?? RESULT_LABELS[value] ?? value)
    : "—";
export const applicationStatus = (stage: string, status?: string) =>
  `${STAGE_LABELS[stage] ?? stage} · ${statusLabel(status)}`;

const COUNTRY_TIMEZONES: Record<string, string> = {
  DE: "Europe/Berlin",
  GB: "Europe/London",
  SG: "Asia/Singapore",
  HK: "Asia/Hong_Kong",
  CN: "Asia/Shanghai",
  US: "America/New_York",
};
export function deadlineDate(value?: string, country?: string) {
  if (!value) return "发送后 7 天";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: COUNTRY_TIMEZONES[country ?? ""] ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZoneName: "short",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const zone = part("timeZoneName");
  const label =
    country === "DE"
      ? zone === "CEST" || zone === "GMT+2"
        ? "CEST"
        : "CET"
      : country === "SG"
        ? "SGT"
        : country === "HK"
          ? "HKT"
          : country === "CN"
            ? "CST"
            : zone;
  return `${part("year")}-${part("month")}-${part("day")} ${label}`;
}
