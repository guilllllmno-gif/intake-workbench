import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog } from "@astryxdesign/core/Dialog";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { Selector } from "@astryxdesign/core/Selector";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import {
  Table,
  pixel,
  proportional,
  useTablePagination,
  useTableStickyColumns,
  useTableColumnSettings,
  type TableColumn,
  type TablePlugin,
} from "@astryxdesign/core/Table";
import { ArrowLeft, RotateCcw, Star } from "lucide-react";
import { api } from "../api";
import { COMPLIANCE_ROLES, OPS_ROLES, orderPath } from "../access";
import { CHECK_OPTIONS, reasonName } from "../catalog";
import {
  countryName,
  dateTime,
  mccName,
  money,
  verificationStatus,
  statusLabel,
  deadlineDate,
} from "../format";
import { useAsync, useNotice, useSession } from "../hooks";
import {
  Badge,
  Btn,
  Panel,
  Confirm,
  IdText,
  LoadState,
  PersonName,
  StatusBadge,
  Timeline,
} from "../ui";
import EvidencePanel, {
  emptyEvidenceDraft,
  FileSpecimen,
} from "../components/EvidencePanel";
import type { Application, CheckItem } from "../types";
import "./progress-pages.css";

const stages: { key: Application["stage"]; title: string }[] = [
  { key: "SUBMITTED", title: "提交" },
  { key: "AUTO_CHECK", title: "自动核验" },
  { key: "MANUAL_REVIEW", title: "人工审核" },
  { key: "APPROVAL", title: "审批" },
  { key: "CHANNEL", title: "渠道进件" },
  { key: "LIVE", title: "可交易" },
];
const orderNames = {
  REVIEW: "审核工单",
  SUPPLEMENT: "补件工单",
  CHANNEL: "渠道工单",
  RESTRICTED: "受限工单",
  QA: "抽检工单",
};
const channels = {
  EMAIL: "邮件",
  SMS: "短信",
  PORTAL: "门户",
  PHONE: "电话",
  IM: "即时消息",
};
const decisionNames: Record<string, string> = {
  APPROVED: "通过",
  APPROVED_WITH_CONDITIONS: "附条件通过",
  DECLINED: "拒绝",
  RETURN: "退回补充调查",
  DISAGREE: "驳回",
  MANUAL_REVIEW: "转人工审核",
};
const supplementNames = {
  PENDING: "待补充",
  SENT: "已发送",
  PROVIDED: "已提交",
  REJECTED: "不合格",
  MISSING: "缺件",
};
const severityNames: Record<string, string> = {
  HIGH: "高",
  NORMAL: "常规",
  MEDIUM: "中",
  LOW: "低",
};
function DetailTable<T extends { id: string }>({
  title,
  rows,
  columns,
  onActivate,
}: {
  title: string;
  rows: T[];
  columns: TableColumn<T & Record<string, unknown>>[];
  onActivate?: (row: T) => void;
}) {
  type Row = T & Record<string, unknown>;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [density, setDensity] = useState<"compact" | "balanced" | "spacious">(
    "compact",
  );
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(() =>
    columns.map((column) => column.key),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  const pagination = useTablePagination<Row>({
    page: currentPage,
    onPageChange: setPage,
    pageSize,
    totalItems: rows.length,
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
    pageSizeOptions: [20, 50, 100],
    label: title + "分页",
    align: "end",
  });
  const sticky = useTableStickyColumns<Row>({
    startKeys: columns[0] ? [columns[0].key] : [],
  });
  const columnSettings = useTableColumnSettings<Row>({
    columns: columns.map((column, index) => ({
      key: column.key,
      label: String(column.header),
      isAlwaysVisible: index === 0,
    })),
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const activation: TablePlugin<Row> = {
    transformBodyRow: (props, row) =>
      !onActivate
        ? props
        : {
            ...props,
            htmlProps: {
              ...props.htmlProps,
              className: "progress-clickable-row",
              tabIndex: 0,
              onClick: (event) => {
                if (!(event.target as HTMLElement).closest("a,button,input"))
                  onActivate(row);
              },
              onKeyDown: (event) => {
                if (
                  event.target === event.currentTarget &&
                  event.key === "Enter"
                )
                  onActivate(row);
              },
            },
          },
  };
  return (
    <Panel
      title={title}
      subtitle={"共 " + rows.length + " 条"}
      actions={
        <div className="row progress-table-tools">
          <Selector
            label={title + "密度"}
            isLabelHidden
            value={density}
            onChange={(value) => setDensity(value as typeof density)}
            options={[
              { value: "compact", label: "紧凑" },
              { value: "balanced", label: "标准" },
              { value: "spacious", label: "宽松" },
            ]}
          />
          <MultiSelector
            label={title + "显示列"}
            isLabelHidden
            value={activeColumnKeys}
            onChange={(keys) =>
              setActiveColumnKeys(
                columns[0]
                  ? [
                      columns[0].key,
                      ...keys.filter((key) => key !== columns[0].key),
                    ]
                  : keys,
              )
            }
            options={columns.map((column) => ({
              value: column.key,
              label: String(column.header),
            }))}
          />
          <Btn
            variant="ghost"
            onClick={() =>
              setActiveColumnKeys(columns.map((column) => column.key))
            }
          >
            重置列
          </Btn>
        </div>
      }
    >
      <Table<Row>
        aria-label={title}
        data={
          rows.slice(
            (currentPage - 1) * pageSize,
            currentPage * pageSize,
          ) as Row[]
        }
        columns={columns.map((column) => ({
          ...column,
          width: column.width ?? proportional(1),
        }))}
        idKey="id"
        density={density}
        hasHover={!!onActivate}
        rowCount={rows.length}
        rowIndexStart={(currentPage - 1) * pageSize + 1}
        plugins={{
          columnSettings,
          sticky,
          activation,
          ...(rows.length > pageSize ? { pagination } : {}),
        }}
      />
    </Panel>
  );
}

function ApplicationEvidence({ item }: { item: CheckItem }) {
  const { session } = useSession();
  const { data, loading, error, reload } = useAsync(async () => {
    if (item.snapshotId)
      return (await api.snapshot(item.snapshotId, session)).evidence;
    return Promise.all(item.evidenceIds.map((id) => api.evidence(id, session)));
  }, [item.id, item.snapshotId, session.role, session.userId]);
  return (
    <LoadState loading={loading} error={error} retry={reload}>
      {data && (
        <EvidencePanel
          evidence={data}
          item={item}
          draft={{
            ...emptyEvidenceDraft(),
            hitConclusions: item.hitConclusions ?? {},
            articles: Object.fromEntries(
              Object.entries(item.articles ?? {}).map(([key, value]) => [
                key,
                { ...value, reason: value.reason ?? "" },
              ]),
            ),
            mcc: item.mcc ?? "",
            uboNames: item.uboNames?.join(", ") ?? "",
            remediationItems: item.remediationItems ?? [],
            verificationFiles: item.verificationFiles ?? [],
          }}
          onDraft={() => {}}
          readOnly
        />
      )}
    </LoadState>
  );
}

export default function ApplicationPage() {
  const { id = "" } = useParams();
  const { session } = useSession();
  const navigate = useNavigate();
  const notice = useNotice();
  const { data, loading, error, reload } = useAsync(
    () => api.getApplication(id, session),
    [id, session.role, session.userId],
  );
  const { data: me } = useAsync(
    () => api.me(session),
    [session.role, session.userId],
  );
  const [action, setAction] = useState<
    "key-merchant" | "review-request" | null
  >(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState<CheckItem | null>(null);
  const [reason, setReason] = useState("");
  const ops = OPS_ROLES.includes(session.role);
  const compliance = COMPLIANCE_ROLES.includes(session.role);
  const risk = compliance || session.role === "APPROVER";
  const sales = session.role === "SALES";
  const internal = !sales && session.role !== "MERCHANT";
  useEffect(() => {
    setAction(null);
    setEvidenceItem(null);
  }, [id, session.role, session.userId]);
  useEffect(() => {
    setStale(false);
  }, [data]);
  useEffect(() => {
    let active = true;
    const check = () => {
      if (!data || busy) return;
      void api
        .getApplication(id, session)
        .then((latest) => {
          if (active && latest.application.version !== data.application.version)
            setStale(true);
        })
        .catch(() => {});
    };
    window.addEventListener("workbench:updated", check);
    window.addEventListener("storage", check);
    return () => {
      active = false;
      window.removeEventListener("workbench:updated", check);
      window.removeEventListener("storage", check);
    };
  }, [data, id, session, busy]);
  const openAction = (next: "key-merchant" | "review-request") => {
    setReason("");
    setActionError("");
    setAction(next);
  };
  async function submitAction() {
    if (!data || !action || busy || stale) return;
    if (!reason.trim()) {
      setActionError("请填写操作原因");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await api.applicationAction(
        id,
        action,
        { reason: reason.trim() },
        data.application.version,
        session,
      );
      setAction(null);
      reload();
      notice(action === "key-merchant" ? "已标记重点商户" : "已生成复核工单");
    } catch (err) {
      const conflict =
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        err.status === 409;
      if (conflict) setStale(true);
      setActionError(
        conflict
          ? "申请已更新，请关闭预览并刷新后重试。"
          : err instanceof Error
            ? err.message
            : "操作失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  const application = data?.application;
  const merchant = data?.merchant;
  const orders =
    data?.workOrders?.filter(
      (order) =>
        !ops || order.type === "SUPPLEMENT" || order.type === "CHANNEL",
    ) ?? [];
  const checks = risk
    ? orders.flatMap((order) =>
        (order.checkItems ?? []).map((item) => ({
          ...item,
          orderId: order.id,
        })),
      )
    : [];
  const current = stages.findIndex((stage) => stage.key === application?.stage);
  const hardDeny = [
    ...(data?.events?.map((event) => event.reasonCode) ?? []),
    ...(data?.triage?.flatMap((entry) => entry.reasonCodes) ?? []),
  ].some((code) => code === "KYB-REG-INACTIVE" || code === "INT-BLOCK-EXACT");
  const canReview =
    application?.autoDecision === "DECLINED" &&
    !hardDeny &&
    !orders.some(
      (order) => order.overrideAutoReject && order.status !== "CLOSED",
    );
  const keyPermission =
    session.role === "OPS_LEAD" || (sales && me?.salesLead === true);
  const reviewPermission =
    session.role === "COMPLIANCE_SENIOR" || session.role === "COMPLIANCE_HEAD";
  return (
    <div className="page stack progress-pages">
      <nav aria-label="面包屑" className="progress-breadcrumb">
        <Link to="/applications">申请查询</Link>
        <span aria-hidden="true">/</span>
        <span>{id}</span>
      </nav>
      {stale && (
        <Banner
          status="warning"
          title="申请已更新，点击刷新"
          endContent={
            <Btn
              onClick={() => {
                setAction(null);
                reload();
              }}
              variant="secondary"
            >
              刷新
            </Btn>
          }
        />
      )}
      <LoadState loading={loading} error={error} retry={reload}>
        {data && application && merchant && (
          <>
            <Panel className="progress-detail-header">
              <div className="progress-title-row">
                <div className="row">
                  <Btn
                    onClick={() => navigate("/applications")}
                    icon={<ArrowLeft />}
                    variant="secondary"
                    title="返回申请查询"
                  >
                    返回申请查询
                  </Btn>
                  <h1>{merchant.legalName}</h1>
                  <Badge>{application.externalStatus}</Badge>
                  {application.isKeyMerchant && <Badge>重点</Badge>}
                </div>
                <div className="row">
                  {keyPermission && (
                    <Tooltip
                      content={
                        stale
                          ? "申请已更新，刷新后可用"
                          : application.isKeyMerchant
                            ? "已经是重点商户，无需重复标记"
                            : "标记重点商户"
                      }
                    >
                      <span>
                        <Btn
                          onClick={() => openAction("key-merchant")}
                          disabled={application.isKeyMerchant || stale}
                          icon={<Star />}
                          variant="secondary"
                        >
                          标记重点商户
                        </Btn>
                      </span>
                    </Tooltip>
                  )}
                  {reviewPermission && (
                    <Tooltip
                      content={
                        stale
                          ? "申请已更新，刷新后可用"
                          : hardDeny
                            ? "硬拒不可推翻，例外走受限案件"
                            : !canReview
                              ? "仅可对未发起复核的自动拒绝申请操作"
                              : "为自动拒绝申请发起复核"
                      }
                    >
                      <span>
                        <Btn
                          onClick={() => openAction("review-request")}
                          disabled={!canReview || stale}
                          icon={<RotateCcw />}
                          variant="primary"
                        >
                          发起复核
                        </Btn>
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
              <dl className="details-grid progress-details">
                <div>
                  <dt>申请号</dt>
                  <dd>
                    <IdText value={application.id} />
                  </dd>
                </div>
                <div>
                  <dt>注册地</dt>
                  <dd>{countryName(merchant.country)}</dd>
                </div>
                <div>
                  <dt>提交日期</dt>
                  <dd>{dateTime(application.createdAt)}</dd>
                </div>
                <div>
                  <dt>当前环节</dt>
                  <dd>{stages[current]?.title ?? "—"}</dd>
                </div>
                <div>
                  <dt>销售负责人</dt>
                  <dd>
                    <PersonName user={application.salesOwner} />
                  </dd>
                </div>
              </dl>
            </Panel>
            <Panel>
              <ol className="progress-stages" aria-label="申请处理进度">
                {stages.map((stage, index) => (
                  <li
                    key={stage.key}
                    aria-current={index === current ? "step" : undefined}
                    data-complete={
                      index < current && !!application.stageTimes?.[stage.key]
                    }
                    data-skipped={
                      index < current && !application.stageTimes?.[stage.key]
                    }
                  >
                    <span className="progress-stage-number">{index + 1}</span>
                    <div>
                      <strong>{stage.title}</strong>
                      <span className="secondary small">
                        {index < current
                          ? application.stageTimes?.[stage.key]
                            ? dateTime(application.stageTimes[stage.key])
                            : "跳过"
                          : index === current
                            ? "当前环节"
                            : "待进入"}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
            <Panel title="商户信息">
              <dl className="details-grid progress-details">
                {merchant.displayName && (
                  <div>
                    <dt>显示名</dt>
                    <dd>{merchant.displayName}</dd>
                  </div>
                )}
                {merchant.registrationNo && (
                  <div>
                    <dt>注册号</dt>
                    <dd>
                      <IdText value={merchant.registrationNo} />
                    </dd>
                  </div>
                )}
                {merchant.registrationAuthority && (
                  <div>
                    <dt>登记机构</dt>
                    <dd>{merchant.registrationAuthority}</dd>
                  </div>
                )}
                {merchant.declaredMcc && (
                  <div>
                    <dt>申报 MCC</dt>
                    <dd>{mccName(merchant.declaredMcc)}</dd>
                  </div>
                )}
                {merchant.expectedMonthlyVolume && (
                  <div>
                    <dt>预估月交易额</dt>
                    <dd>{money(merchant.expectedMonthlyVolume)}</dd>
                  </div>
                )}
                {merchant.website && (
                  <div>
                    <dt>网站</dt>
                    <dd>{merchant.website}</dd>
                  </div>
                )}
                {merchant.businessModel && (
                  <div>
                    <dt>业务模式</dt>
                    <dd>{merchant.businessModel}</dd>
                  </div>
                )}
              </dl>
            </Panel>
            {(ops || sales) && !!merchant.contacts?.length && (
              <Panel title="商户联系人">
                {merchant.contacts.map((contact) => (
                  <dl
                    className="details-grid progress-details"
                    key={`${contact.email}:${contact.name}`}
                  >
                    <div>
                      <dt>姓名</dt>
                      <dd>{contact.name}</dd>
                    </div>
                    <div>
                      <dt>邮箱</dt>
                      <dd>{contact.email || "—"}</dd>
                    </div>
                    <div>
                      <dt>电话</dt>
                      <dd>{contact.phone || "—"}</dd>
                    </div>
                    <div>
                      <dt>首选渠道</dt>
                      <dd>{channels[contact.preferredChannel]}</dd>
                    </div>
                  </dl>
                ))}
              </Panel>
            )}
            {internal && !!data.people?.length && (
              <DetailTable
                key={`people:${session.role}:${id}`}
                title="人员"
                rows={data.people}
                columns={[
                  { header: "姓名", key: "name", width: pixel(160) },
                  { header: "角色", key: "role" },
                  {
                    header: "重新验证",
                    key: "needsReverify",
                    renderCell: (person) =>
                      person.needsReverify ? (
                        <Badge tone="warning">需要重新验证</Badge>
                      ) : (
                        "无需重新验证"
                      ),
                  },
                  ...(risk
                    ? [
                        {
                          header: "持股比例",
                          key: "ownershipPct",
                          renderCell: (
                            person: NonNullable<typeof data.people>[number],
                          ) =>
                            person.ownershipPct === undefined ||
                            person.ownershipPct === 0
                              ? "—"
                              : `${person.ownershipPct.toFixed(1)}%`,
                        },
                        {
                          header: "申报状态",
                          key: "declared",
                          renderCell: (
                            person: NonNullable<typeof data.people>[number],
                          ) =>
                            person.declared ? (
                              "已申报"
                            ) : (
                              <Badge tone="warning">未申报</Badge>
                            ),
                        },
                        {
                          header: "验证状态",
                          key: "kycStatus",
                          renderCell: (person: { kycStatus?: string }) =>
                            verificationStatus(person.kycStatus),
                        },
                      ]
                    : []),
                ]}
              />
            )}
            {compliance && data.restrictedLocked && (
              <Banner status="info" title="已转受限" />
            )}
            {!!checks.length && (
              <DetailTable
                key={`checks:${session.role}:${id}`}
                title="检查项与证据"
                rows={checks}
                columns={[
                  {
                    header: "检查项",
                    key: "title",
                    width: pixel(260),
                    renderCell: (item) => (
                      <div className="progress-cell-stack">
                        <span>
                          {item.reasonCodes.map(reasonName).join(" · ") ||
                            item.title}
                        </span>
                        {compliance && (
                          <span
                            className={["secondary", "progress-code"].join(" ")}
                          >
                            {item.reasonCodes.join(" · ")}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: "结论",
                    key: "conclusion",
                    renderCell: (item) =>
                      CHECK_OPTIONS[item.checkType].find(
                        (option) => option.value === item.conclusion,
                      )?.label ??
                      (item.status === "AUTO_CLOSED"
                        ? "自动通过"
                        : item.conclusion
                          ? (decisionNames[item.conclusion] ??
                            statusLabel(item.conclusion))
                          : "待处理"),
                  },
                  { header: "原因", key: "conclusionReason" },
                  {
                    header: "处理人",
                    key: "decidedBy",
                    renderCell: (item) => <PersonName user={item.decidedBy} />,
                  },
                  {
                    header: "结论时间",
                    key: "decidedAt",
                    renderCell: (item) => dateTime(item.decidedAt),
                  },
                  {
                    header: "证据",
                    key: "evidence",
                    renderCell: (item) => (
                      <Btn
                        onClick={() => setEvidenceItem(item)}
                        variant="ghost"
                      >
                        查看{item.snapshotId ? "快照" : "证据"}
                      </Btn>
                    ),
                  },
                ]}
              />
            )}
            {session.role === "APPROVER" &&
              !!data.submittedMaterials?.length && (
                <Panel title="商户提交材料">
                  <div className="ev-documents">
                    {data.submittedMaterials.map((file) => (
                      <FileSpecimen key={file.id} file={file} />
                    ))}
                  </div>
                </Panel>
              )}
            {(ops || compliance || sales) &&
              data.supplements
                ?.filter((order) => order.items?.length)
                .map((order) => (
                  <Panel
                    key={order.id}
                    title={
                      sales ? (
                        "待补充资料"
                      ) : (
                        <div className="row">
                          补件工单
                          <IdText value={order.id} />
                          <StatusBadge status={order.status} />
                        </div>
                      )
                    }
                    actions={
                      !sales ? (
                        <Link to={orderPath(order)}>查看工单</Link>
                      ) : undefined
                    }
                  >
                    {!sales && (
                      <p className="secondary">
                        商户截止：{deadlineDate(order.dueAt, merchant.country)}
                      </p>
                    )}
                    <ul className="progress-supplement-list">
                      {order.items?.map((item) => (
                        <li key={item.id}>
                          <span>{item.externalText}</span>
                          {!sales && (
                            <Badge>{supplementNames[item.status]}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ))}
            {(ops || compliance) && !!data.channels?.length && (
              <DetailTable
                key={`channels:${session.role}:${id}`}
                title="渠道提交"
                rows={data.channels}
                columns={[
                  { header: "渠道", key: "channelName", width: pixel(160) },
                  {
                    header: "提交号",
                    key: "submissionNo",
                    renderCell: (channel) => (
                      <IdText value={channel.submissionNo} />
                    ),
                  },
                  {
                    header: "回执类型",
                    key: "receiptType",
                    renderCell: (channel) =>
                      channel.receiptType
                        ? {
                            REJECTED: "驳回",
                            MORE_INFO: "要求补充材料",
                            TIMEOUT: "超时",
                          }[channel.receiptType]
                        : "—",
                  },
                  { header: "上游原文", key: "upstreamReasonRaw" },
                  {
                    header: "提交时间",
                    key: "submittedAt",
                    renderCell: (channel) => dateTime(channel.submittedAt),
                  },
                ]}
              />
            )}
            {sales && application.stage === "CHANNEL" && (
              <Panel>渠道进件中</Panel>
            )}
            {(ops || risk) && merchant.conditions && (
              <Panel title="附加条件">
                <dl className="details-grid progress-details">
                  <div>
                    <dt>单笔限额</dt>
                    <dd>
                      {money({
                        amount: merchant.conditions.singleLimit,
                        currency:
                          merchant.expectedMonthlyVolume?.currency ?? "USD",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>月限额</dt>
                    <dd>
                      {money({
                        amount: merchant.conditions.monthlyLimit,
                        currency:
                          merchant.expectedMonthlyVolume?.currency ?? "USD",
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>风险准备金比例</dt>
                    <dd>{merchant.conditions.reservePct.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>准备金期限</dt>
                    <dd>{merchant.conditions.reserveDays}天</dd>
                  </div>
                  <div>
                    <dt>复审周期</dt>
                    <dd>{merchant.conditions.reviewDays}天</dd>
                  </div>
                </dl>
              </Panel>
            )}
            {risk && !!data.approvalDecisions?.length && (
              <DetailTable
                key={`approvals:${session.role}:${id}`}
                title="审批记录"
                rows={data.approvalDecisions}
                columns={[
                  {
                    header: "决定",
                    key: "decision",
                    width: pixel(150),
                    renderCell: (entry) =>
                      decisionNames[entry.decision] ??
                      statusLabel(entry.decision),
                  },
                  {
                    header: "原因",
                    key: "reason",
                    renderCell: (entry) =>
                      entry.reason ? reasonName(entry.reason) : "—",
                  },
                  {
                    header: "审批人",
                    key: "approvers",
                    renderCell: (entry) => (
                      <div className="row">
                        {entry.approvers.map((person) => (
                          <PersonName key={person.id} user={person} />
                        ))}
                      </div>
                    ),
                  },
                  {
                    header: "时间",
                    key: "at",
                    renderCell: (entry) => dateTime(entry.at),
                  },
                ]}
              />
            )}
            {(ops || compliance) && !!data.contactLog?.length && (
              <DetailTable
                key={`contacts:${session.role}:${id}`}
                title="沟通记录"
                rows={data.contactLog}
                columns={[
                  {
                    header: "时间",
                    key: "at",
                    width: pixel(180),
                    renderCell: (entry) => dateTime(entry.at),
                  },
                  {
                    header: "方式",
                    key: "channel",
                    renderCell: (entry) => channels[entry.channel],
                  },
                  { header: "摘要", key: "summary" },
                  {
                    header: "记录人",
                    key: "by",
                    renderCell: (entry) => <PersonName user={entry.by} />,
                  },
                ]}
              />
            )}
            {orders
              .filter(
                (order) =>
                  (risk && order.complianceNote) ||
                  ((ops || compliance) && order.opsNote),
              )
              .map((order) => (
                <Panel
                  key={order.id}
                  title={
                    <div className="row">
                      内部备注
                      <IdText value={order.id} />
                    </div>
                  }
                >
                  {risk && order.complianceNote && (
                    <p>合规：{order.complianceNote}</p>
                  )}
                  {(ops || compliance) && order.opsNote && (
                    <p>运营：{order.opsNote}</p>
                  )}
                </Panel>
              ))}
            {risk && checks.some((item) => item.note) && (
              <Panel title="合规内部备注">
                {checks
                  .filter((item) => item.note)
                  .map((item) => (
                    <p key={item.id}>
                      <strong>{item.title}：</strong>
                      {item.note}
                    </p>
                  ))}
              </Panel>
            )}
            {session.role === "COMPLIANCE_HEAD" &&
              orders
                .filter(
                  (order) =>
                    order.type === "RESTRICTED" &&
                    (order.restrictedReason || order.caseId),
                )
                .map((order) => (
                  <Panel key={order.id} title="受限内容">
                    <dl className="details-grid progress-details">
                      {order.restrictedReason && (
                        <div>
                          <dt>转受限原因</dt>
                          <dd>{order.restrictedReason}</dd>
                        </div>
                      )}
                      {order.caseId && (
                        <div>
                          <dt>案件编号</dt>
                          <dd>
                            <IdText value={order.caseId} />
                          </dd>
                        </div>
                      )}
                    </dl>
                  </Panel>
                ))}
            {risk && !!data.events?.length && (
              <DetailTable
                key={`events:${session.role}:${id}`}
                title="风险事件"
                rows={data.events}
                columns={[
                  {
                    header: "原因",
                    key: "reasonCode",
                    width: pixel(260),
                    renderCell: (event) => (
                      <div className="progress-cell-stack">
                        <span>{reasonName(event.reasonCode)}</span>
                        {compliance && (
                          <span
                            className={["secondary", "progress-code"].join(" ")}
                          >
                            {event.reasonCode}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: "等级",
                    key: "severity",
                    renderCell: (event) =>
                      severityNames[event.severity] ??
                      statusLabel(event.severity),
                  },
                  { header: "来源", key: "source" },
                  {
                    header: "时间",
                    key: "createdAt",
                    renderCell: (event) => dateTime(event.createdAt),
                  },
                ]}
              />
            )}
            {(ops || compliance) && !!data.audit?.length && (
              <Panel title="审计日志">
                <Timeline audit={data.audit} />
              </Panel>
            )}
            {internal && (
              <DetailTable
                key={`orders:${session.role}:${id}`}
                title="相关工单"
                rows={orders}
                columns={[
                  {
                    header: "工单号",
                    key: "id",
                    width: pixel(200),
                    renderCell: (order) => (
                      <Link to={orderPath(order)}>
                        <IdText value={order.id} />
                      </Link>
                    ),
                  },
                  {
                    header: "类型",
                    key: "type",
                    renderCell: (order) => orderNames[order.type],
                  },
                  {
                    header: "状态",
                    key: "status",
                    renderCell: (order) => (
                      <StatusBadge status={order.status} />
                    ),
                  },
                  {
                    header: "处理人",
                    key: "assignee",
                    renderCell: (order) => <PersonName user={order.assignee} />,
                  },
                ]}
                onActivate={(order) => navigate(orderPath(order))}
              />
            )}
            <Confirm
              open={action !== null}
              title={action === "key-merchant" ? "标记重点商户" : "发起复核"}
              description={
                action === "key-merchant"
                  ? "该申请将标记为重点商户，关联工单优先级上调一级，操作原因写入审计记录。"
                  : "生成复核工单，原自动拒绝不会直接撤销；推翻原拒绝需要两人确认。"
              }
              merchant="现有对外状态不变。"
              sales={
                action === "key-merchant"
                  ? "可看到重点商户标记，审核结果不变。"
                  : "只看到对外进度，不披露内部拒绝原因。"
              }
              reversible="不能直接撤销；后续处理需保留审计记录。"
              confirmLabel={
                action === "key-merchant" ? "确认标记重点商户" : "确认发起复核"
              }
              onConfirm={submitAction}
              onClose={() => !busy && setAction(null)}
              busy={busy}
              confirmDisabled={!reason?.trim() || stale}
            >
              <TextArea
                label="操作原因"
                value={reason}
                onChange={setReason}
                rows={3}
                maxLength={500}
                isRequired
                isDisabled={busy}
              />
              {actionError && <Banner status="error" title={actionError} />}
            </Confirm>
          </>
        )}
      </LoadState>
      <Dialog
        isOpen={!!evidenceItem}
        onOpenChange={(open) => {
          if (!open) setEvidenceItem(null);
        }}
        width={960}
        maxHeight="90dvh"
        aria-labelledby="application-evidence-title"
      >
        <div className="stack">
          <div className="spread">
            <h2 id="application-evidence-title" className="section-title">
              {evidenceItem?.title ?? "证据"}
            </h2>
            <Btn onClick={() => setEvidenceItem(null)}>关闭</Btn>
          </div>
          {evidenceItem && <ApplicationEvidence item={evidenceItem} />}
        </div>
      </Dialog>
    </div>
  );
}
