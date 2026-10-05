import type { ReactNode } from "react";
import { pixel, type TableColumn } from "@astryxdesign/core/Table";
import { Badge } from "@astryxdesign/core/Badge";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { Globe, Mail, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  ApplicationRow,
  QueueRow,
  QueueView,
  Role,
  Session,
} from "./types";
import { IdText, PersonName, Sla, StatusBadge } from "./ui";
import {
  countryName,
  dateTime,
  duration,
  mccName,
  money,
  RECEIPT_LABELS,
  STAGE_LABELS,
  statusLabel,
  applicationStatus,
  deadlineDate,
  merchantTradingName,
} from "./format";
type Row = QueueRow | ApplicationRow;
const isApp = (row: Row): row is ApplicationRow => "application" in row;
const queue = (row: Row) => (isApp(row) ? undefined : row);
const stamp = (value?: string) =>
  value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
const sourceName = (source?: string) =>
  source
    ? ({ COMPLIANCE: "合规", CHANNEL: "渠道", AUTO: "系统" }[source] ?? source)
    : "—";
function Deadline({ value, country }: { value?: string; country?: string }) {
  if (!value) return <>发送后 7 天</>;
  const days = Math.ceil((stamp(value) - Date.now()) / 86400000);
  return (
    <Tooltip content={deadlineDate(value, country)}>
      <span className={days < 0 ? "overdue" : ""}>
        {days < 0 ? `已过期 ${Math.abs(days)} 天` : `剩 ${days} 天`} ·{" "}
        {dateTime(value).slice(5, 10)}
      </span>
    </Tooltip>
  );
}
function FullText({ text }: { text: string }) {
  return (
    <Tooltip content={text}>
      <span className="cell-ellipsis" tabIndex={0}>
        {text}
      </span>
    </Tooltip>
  );
}
interface ColumnDef {
  title: string;
  width: number;
  render: (row: Row, session?: Pick<Session, "userId">) => ReactNode;
  sort?: (row: Row) => number;
  align?: "right";
}
export const COLUMN_DEFINITIONS: Record<string, ColumnDef> = {
  C01: {
    title: "工单号",
    width: 150,
    render: (r) => <IdText value={queue(r)?.id} />,
  },
  C02: {
    title: "商户",
    width: 200,
    render: (r, session) => {
      const legalName = isApp(r) ? r.merchant.legalName : r.merchantName;
      const displayName = merchantTradingName(
        legalName,
        isApp(r) ? r.merchant.displayName : r.displayName,
      );
      const otherAssignee =
        !isApp(r) &&
        session &&
        r.assignee?.id !== session.userId &&
        !["CLOSED", "DONE", "WITHDRAWN", "CLOSED_NO_RESPONSE"].includes(
          r.status,
        )
          ? r.assignee
          : undefined;
      return (
        <div className="merchant-cell">
          <div title={legalName}>
            {legalName}
            {(isApp(r) ? r.application.isKeyMerchant : r.isKeyMerchant) && (
              <Badge variant="neutral" label="重点" />
            )}
            {!isApp(r) && r.hasNewEvidence && (
              <Badge variant="info" label="有新证据" />
            )}
          </div>
          {(displayName || otherAssignee) && (
            <div className="secondary merchant-display">
              {otherAssignee && (
                <span>
                  {otherAssignee.name}正在处理{displayName ? " · " : ""}
                </span>
              )}
              {displayName}
            </div>
          )}
        </div>
      );
    },
  },
  C03: {
    title: "申请号",
    width: 120,
    render: (r) => (
      <Link
        onClick={(e) => e.stopPropagation()}
        to={`/applications/${isApp(r) ? r.application.id : r.applicationId}`}
      >
        <IdText value={isApp(r) ? r.application.id : r.applicationId} />
      </Link>
    ),
  },
  C04: {
    title: "注册地",
    width: 90,
    render: (r) => countryName(isApp(r) ? r.merchant.country : r.country),
  },
  C05: {
    title: "申报 MCC",
    width: 130,
    render: (r) => mccName(isApp(r) ? r.merchant.declaredMcc : r.declaredMcc),
  },
  C06: {
    title: "预估月交易额",
    width: 130,
    align: "right",
    render: (r) =>
      money(
        isApp(r) ? r.merchant.expectedMonthlyVolume : r.expectedMonthlyVolume,
      ),
    sort: (r) =>
      (isApp(r) ? r.merchant.expectedMonthlyVolume : r.expectedMonthlyVolume)
        ?.amount ?? 0,
  },
  C07: {
    title: "待处理检查项",
    width: 200,
    render: (r) => {
      const row = queue(r);
      const summary = row?.pendingCheckCount
        ? `${row.pendingCheckCount} 项 · ${row.reasonName ?? "待审核"}`
        : "—";
      return row?.checkItems?.length ? (
        <Tooltip
          content={
            <ul className="queue-check-summary">
              {row.checkItems.map((item) => (
                <li key={item.id}>
                  {item.title} · {statusLabel(item.status)}
                </li>
              ))}
            </ul>
          }
        >
          <span className="cell-ellipsis" tabIndex={0}>
            {summary}
          </span>
        </Tooltip>
      ) : (
        summary
      );
    },
  },
  C08: {
    title: "优先级",
    width: 64,
    render: (r) => {
      const p = isApp(r) ? r.currentOrder?.priority : r.priority;
      return p === "HIGH" ? (
        <Badge variant="error" label="高" className="priority-high" />
      ) : p === "LOW" ? (
        <span className="secondary">低</span>
      ) : null;
    },
    sort: (r) =>
      ({ HIGH: 0, NORMAL: 1, LOW: 2 })[
        isApp(r)
          ? (r.currentOrder?.priority ?? "NORMAL")
          : (r.priority ?? "NORMAL")
      ],
  },
  C09: {
    title: "状态",
    width: 110,
    render: (r) => (queue(r) ? <StatusBadge status={queue(r)!.status} /> : "—"),
  },
  C10: {
    title: "SLA 剩余",
    width: 110,
    render: (r) => (queue(r) ? <Sla order={queue(r)!} /> : "—"),
    sort: (r) =>
      queue(r)?.slaPaused ? Number.MAX_SAFE_INTEGER : stamp(queue(r)?.slaDueAt),
  },
  C11: {
    title: "进入队列",
    width: 100,
    render: (r) => dateTime(queue(r)?.createdAt, true),
    sort: (r) => stamp(queue(r)?.createdAt),
  },
  C12: {
    title: "处理人",
    width: 80,
    render: (r) => (
      <PersonName user={isApp(r) ? r.currentOrder?.assignee : r.assignee} />
    ),
  },
  C13: {
    title: "联系人",
    width: 160,
    render: (r) => {
      const c = queue(r)?.contact;
      return c ? (
        <span>
          {c.name}{" "}
          <Tooltip
            content={
              { EMAIL: "邮件", SMS: "短信", PORTAL: "门户" }[c.preferredChannel]
            }
          >
            {c.preferredChannel === "EMAIL" ? (
              <Mail size={14} />
            ) : c.preferredChannel === "SMS" ? (
              <MessageSquare size={14} />
            ) : (
              <Globe size={14} />
            )}
          </Tooltip>
        </span>
      ) : (
        "—"
      );
    },
  },
  C14: {
    title: "补件项",
    width: 240,
    render: (r) =>
      queue(r)?.supplementCount ? (
        <FullText
          text={`${queue(r)!.supplementCount} 项 · ${queue(r)!.supplementText ?? "—"}`}
        />
      ) : (
        "—"
      ),
  },
  C15: {
    title: "补件来源",
    width: 90,
    render: (r) => sourceName(queue(r)?.supplementSource),
  },
  C16: {
    title: "商户截止",
    width: 140,
    render: (r) => (
      <Deadline
        value={r.dueAt}
        country={isApp(r) ? r.merchant.country : r.country}
      />
    ),
    sort: (r) => stamp(r.dueAt),
  },
  C17: {
    title: "已提醒",
    width: 80,
    render: (r) => `${queue(r)?.remindersSent ?? 0}/3`,
  },
  C18: {
    title: "最近沟通",
    width: 150,
    render: (r) => {
      const c = queue(r)?.recentContact;
      return c
        ? `${dateTime(c.at, true)} · ${{ PHONE: "电话", EMAIL: "邮件", IM: "即时消息", SMS: "短信", PORTAL: "门户" }[c.channel]}`
        : "—";
    },
    sort: (r) => stamp(queue(r)?.recentContact?.at),
  },
  C19: {
    title: "渠道",
    width: 110,
    render: (r) => queue(r)?.channelName ?? "—",
  },
  C20: {
    title: "渠道提交号",
    width: 130,
    render: (r) => <IdText value={queue(r)?.submissionNo} />,
  },
  C21: {
    title: "回执类型",
    width: 120,
    render: (r) => RECEIPT_LABELS[queue(r)?.receiptType ?? ""] ?? "—",
  },
  C22: {
    title: "上游原因",
    width: 280,
    render: (r) => (
      <Tooltip
        content={`${queue(r)?.upstreamCode ?? "—"} · ${queue(r)?.upstreamReasonRaw ?? "—"}`}
      >
        <span className="cell-ellipsis mono" tabIndex={0}>
          {queue(r)?.upstreamCode ?? "—"} ·{" "}
          {queue(r)?.upstreamReasonRaw?.split("\n")[0] ?? "—"}
        </span>
      </Tooltip>
    ),
  },
  C23: {
    title: "内部原因",
    width: 150,
    render: (r) =>
      queue(r)?.mappedReasonName ? (
        <FullText text={queue(r)!.mappedReasonName!} />
      ) : (
        <Badge variant="warning" label="未映射" />
      ),
  },
  C24: {
    title: "审批原因",
    width: 220,
    render: (r) => (
      <FullText text={queue(r)?.approvalReasonNames?.join(" · ") || "—"} />
    ),
  },
  C25: {
    title: "风险等级",
    width: 150,
    render: (r) =>
      `MCC ${statusLabel(queue(r)?.mccRisk)} · 国家 ${statusLabel(queue(r)?.countryRisk)}`,
  },
  C26: {
    title: "提交人",
    width: 100,
    render: (r) => <PersonName user={queue(r)?.submittedBy} />,
  },
  C27: {
    title: "等待时长",
    width: 100,
    render: (r) =>
      duration(
        queue(r)?.waitingMs ?? Date.now() - stamp(queue(r)?.enteredStatusAt),
      ),
    sort: (r) =>
      queue(r)?.waitingMs ?? Date.now() - stamp(queue(r)?.enteredStatusAt),
  },
  C28: {
    title: "复核进度",
    width: 90,
    render: (r) => queue(r)?.reviewProgress ?? "—",
  },
  C29: {
    title: "抽检批次",
    width: 170,
    render: (r) => (
      <div>
        <IdText value={queue(r)?.batchId} />
        <div className="secondary">
          {dateTime(queue(r)?.sampledAt).slice(0, 10)}
        </div>
      </div>
    ),
  },
  C30: {
    title: "受限类型",
    width: 120,
    render: (r) =>
      ({ SANCTIONS: "制裁真命中", SUSPICIOUS: "可疑迹象" })[
        queue(r)?.restrictedType ?? ""
      ] ?? "—",
  },
  C31: {
    title: "冻结时长",
    width: 100,
    render: (r) => duration(Date.now() - stamp(queue(r)?.frozenAt)),
    sort: (r) => Date.now() - stamp(queue(r)?.frozenAt),
  },
  C32: {
    title: "当前环节",
    width: 110,
    render: (r) => (isApp(r) ? STAGE_LABELS[r.application.stage] : "—"),
  },
  C33: {
    title: "内部状态",
    width: 110,
    render: (r) =>
      isApp(r)
        ? applicationStatus(
            r.internalStatus ?? r.currentOrder?.status ?? r.application.status,
          )
        : "—",
  },
  C34: {
    title: "对外状态",
    width: 110,
    render: (r) =>
      isApp(r) ? <StatusBadge status={r.application.externalStatus} /> : "—",
  },
  C35: {
    title: "下一步",
    width: 200,
    render: (r) => (isApp(r) ? r.nextStep : "—"),
  },
  C36: {
    title: "提交日期",
    width: 110,
    render: (r) =>
      dateTime(isApp(r) ? r.application.createdAt : r.createdAt).slice(0, 10),
    sort: (r) => stamp(isApp(r) ? r.application.createdAt : r.createdAt),
  },
  C37: {
    title: "销售负责人",
    width: 100,
    render: (r) => (
      <PersonName user={isApp(r) ? r.application.salesOwner : undefined} />
    ),
  },
  supplementProgress: {
    title: "补件进度",
    width: 240,
    render: (r) => (
      <span>
        {queue(r)?.supplementStatus && (
          <StatusBadge status={queue(r)!.supplementStatus!} />
        )}
        <Deadline
          value={r.dueAt}
          country={isApp(r) ? r.merchant.country : r.country}
        />
      </span>
    ),
    sort: (r) => stamp(r.dueAt),
  },
  extensionRequester: {
    title: "申请人",
    width: 100,
    render: (r) => <PersonName user={queue(r)?.extension?.requestedBy} />,
  },
  originalDue: {
    title: "原截止日期",
    width: 160,
    render: (r) => dateTime(queue(r)?.extension?.originalDueAt, true),
  },
  requestedDue: {
    title: "申请截止日期",
    width: 160,
    render: (r) => dateTime(queue(r)?.extension?.requestedDueAt, true),
  },
  extensionCount: {
    title: "已延期次数",
    width: 100,
    render: (r) => queue(r)?.extensionCount ?? 0,
  },
  extensionReason: {
    title: "原因",
    width: 260,
    render: (r) => <FullText text={queue(r)?.extension?.reason ?? "—"} />,
  },
  opsTask: {
    title: "当前运营待办",
    width: 180,
    render: (r) => (isApp(r) ? (r.opsTask ?? "—") : "—"),
  },
};
function columns<T extends Row & Record<string, unknown>>(
  ids: string[],
  session?: Pick<Session, "userId">,
): TableColumn<T>[] {
  return ids.map((id) => {
    const d = COLUMN_DEFINITIONS[id];
    return {
      key: id,
      header: d.title,
      width: pixel(d.width),
      align: d.align === "right" ? "end" : "start",
      renderCell: (row) => d.render(row, session),
      sortable: !!d.sort,
    };
  });
}
export function getQueueColumnIds(view: QueueView, tab: string): string[] {
  switch (view) {
    case "review":
      return tab === "supplement"
        ? [
            "C01",
            "C02",
            "C04",
            "C07",
            "C09",
            "supplementProgress",
            "C12",
            "C10",
          ]
        : [
            "C01",
            "C02",
            "C04",
            "C05",
            "C07",
            "C08",
            "C09",
            "C10",
            "C11",
            "C12",
          ];
    case "ops":
      return tab === "waiting"
        ? ["C01", "C02", "C13", "C14", "C16", "C17", "C18", "C12"]
        : ["C01", "C02", "C13", "C14", "C15", "C09", "C10", "C12"];
    case "channel":
      return ["C01", "C02", "C19", "C20", "C21", "C22", "C23", "C10", "C12"];
    case "team":
      return ["C01", "C02", "C15", "C09", "C10", "C16", "C12"];
    case "extensions":
      return [
        "C01",
        "C02",
        "extensionRequester",
        "originalDue",
        "requestedDue",
        "extensionCount",
        "extensionReason",
      ];
    case "qa":
      return tab === "sample"
        ? ["C01", "C02", "C29", "C10", "C12"]
        : ["C01", "C02", "C07", "C26", "C27", "C28"];
    case "restricted":
      return ["C01", "C02", "C04", "C30", "C26", "C31", "C28", "C12"];
    case "approval":
      return [
        "C01",
        "C02",
        "C04",
        "C24",
        "C06",
        "C25",
        "C26",
        "C27",
        "C28",
        "C10",
      ];
  }
}
export function getQueueColumns(
  view: QueueView,
  tab: string,
  session: Pick<Session, "userId">,
): TableColumn<QueueRow & Record<string, unknown>>[] {
  return columns(getQueueColumnIds(view, tab), session);
}
export function getApplicationColumns(
  role: Role,
): TableColumn<ApplicationRow & Record<string, unknown>>[] {
  const ids =
    role === "OPS_AGENT" || role === "OPS_LEAD"
      ? ["C03", "C02", "C04", "C36", "C32", "C34", "opsTask", "C16", "C37"]
      : role === "APPROVER"
        ? ["C03", "C02", "C04", "C06", "C32", "C33"]
        : role === "SALES"
          ? ["C03", "C02", "C04", "C36", "C34", "C35", "C37"]
          : ["C03", "C02", "C04", "C05", "C36", "C32", "C33", "C08", "C12"];
  return columns(ids);
}
