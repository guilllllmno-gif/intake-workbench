import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  Table,
  pixel,
  proportional,
  useTableStickyColumns,
  type TableColumn,
  type TablePlugin,
} from "@astryxdesign/core/Table";
import { api } from "../api";
import {
  useAsync,
  useDetailView,
  useOrder,
  useQueueFlow,
  useSession,
} from "../hooks";
import {
  Badge,
  Panel,
  Confirm,
  Empty,
  IdText,
  DialogHeader,
  LoadState,
  OrderHeader,
  OrderSummary,
  DetailTabs,
  DetailSection,
  PersonName,
  Timeline,
} from "../ui";
import { CHECK_OPTIONS, DECLINE_CONCLUSIONS, reasonName } from "../catalog";
import { dateTime, money } from "../format";
import EvidencePanel, { emptyEvidenceDraft } from "../components/EvidencePanel";
import type { ApprovalConditions, ApprovalDecision, CheckItem } from "../types";
import "./decision-pages.css";

const decisionLabels: Record<string, string> = {
  APPROVED: "批准",
  APPROVED_WITH_CONDITIONS: "附条件批准",
  DECLINED: "拒绝",
  RETURN: "退回补充调查",
  DISAGREE: "驳回第一审批意见",
};
const rejectionOptions = [
  "业务风险超出准入标准",
  "经营模式不符合准入要求",
  "材料不足以支持准入判断",
].map((value) => ({ value, label: value }));
const ignoreDraft = () => {};

function Snapshot({ id }: { id: string }) {
  const { session } = useSession();
  const resource = useAsync(
    () => api.snapshot(id, session),
    [id, session.userId, session.role],
  );
  return (
    <LoadState
      loading={resource.loading}
      error={resource.error}
      retry={resource.reload}
    >
      {resource.data ? (
        <div className="dv-stack">
          <dl className="details-grid">
            <div>
              <dt>证据快照</dt>
              <dd>
                <IdText value={resource.data.id} />
              </dd>
            </div>
            <div>
              <dt>保存时间</dt>
              <dd>{dateTime(resource.data.at)}</dd>
            </div>
          </dl>
          {resource.data.checkItems.map((item) => (
            <Panel title={item.title} key={item.id}>
              <dl className="details-grid">
                <div>
                  <dt>当时结论</dt>
                  <dd>
                    {CHECK_OPTIONS[item.checkType]?.find(
                      (option) => option.value === item.conclusion,
                    )?.label || "—"}
                  </dd>
                </div>
                <div>
                  <dt>处理人</dt>
                  <dd>
                    <PersonName user={item.decidedBy} />
                  </dd>
                </div>
                <div className="dv-full">
                  <dt>结论原因</dt>
                  <dd>{item.conclusionReason || "—"}</dd>
                </div>
              </dl>
              <EvidencePanel
                evidence={resource.data!.evidence.filter((evidence) =>
                  item.evidenceIds.includes(evidence.id),
                )}
                item={item}
                draft={emptyEvidenceDraft()}
                onDraft={ignoreDraft}
                readOnly
              />
            </Panel>
          ))}
        </div>
      ) : (
        <Empty title="未找到证据快照" />
      )}
    </LoadState>
  );
}

export default function ApprovalPage() {
  const { data, loading, error, mutationError, reload, busy, act, stale } =
    useOrder();
  const { session } = useSession();
  const queueFlow = useQueueFlow();
  const [view, setView] = useDetailView("risk", [
    "risk",
    "evidence",
    "history",
  ]);
  const me = useAsync(() => api.me(session), [session.userId, session.role]);
  const users = useAsync(
    () => api.users(session),
    [session.userId, session.role],
  );
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState<Partial<ApprovalConditions>>({});
  const [snapshotId, setSnapshotId] = useState("");
  const stickyColumns = useTableStickyColumns<
    CheckItem & Record<string, unknown>
  >({ startKeys: ["title"] });
  const snapshotRows: TablePlugin<CheckItem & Record<string, unknown>> = {
    transformBodyRow: (props, item) =>
      item.snapshotId
        ? {
            ...props,
            htmlProps: {
              ...props.htmlProps,
              className: `${props.htmlProps.className || ""} dv-clickable`,
              onClick: (event) => {
                props.htmlProps.onClick?.(event);
                if (
                  !event.defaultPrevented &&
                  !(event.target as HTMLElement).closest("button, a")
                )
                  setSnapshotId(item.snapshotId!);
              },
            },
          }
        : props,
  };
  useEffect(() => {
    setDecision("");
    setReason("");
    setConditions({});
    setSnapshotId("");
  }, [data?.workOrder.id, session.userId, session.role]);
  if (!data)
    return (
      <LoadState loading={loading} error={error} retry={reload}>
        <Empty title="未找到审批工单" />
      </LoadState>
    );
  const { workOrder: order, merchant } = data;
  const checks = order.checkItems || [];
  const actors = order.approvalActorIds || [];
  const reasons = order.approvalReasons || [];
  const waitingSecond = actors.length === 1;
  const highestLimit = Math.max(
    0,
    ...(users.data || [])
      .filter((user) => user.roles.includes("APPROVER"))
      .map((user) => user.approvalLimit || 0),
  );
  const exceedsHighest =
    highestLimit > 0 && merchant.expectedMonthlyVolume.amount > highestLimit;
  const highestAuthority =
    exceedsHighest &&
    me.data?.authority === "MANAGEMENT" &&
    me.data.approvalLimit === highestLimit;
  const dual = Boolean(
    order.requiresDual ||
    reasons.includes("INT-PEP") ||
    order.overrideAutoReject ||
    exceedsHighest,
  );
  let first: ApprovalDecision | undefined;
  for (const entry of data.approvalDecisions || [])
    if (entry.approvers.some((user) => user.id === actors[0])) first = entry;
  const blocked =
    session.role !== "APPROVER"
      ? "仅审批人可以提交审批"
      : order.assignee && order.assignee.id !== session.userId
        ? `${order.assignee.name}正在处理，转派给你后可审批`
        : order.status !== "PENDING_APPROVAL"
          ? "当前工单不在待审批状态"
          : order.submittedBy?.id === session.userId ||
              data.application.submittedBy?.id === session.userId ||
              checks.some((item) => item.decidedBy?.id === session.userId)
            ? "不能审批自己提交或处理的申请"
            : actors.includes(session.userId)
              ? "您已提交，请由另一位审批人复核"
              : stale
                ? "工单已更新，请刷新后操作"
                : "";
  const authorityBlock =
    me.loading || users.loading
      ? "正在读取审批授权"
      : me.error || users.error
        ? "审批授权加载失败，请重试"
        : merchant.expectedMonthlyVolume.amount >
              (me.data?.approvalLimit ?? 0) && !highestAuthority
          ? "超出你的审批额度"
          : reasons.includes("INT-PEP") && me.data?.authority !== "MANAGEMENT"
            ? "政治公众人物审批需要高级管理层授权"
            : "";
  const conditionsValid =
    [
      "singleLimit",
      "monthlyLimit",
      "reservePct",
      "reserveDays",
      "reviewDays",
    ].every((key) => {
      const value = conditions[key as keyof ApprovalConditions];
      return (
        value !== undefined &&
        Number.isFinite(value) &&
        (key === "reservePct" || key === "reserveDays" ? value >= 0 : value > 0)
      );
    }) &&
    (conditions.reservePct ?? 101) <= 100 &&
    (conditions.singleLimit ?? Infinity) <= (conditions.monthlyLimit ?? 0) &&
    Number.isInteger(conditions.reserveDays) &&
    Number.isInteger(conditions.reviewDays);
  const valid =
    !blocked &&
    (decision === "RETURN" || !authorityBlock) &&
    (decision === "APPROVED" || Boolean(reason.trim())) &&
    (decision !== "APPROVED_WITH_CONDITIONS" || conditionsValid);
  const choose = (value: string) => {
    setDecision(value);
    setReason("");
    setConditions({});
  };
  const submit = async () => {
    if (!valid) return null;
    const result = await act("approval", {
      decision,
      reason: reason.trim(),
      ...(decision === "APPROVED_WITH_CONDITIONS" ? { conditions } : {}),
    });
    if (result) setDecision("");
    return result;
  };
  const firstDual =
    dual && !waitingSecond && !["RETURN", "DISAGREE"].includes(decision);
  const outcome =
    waitingSecond && !["RETURN", "DISAGREE"].includes(decision)
      ? decision === "DECLINED" || first?.decision === "DECLINED"
        ? "DECLINED"
        : decision === "APPROVED_WITH_CONDITIONS" ||
            first?.decision === "APPROVED_WITH_CONDITIONS"
          ? "APPROVED_WITH_CONDITIONS"
          : decision
      : decision;
  const description =
    decision === "RETURN"
      ? "工单从待审批回到处理中，退回原合规审核员；审批说明将写入记录。"
      : decision === "DISAGREE"
        ? "撤回待确认意见，工单仍为待审批，交回第一位审批人重新决定。"
        : firstDual
          ? "保存第一审批意见，复核进度更新为 1/2；另一位审批人确认前，申请不进入渠道进件。"
          : outcome === "DECLINED"
            ? "工单结案为拒绝，申请变为未通过；保留两位审批人的内部意见。"
            : outcome === "APPROVED_WITH_CONDITIONS"
              ? "工单结案为附条件通过，申请进入渠道进件；以最后一位提交附条件意见的审批条件写入商户配置。"
              : "工单结案为通过，申请进入渠道进件。";
  const external =
    firstDual || ["RETURN", "DISAGREE"].includes(decision)
      ? "审核中"
      : outcome === "DECLINED"
        ? "未通过：很抱歉，您的申请未通过审核。"
        : "已通过，渠道进件中";
  const columns: TableColumn<CheckItem & Record<string, unknown>>[] = [
    {
      key: "title",
      header: "检查项",
      width: proportional(1),
      renderCell: (item) =>
        item.snapshotId ? (
          <Button
            label={item.title}
            variant="ghost"
            size="sm"
            onClick={() => setSnapshotId(item.snapshotId!)}
          />
        ) : (
          item.title
        ),
    },
    {
      key: "conclusion",
      header: "结论",
      width: pixel(130),
      renderCell: (item) => (
        <Badge
          tone={
            DECLINE_CONCLUSIONS[item.conclusion || ""] ? "danger" : "neutral"
          }
        >
          {CHECK_OPTIONS[item.checkType]?.find(
            (option) => option.value === item.conclusion,
          )?.label || "—"}
        </Badge>
      ),
    },
    {
      key: "conclusionReason",
      header: "原因",
      width: proportional(2),
      renderCell: (item) => item.conclusionReason || "—",
    },
    {
      key: "decidedBy",
      header: "处理人",
      width: pixel(120),
      renderCell: (item) => <PersonName user={item.decidedBy} />,
    },
    {
      key: "decidedAt",
      header: "结论时间",
      width: pixel(155),
      renderCell: (item) => dateTime(item.decidedAt),
    },
    {
      key: "snapshotId",
      header: "证据快照",
      width: pixel(160),
      renderCell: (item) =>
        item.snapshotId ? <IdText value={item.snapshotId} /> : "—",
    },
  ];
  const action = (value: string) => {
    const unavailable =
      blocked ||
      ((!order.assignee || value !== "RETURN") && authorityBlock) ||
      "";
    return (
      <Button
        key={value}
        label={decisionLabels[value]}
        variant="secondary"
        className={value === "DECLINED" ? "dv-danger-action" : undefined}
        tooltip={unavailable || undefined}
        isDisabled={Boolean(unavailable) || busy}
        onClick={async () => {
          if (order.assignee || (await act("claim"))) choose(value);
        }}
      />
    );
  };
  return (
    <div className="page dv-page detail-page dv-decision-page">
      <OrderHeader
        data={data}
        actions={
          order.status === "CLOSED" || order.status === "IN_PROGRESS" ? (
            <Button
              label="领取下一单"
              variant="primary"
              isLoading={queueFlow.busy}
              onClick={() => void queueFlow.next(order.id)}
            />
          ) : undefined
        }
      />
      {error && (
        <div className="dv-notice dv-error" role="alert">
          {error.message}
        </div>
      )}
      {mutationError && !decision && (
        <div className="dv-notice dv-error" role="alert">
          {mutationError}
        </div>
      )}
      {stale && (
        <div className="dv-notice dv-warning" role="alert">
          <span>工单已更新，点击刷新</span>
          <Button label="刷新" onClick={reload} />
        </div>
      )}
      {(me.error || users.error) && session.role === "APPROVER" && (
        <div className="dv-notice dv-error" role="alert">
          <span>{(me.error || users.error)?.message}</span>
          <Button
            label="重试"
            onClick={() => {
              me.reload();
              users.reload();
            }}
          />
        </div>
      )}
      <DetailTabs
        id="approval-detail"
        value={view}
        onChange={setView}
        label="审批工单详情"
        items={[
          { value: "risk", label: "风险与审批原因", count: reasons.length },
          { value: "evidence", label: "结论与证据", count: checks.length },
          {
            value: "history",
            label: "审批记录与日志",
            count: data.approvalDecisions?.length || 0,
          },
        ]}
      />
      <div className="detail-layout">
        <div className="detail-main">
          <DetailSection id="approval-detail" value="risk" active={view}>
            <div className="dv-two-columns">
              <Panel title="审批原因">
                {reasons.length ? (
                  reasons.map((code) => {
                    const source = checks.find((item) =>
                      item.reasonCodes.includes(code),
                    );
                    return (
                      <div className="dv-reason" key={code}>
                        <strong>{reasonName(code)}</strong>
                        <div className="dv-source-check">
                          来源检查项：{source?.title || "准入规则"}
                        </div>
                        <p className="secondary">
                          {source?.conclusionReason ||
                            (code === "INT-PEP"
                              ? "需两位高级管理层审批人确认。"
                              : "该项超出常规准入范围，需授权审批。")}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <Empty
                    title="无审批原因"
                    description="当前工单未记录审批原因。"
                  />
                )}
              </Panel>
              <Panel title="风险敞口">
                <dl className="details-grid">
                  <div>
                    <dt>预估月交易额</dt>
                    <dd>{money(merchant.expectedMonthlyVolume)}</dd>
                  </div>
                  <div>
                    <dt>平均单笔</dt>
                    <dd>{money(merchant.averageTransaction)}</dd>
                  </div>
                  <div>
                    <dt>MCC 风险</dt>
                    <dd>{merchant.mccRisk || "—"}</dd>
                  </div>
                  <div>
                    <dt>国家风险</dt>
                    <dd>{merchant.countryRisk || "—"}</dd>
                  </div>
                  <div>
                    <dt>新主体</dt>
                    <dd>
                      {merchant.isNewEntity == null
                        ? "—"
                        : merchant.isNewEntity
                          ? "是"
                          : "否"}
                    </dd>
                  </div>
                  <div>
                    <dt>我的审批额度</dt>
                    <dd>
                      {me.data?.approvalLimit == null
                        ? "—"
                        : money({
                            amount: me.data.approvalLimit,
                            currency: merchant.expectedMonthlyVolume.currency,
                          })}
                    </dd>
                  </div>
                  <div>
                    <dt>我的授权</dt>
                    <dd>
                      {me.data?.authority === "MANAGEMENT"
                        ? "高级管理层"
                        : me.data?.authority === "RISK"
                          ? "风控负责人"
                          : "—"}
                    </dd>
                  </div>
                </dl>
              </Panel>
            </div>
          </DetailSection>
          <DetailSection id="approval-detail" value="evidence" active={view}>
            <Panel title="检查项结论" className="dense-table">
              <Table
                aria-label="检查项结论"
                idKey="id"
                density="compact"
                columns={columns}
                hasHover
                plugins={{ stickyColumns, snapshotRows }}
                data={checks as (CheckItem & Record<string, unknown>)[]}
              />
            </Panel>
          </DetailSection>
          <DetailSection id="approval-detail" value="history" active={view}>
            {!data.approvalDecisions?.length && (
              <Panel title="审批记录">
                <Empty
                  title="暂无审批记录"
                  description="提交审批意见后，决定、条件与审批人将在这里保留。"
                />
              </Panel>
            )}
            {!!data.approvalDecisions?.length && (
              <Panel title="审批记录">
                <div className="dv-stack">
                  {data.approvalDecisions.map((entry) => (
                    <div className="dv-record" key={entry.id}>
                      <div className="row">
                        <Badge
                          tone={
                            entry.decision === "DECLINED" ? "danger" : "neutral"
                          }
                        >
                          {decisionLabels[entry.decision] || "审批意见"}
                        </Badge>
                        {entry.approvers.map((user) => (
                          <PersonName key={user.id} user={user} />
                        ))}
                        <span className="secondary">{dateTime(entry.at)}</span>
                      </div>
                      <p>{entry.reason || "—"}</p>
                      {entry.conditions && (
                        <dl className="details-grid">
                          <div>
                            <dt>单笔限额</dt>
                            <dd>
                              {money({
                                amount: entry.conditions.singleLimit,
                                currency:
                                  merchant.expectedMonthlyVolume.currency,
                              })}
                            </dd>
                          </div>
                          <div>
                            <dt>月限额</dt>
                            <dd>
                              {money({
                                amount: entry.conditions.monthlyLimit,
                                currency:
                                  merchant.expectedMonthlyVolume.currency,
                              })}
                            </dd>
                          </div>
                          <div>
                            <dt>准备金比例</dt>
                            <dd>{entry.conditions.reservePct.toFixed(1)}%</dd>
                          </div>
                          <div>
                            <dt>准备金期限</dt>
                            <dd>{entry.conditions.reserveDays} 天</dd>
                          </div>
                          <div>
                            <dt>复审周期</dt>
                            <dd>{entry.conditions.reviewDays} 天</dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            {data.audit && (
              <Panel title="操作日志">
                <Timeline audit={data.audit} />
              </Panel>
            )}
          </DetailSection>
        </div>
        <aside className="detail-aside dv-decision-aside">
          <OrderSummary data={data} title="当前审批">
            <div className="dv-stack">
              {order.status === "CLOSED" && (
                <div className="dv-notice" role="status">
                  审批结果：
                  {decisionLabels[order.outcome || ""] ||
                    order.outcome ||
                    "已结束"}
                  <br />
                  申请当前状态：{data.application.externalStatus}
                </div>
              )}
              {exceedsHighest && (
                <div className="dv-notice dv-warning">
                  预估月交易额超出最高授权档 · 需要双人最高档高级管理层审批。
                </div>
              )}
              {(dual || waitingSecond) && (
                <div className="dv-notice">
                  <strong>复核进度 {Math.min(actors.length, 2)}/2</strong>
                  {first && (
                    <>
                      <PersonName
                        user={first.approvers.find(
                          (user) => user.id === actors[0],
                        )}
                      />
                      <Badge
                        tone={
                          first.decision === "DECLINED" ? "danger" : "neutral"
                        }
                      >
                        {decisionLabels[first.decision] || "—"}
                      </Badge>
                    </>
                  )}
                </div>
              )}
              {!dual && !waitingSecond && (
                <p className="secondary dv-context-copy">复核要求：单人审批</p>
              )}
              {order.status !== "CLOSED" && (
                <p className="secondary dv-context-copy">
                  {blocked ||
                    authorityBlock ||
                    (waitingSecond
                      ? "核对第一审批意见与证据后，提交复核决定。"
                      : "核对风险敞口与证据后选择审批结果，提交前可预览影响。")}
                </p>
              )}
              {session.role === "APPROVER" &&
                order.status === "PENDING_APPROVAL" && (
                  <div
                    className="detail-context-actions dv-approval-actions"
                    role="group"
                    aria-label="审批操作"
                  >
                    {action("APPROVED")}
                    {action("APPROVED_WITH_CONDITIONS")}
                    {action("DECLINED")}
                    {action("RETURN")}
                    {waitingSecond && action("DISAGREE")}
                  </div>
                )}
              <Button
                label="查看结论与证据"
                variant="ghost"
                className="detail-shortcut"
                onClick={() => setView("evidence")}
              />
              <Button
                label="查看审批记录"
                variant="ghost"
                className="detail-shortcut"
                onClick={() => setView("history")}
              />
            </div>
          </OrderSummary>
        </aside>
      </div>
      <Dialog
        isOpen={Boolean(snapshotId)}
        width={920}
        onOpenChange={(open) => {
          if (!open) setSnapshotId("");
        }}
        purpose="info"
      >
        <DialogHeader
          title="结论时证据快照"
          onOpenChange={(open) => {
            if (!open) setSnapshotId("");
          }}
        />
        {snapshotId && <Snapshot id={snapshotId} />}
      </Dialog>
      <Confirm
        open={Boolean(decision)}
        title={`${decisionLabels[decision] || "审批"} · 后果预览`}
        description={description}
        merchant={external}
        sales={
          firstDual || ["RETURN", "DISAGREE"].includes(decision)
            ? "审核中"
            : outcome === "DECLINED"
              ? "未通过"
              : "已通过，渠道进件中"
        }
        reversible={
          firstDual
            ? "生效前可由第二位审批人驳回；已保存的审批记录不可删除。"
            : "本次决定不可直接撤销；后续按复核流程处理，审批记录永久保留。"
        }
        confirmLabel={`确认${decisionLabels[decision] || "提交"}`}
        onConfirm={submit}
        onClose={() => setDecision("")}
        busy={busy}
        error={mutationError}
        confirmDisabled={!valid}
        danger={outcome === "DECLINED"}
      >
        <div className="dv-stack">
          {stale && <Button label="刷新工单" onClick={reload} />}
          {waitingSecond && !["RETURN", "DISAGREE"].includes(decision) && (
            <div className="dv-notice" role="status">
              本次意见：{decisionLabels[decision]}；综合两位审批人的最终结果：
              {decisionLabels[outcome]}
              。任一人拒绝则最终拒绝，否则保留附条件批准。
            </div>
          )}
          {decision === "DECLINED" ? (
            <>
              <div className="dv-danger-selection" role="status">
                已选择拒绝 · 提交后将按审批规则生效
              </div>
              <Selector
                label="内部拒绝原因"
                isRequired
                value={reason || undefined}
                placeholder="选择拒绝原因"
                options={rejectionOptions}
                onChange={setReason}
              />
              <dl className="details-grid">
                <div>
                  <dt>对外类别</dt>
                  <dd>按申请原因与披露规则确定，内部审批说明不对外展示</dd>
                </div>
                <div>
                  <dt>商户文案</dt>
                  <dd>很抱歉，您的申请未通过审核。</dd>
                </div>
              </dl>
            </>
          ) : (
            <TextArea
              label="审批说明"
              isRequired={decision !== "APPROVED"}
              isOptional={decision === "APPROVED"}
              value={reason}
              onChange={setReason}
              rows={3}
              placeholder={
                decision === "APPROVED"
                  ? "填写审批意见（选填）"
                  : "填写决定依据"
              }
            />
          )}
          {decision === "APPROVED_WITH_CONDITIONS" && (
            <div className="dv-form-grid">
              {(
                [
                  {
                    key: "singleLimit",
                    label: `单笔限额（${merchant.expectedMonthlyVolume.currency}）`,
                  },
                  {
                    key: "monthlyLimit",
                    label: `月限额（${merchant.expectedMonthlyVolume.currency}）`,
                  },
                  { key: "reservePct", label: "风险准备金比例（%）" },
                  { key: "reserveDays", label: "准备金期限（天）" },
                  { key: "reviewDays", label: "复审周期（天）" },
                ] as const
              ).map((field) => (
                <NumberInput
                  key={field.key}
                  label={field.label}
                  isRequired
                  hasClear
                  value={conditions[field.key]}
                  min={
                    field.key === "reservePct" || field.key === "reserveDays"
                      ? 0
                      : 1
                  }
                  max={field.key === "reservePct" ? 100 : undefined}
                  step={field.key === "reservePct" ? 0.1 : 1}
                  isIntegerOnly={field.key !== "reservePct"}
                  isWheelEnabled={false}
                  onChange={(value) =>
                    setConditions((current) => ({
                      ...current,
                      [field.key]:
                        value == null
                          ? undefined
                          : field.key === "reservePct"
                            ? Math.round(value * 10) / 10
                            : value,
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Confirm>
    </div>
  );
}
