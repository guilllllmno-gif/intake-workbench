import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
  Table,
  proportional,
  pixel,
  useTableStickyColumns,
  type TableColumn,
  type TablePlugin,
} from "@astryxdesign/core/Table";
import { useDetailView, useOrder, useQueueFlow, useSession } from "../hooks";
import {
  Confirm,
  Badge,
  DetailSection,
  DetailTabs,
  Panel,
  Empty,
  IdText,
  LoadState,
  OrderHeader,
  Timeline,
} from "../ui";
import { CHECK_LABELS, CHECK_OPTIONS, DECLINE_CONCLUSIONS } from "../catalog";
import { dateTime } from "../format";
import EvidencePanel, { emptyEvidenceDraft } from "../components/EvidencePanel";
import type { CheckItem } from "../types";
import "../review.css";
import "./decision-pages.css";

const overallOptions = [
  { value: "APPROVED", label: "应通过" },
  { value: "DECLINED", label: "应拒绝" },
  { value: "MANUAL_REVIEW", label: "应转人工" },
];
const correctiveOptions = [
  { value: "REOPEN_REVIEW", label: "生成复审工单" },
  { value: "RESTORE_APPLICATION", label: "联系商户恢复申请" },
  { value: "RULE_CHANGE", label: "提交规则变更建议" },
];
const mismatchOptions = [
  "证据理解不一致",
  "规则适用不准确",
  "关键信息遗漏",
  "证据更新导致差异",
  "原结论录入错误",
].map((value) => ({ value, label: value }));
const ignoreDraft = () => {};
type ComparisonRow = {
  id: string;
  title: string;
  independent: string;
  original: string;
  consistent: boolean;
};
const blindViews = ["evidence"] as const;
const revealedViews = ["evidence", "comparison", "history"] as const;

export default function QaPage() {
  const { data, loading, error, reload, busy, stale, act } = useOrder();
  const { session } = useSession();
  const { next } = useQueueFlow();
  const revealed =
    data?.workOrder.status === "COMPARE" || data?.workOrder.status === "CLOSED";
  const [view, setView] = useDetailView(
    revealed ? "comparison" : "evidence",
    revealed ? revealedViews : blindViews,
  );
  const [conclusions, setConclusions] = useState<Record<string, string>>({});
  const [mismatchReason, setMismatchReason] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [evidenceTab, setEvidenceTab] = useState("");
  const stickyColumns = useTableStickyColumns<ComparisonRow>({
    startKeys: ["title"],
  });
  const comparisonRows: TablePlugin<ComparisonRow> = {
    transformBodyRow: (props, item) =>
      item.consistent
        ? props
        : {
            ...props,
            htmlProps: {
              ...props.htmlProps,
              className: `${props.htmlProps.className || ""} dv-mismatch`,
            },
          },
  };
  const [preview, setPreview] = useState<"blind" | "complete" | null>(null);
  useEffect(() => {
    setConclusions({});
    setMismatchReason("");
    setActions([]);
    setPreview(null);
    setEvidenceTab("");
  }, [data?.workOrder.id, session.userId, session.role]);
  const permitted =
    session.role === "COMPLIANCE_SENIOR" || session.role === "COMPLIANCE_HEAD";
  if (!permitted)
    return (
      <div className="page dv-page">
        <Empty
          title="无权访问抽检工单"
          description="仅资深合规和合规负责人可以抽检。"
        />
      </div>
    );
  if (!data)
    return (
      <LoadState loading={loading} error={error} retry={reload}>
        <Empty title="未找到抽检工单" />
      </LoadState>
    );
  const { workOrder: order, qa } = data;
  const evidence = data.evidence || [];
  const checkItems = order.checkItems || [];
  const applicationReview = qa?.reviewMode === "APPLICATION";
  const checks = applicationReview
    ? [{ id: "overall", title: "整单判断", options: overallOptions }]
    : checkItems.map((item) => ({
        id: item.id,
        title: item.title,
        options: CHECK_OPTIONS[item.checkType] || [],
      }));
  const label = (id: string, value?: string) =>
    checks
      .find((item) => item.id === id)
      ?.options.find((option) => option.value === value)?.label || "—";
  const conflict =
    order.submittedBy?.id === session.userId ||
    data.application.submittedBy?.id === session.userId ||
    checkItems.some((item) => item.decidedBy?.id === session.userId);
  const blocked =
    order.type !== "QA"
      ? "此工单不是抽检工单"
      : conflict
        ? "不能抽检自己提交或处理的申请"
        : stale
          ? "工单已更新，请刷新后操作"
          : order.status === "CLOSED"
            ? "抽检已结案"
            : order.assignee?.id !== session.userId
              ? order.assignee
                ? `请由${order.assignee.name}处理`
                : "请先领取抽检工单"
              : "";
  const canClaim =
    order.type === "QA" && order.status === "QUEUED" && !order.assignee;
  const comparisons: ComparisonRow[] = revealed
    ? checks.map((item) => ({
        id: item.id,
        title: item.title,
        independent: label(item.id, qa?.blindConclusions?.[item.id]),
        original: label(item.id, qa?.originalConclusions?.[item.id]),
        consistent:
          qa?.blindConclusions?.[item.id] ===
          qa?.originalConclusions?.[item.id],
      }))
    : [];
  const mismatched = revealed && comparisons.some((item) => !item.consistent);
  const validBlind =
    !blocked &&
    order.status === "BLIND" &&
    checks.length > 0 &&
    checks.every((item) =>
      item.options.some((option) => option.value === conclusions[item.id]),
    );
  const validComplete =
    !blocked &&
    order.status === "COMPARE" &&
    Boolean(qa?.blindConclusions && qa.originalConclusions) &&
    (!mismatched || Boolean(mismatchReason && actions.length));
  const submit = async () => {
    if (
      (preview === "blind" && !validBlind) ||
      (preview === "complete" && !validComplete)
    )
      return;
    const result =
      preview === "blind"
        ? await act("qa", { blindConclusions: conclusions })
        : await act("qa", {
            complete: true,
            ...(mismatched
              ? { mismatchReason, correctiveActions: actions }
              : { correctiveActions: [] }),
          });
    if (result) setPreview(null);
    if (result?.workOrder.status === "CLOSED") await next(order.id);
  };
  const independentItems: CheckItem[] = checkItems.map((item) => ({
    id: item.id,
    title: item.title,
    checkType: item.checkType,
    reasonCodes: [],
    evidenceIds: item.evidenceIds,
    status: "PENDING",
    hasNewEvidence: false,
  }));
  for (const entry of evidence)
    if (!checkItems.some((item) => item.evidenceIds.includes(entry.id)))
      independentItems.push({
        id: entry.id,
        title: CHECK_LABELS[entry.kind],
        checkType: entry.kind,
        reasonCodes: [],
        evidenceIds: [entry.id],
        status: "PENDING",
        hasNewEvidence: false,
      });
  const activeEvidence = independentItems.some(
    (item) => item.id === evidenceTab,
  )
    ? evidenceTab
    : independentItems[0]?.id || "";
  const activeCheck = applicationReview
    ? checks[0]
    : checks.find((item) => item.id === activeEvidence);
  const completedCount = checks.filter((item) => conclusions[item.id]).length;
  const nextPending = applicationReview
    ? undefined
    : checks.find(
        (item) => item.id !== activeEvidence && !conclusions[item.id],
      );
  const dangerSelected = Boolean(
    activeCheck &&
    (conclusions[activeCheck.id] === "DECLINED" ||
      DECLINE_CONCLUSIONS[conclusions[activeCheck.id]]),
  );
  const columns: TableColumn<ComparisonRow>[] = [
    { key: "title", header: "判断对象", width: proportional(2) },
    { key: "independent", header: "独立结论", width: proportional(1) },
    { key: "original", header: "原结论", width: proportional(1) },
    {
      key: "consistent",
      header: "比对结果",
      width: pixel(110),
      renderCell: (item) => (
        <Badge tone={item.consistent ? "success" : "danger"}>
          {item.consistent ? "一致" : "不一致"}
        </Badge>
      ),
    },
  ];
  const primaryLabel = canClaim
    ? "领取抽检"
    : order.status === "BLIND"
      ? "提交独立结论"
      : "完成抽检";
  const primaryBlocked = canClaim
    ? conflict
      ? "不能抽检自己提交或处理的申请"
      : stale
        ? "工单已更新，请刷新"
        : ""
    : blocked ||
      (order.status === "BLIND" && !validBlind
        ? "请完成全部独立结论"
        : order.status === "COMPARE" && !validComplete
          ? "请选择不一致原因和纠正动作"
          : !["BLIND", "COMPARE"].includes(order.status)
            ? "当前状态不可操作"
            : "");
  return (
    <div
      className={`page detail-page dv-page dv-qa-page qa-detail-workspace${revealed ? " is-revealed" : ""}`}
    >
      <OrderHeader data={data} />
      {error && (
        <div className="dv-notice dv-error" role="alert">
          {error.message}
        </div>
      )}
      {stale && (
        <div className="dv-notice dv-warning" role="alert">
          <span>工单已更新，点击刷新</span>
          <Button label="刷新" onClick={reload} />
        </div>
      )}
      <div className="qa-workspace-navigation">
        <div className="qa-stage-context">
          <strong>
            {order.status === "CLOSED"
              ? "抽检已完成"
              : revealed
                ? "比对与纠正"
                : "独立判断"}
          </strong>
          <span className="secondary">
            {applicationReview ? "整单抽检" : "逐项抽检"} ·{" "}
            {revealed
              ? "独立结论已锁定"
              : `已判断 ${completedCount}/${checks.length}`}
          </span>
        </div>
        <DetailTabs
          id="qa-workspace"
          value={view}
          onChange={setView}
          label="抽检工作区"
          compact
          items={[
            { value: "evidence", label: revealed ? "证据快照" : "证据与判断" },
            ...(revealed
              ? [
                  {
                    value: "comparison",
                    label: "结论比对",
                    count: comparisons.filter((item) => !item.consistent)
                      .length,
                  },
                  { value: "history", label: "操作记录" },
                ]
              : []),
          ]}
        />
      </div>
      <DetailSection
        id="qa-workspace"
        value="evidence"
        active={view}
        className="dv-qa-workspace qa-evidence-view"
      >
        <Panel
          title={
            applicationReview
              ? "整单证据 · 结合全部材料判断"
              : "证据快照 · 按检查项判断"
          }
          className="dv-qa-evidence"
        >
          {independentItems.length ? (
            <div className="dv-stack dv-qa-evidence-content">
              <DetailTabs
                id="qa-evidence"
                value={activeEvidence}
                onChange={setEvidenceTab}
                label="抽检证据"
                compact
                items={independentItems.map((item) => ({
                  value: item.id,
                  label: `${item.title}${!revealed && conclusions[item.id] ? " · 已判断" : ""}`,
                }))}
              />
              {independentItems.map((item) => (
                <DetailSection
                  key={item.id}
                  className="dv-qa-evidence-panel"
                  id="qa-evidence"
                  value={item.id}
                  active={activeEvidence}
                >
                  {activeEvidence === item.id && (
                    <EvidencePanel
                      evidence={evidence.filter((entry) =>
                        item.evidenceIds.includes(entry.id),
                      )}
                      item={item}
                      draft={emptyEvidenceDraft()}
                      onDraft={ignoreDraft}
                      readOnly
                      onMedia={async (evidenceId, mediaId) => {
                        await act("media", { evidenceId, mediaId });
                      }}
                    />
                  )}
                </DetailSection>
              ))}
            </div>
          ) : (
            <Empty title="暂无关联证据" description="此样本未关联证据材料。" />
          )}
        </Panel>
        {!revealed && (
          <section
            className={`rv-conclusion dv-qa-conclusion${dangerSelected ? " dv-danger-selected" : ""}`}
            aria-label="独立判断"
          >
            <div className="rv-conclusion-content">
              <div className="dv-qa-judgment">
                <strong>{activeCheck?.title || "独立判断"}</strong>
                <div
                  className="dv-qa-options"
                  role="group"
                  aria-label="独立结论"
                >
                  {activeCheck?.options.map((option) => (
                    <Button
                      key={option.value}
                      label={option.label}
                      variant="secondary"
                      className={`dv-disposition${conclusions[activeCheck.id] === option.value ? " is-selected" : ""}${option.value === "DECLINED" || DECLINE_CONCLUSIONS[option.value] ? " dv-danger-action" : ""}`}
                      aria-pressed={
                        conclusions[activeCheck.id] === option.value
                      }
                      isDisabled={
                        Boolean(blocked) || busy || order.status !== "BLIND"
                      }
                      tooltip={blocked || undefined}
                      onClick={() =>
                        setConclusions((current) => ({
                          ...current,
                          [activeCheck.id]: option.value,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
              <span className="dv-qa-progress" aria-live="polite">
                {dangerSelected ? "已选择拒绝类结论 · " : ""}已判断{" "}
                {completedCount}/{checks.length}
              </span>
              {nextPending && (
                <Button
                  label="下一待判断项"
                  variant="ghost"
                  onClick={() => setEvidenceTab(nextPending.id)}
                />
              )}
              <Button
                label={primaryLabel}
                variant="primary"
                isDisabled={Boolean(primaryBlocked) || busy}
                tooltip={primaryBlocked || undefined}
                onClick={() => (canClaim ? act("claim") : setPreview("blind"))}
              />
            </div>
            <p className="dv-qa-blind-note">
              {blocked || "提交前隐藏原结论与抽样来源，提交后独立结论锁定"}
            </p>
          </section>
        )}
      </DetailSection>
      {revealed && (
        <DetailSection
          id="qa-workspace"
          value="comparison"
          active={view}
          className="qa-secondary-view"
        >
          <Panel title="独立结论比对" className="dense-table">
            <Table
              aria-label="独立结论比对"
              idKey="id"
              density="compact"
              columns={columns}
              data={comparisons}
              plugins={{ stickyColumns, comparisonRows }}
            />
          </Panel>
          {order.status === "COMPARE" && mismatched && (
            <Panel title="不一致处置">
              <div className="dv-two-columns">
                <Selector
                  label="不一致原因"
                  isRequired
                  value={mismatchReason || undefined}
                  onChange={setMismatchReason}
                  options={mismatchOptions}
                  placeholder="选择差异原因"
                  isDisabled={Boolean(blocked)}
                  disabledMessage={blocked || undefined}
                />
                <fieldset className="dv-checkboxes">
                  <legend>
                    纠正动作 <span className="secondary">（必选）</span>
                  </legend>
                  {correctiveOptions.map((option) => (
                    <CheckboxInput
                      key={option.value}
                      label={option.label}
                      value={actions.includes(option.value)}
                      isDisabled={Boolean(blocked)}
                      disabledMessage={blocked || undefined}
                      onChange={(checked) =>
                        setActions((current) =>
                          checked
                            ? [...current, option.value]
                            : current.filter((value) => value !== option.value),
                        )
                      }
                    />
                  ))}
                </fieldset>
              </div>
              {actions.includes("RESTORE_APPLICATION") && (
                <p className="secondary">
                  生成运营联系任务，由运营联系商户；抽检人不直接联系商户。
                </p>
              )}
            </Panel>
          )}
          {order.status === "CLOSED" && (
            <Panel title="抽检结果">
              <dl className="details-grid">
                <div>
                  <dt>比对结果</dt>
                  <dd>
                    <Badge tone={qa?.consistent ? "success" : "warning"}>
                      {qa?.consistent ? "一致" : "不一致"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>{dateTime(order.closedAt)}</dd>
                </div>
                {qa?.mismatchReason && (
                  <div className="dv-full">
                    <dt>不一致原因</dt>
                    <dd>{qa.mismatchReason}</dd>
                  </div>
                )}
                {!!qa?.correctiveActions?.length && (
                  <div className="dv-full">
                    <dt>纠正动作</dt>
                    <dd>
                      {qa.correctiveActions
                        .map(
                          (value) =>
                            correctiveOptions.find(
                              (option) => option.value === value,
                            )?.label || "—",
                        )
                        .join("、")}
                    </dd>
                  </div>
                )}
                {!!qa?.generatedIds?.length && (
                  <div className="dv-full">
                    <dt>生成对象</dt>
                    <dd className="row">
                      {qa.generatedIds.map((id) => (
                        <IdText key={id} value={id} />
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}
        </DetailSection>
      )}
      {revealed && (
        <DetailSection
          id="qa-workspace"
          value="history"
          active={view}
          className="qa-secondary-view"
        >
          <Panel title="操作记录">
            {data.audit?.length ? (
              <Timeline audit={data.audit} />
            ) : (
              <Empty title="暂无操作记录" />
            )}
          </Panel>
        </DetailSection>
      )}
      {order.status === "COMPARE" && (
        <div className="rv-conclusion dv-qa-conclusion qa-comparison-actions">
          <div className="rv-conclusion-content">
            <span>
              {mismatched
                ? "存在差异，请选择不一致原因与纠正动作"
                : "独立结论与原结论一致"}
            </span>
            {view !== "comparison" && (
              <Button
                label="查看结论比对"
                variant="secondary"
                onClick={() => setView("comparison")}
              />
            )}
            <Button
              label="完成抽检"
              variant="primary"
              isDisabled={Boolean(primaryBlocked) || busy}
              tooltip={primaryBlocked || undefined}
              onClick={() => setPreview("complete")}
            />
          </div>
        </div>
      )}
      <Confirm
        open={Boolean(preview)}
        title={`${preview === "blind" ? "提交独立结论" : "完成抽检"} · 后果预览`}
        description={
          preview === "blind"
            ? "保存并锁定各项独立结论，抽检工单变为比对中，展示原结论及差异。"
            : mismatched
              ? `抽检工单结案；生成以下纠正对象：${actions.map((value) => correctiveOptions.find((option) => option.value === value)?.label).join("、")}。原申请不直接批准。`
              : "抽检结果一致，工单结案，不生成纠正对象，原申请状态保持不变。"
        }
        merchant={
          preview === "complete" && actions.includes("RESTORE_APPLICATION")
            ? "申请恢复为审核中，运营后续联系商户"
            : "保持当前对外状态，不发送消息"
        }
        sales={
          preview === "complete" && actions.includes("RESTORE_APPLICATION")
            ? "审核中"
            : "保持当前对外状态"
        }
        reversible={
          preview === "blind"
            ? "独立结论提交后不可修改，原决策展示后不能重做盲审。"
            : "抽检结果与纠正对象不可直接撤销，后续在对应流程处理。"
        }
        confirmLabel={preview === "blind" ? "确认提交独立结论" : "确认完成抽检"}
        onConfirm={submit}
        onClose={() => setPreview(null)}
        busy={busy}
        confirmDisabled={preview === "blind" ? !validBlind : !validComplete}
      >
        {preview === "blind" && (
          <dl className="details-grid">
            {checks.map((item) => (
              <div key={item.id}>
                <dt>{item.title}</dt>
                <dd>{label(item.id, conclusions[item.id])}</dd>
              </div>
            ))}
          </dl>
        )}
      </Confirm>
    </div>
  );
}
