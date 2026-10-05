import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Selector } from "@astryxdesign/core/Selector";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import {
  Table,
  proportional,
  pixel,
  useTableStickyColumns,
  type TableColumn,
  type TablePlugin,
} from "@astryxdesign/core/Table";
import { useOrder, useQueueFlow, useSession } from "../hooks";
import {
  Confirm,
  InlineConfirm,
  Badge,
  Panel,
  Empty,
  IdText,
  LoadState,
  OrderHeader,
  Timeline,
} from "../ui";
import { CHECK_LABELS, CHECK_OPTIONS } from "../catalog";
import { dateTime } from "../format";
import EvidencePanel, { emptyEvidenceDraft } from "../components/EvidencePanel";
import type { CheckItem } from "../types";
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

export default function QaPage() {
  const { data, loading, error, reload, busy, stale, act } = useOrder();
  const { session } = useSession();
  const { next } = useQueueFlow();
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
  const revealed = order.status === "COMPARE" || order.status === "CLOSED";
  const checks = checkItems.length
    ? checkItems.map((item) => ({
        id: item.id,
        title: item.title,
        options: CHECK_OPTIONS[item.checkType] || [],
      }))
    : [{ id: "overall", title: "整单独立判断", options: overallOptions }];
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
  const independentItems: CheckItem[] = checkItems.length
    ? checkItems.map((item) => ({
        id: item.id,
        title: item.title,
        checkType: item.checkType,
        reasonCodes: item.reasonCodes,
        evidenceIds: item.evidenceIds,
        status: "PENDING",
        hasNewEvidence: false,
      }))
    : evidence.map((entry) => ({
        id: entry.id,
        title: CHECK_LABELS[entry.kind],
        checkType: entry.kind,
        reasonCodes: [],
        evidenceIds: [entry.id],
        status: "PENDING",
        hasNewEvidence: false,
      }));
  const activeEvidence = independentItems.some(
    (item) => item.id === evidenceTab,
  )
    ? evidenceTab
    : independentItems[0]?.id || "";
  const columns: TableColumn<ComparisonRow>[] = [
    { key: "title", header: "检查项", width: proportional(2) },
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
    <div className="page dv-page">
      <OrderHeader
        data={data}
        actions={
          canClaim ? (
            <InlineConfirm
              title="领取抽检并开始独立判断？"
              confirmLabel="领取并继续"
              disabled={Boolean(primaryBlocked) || busy}
              onConfirm={() => act("claim")}
            >
              <Button
                label={primaryLabel}
                variant="primary"
                isDisabled={Boolean(primaryBlocked) || busy}
                tooltip={primaryBlocked || undefined}
              />
            </InlineConfirm>
          ) : order.status !== "CLOSED" ? (
            <Button
              label={primaryLabel}
              variant="primary"
              isDisabled={Boolean(primaryBlocked) || busy}
              tooltip={primaryBlocked || undefined}
              onClick={() =>
                setPreview(order.status === "BLIND" ? "blind" : "complete")
              }
            />
          ) : undefined
        }
      />
      {error && (
        <div className="dv-notice dv-error" role="alert">
          {error}
        </div>
      )}
      {stale && (
        <div className="dv-notice dv-warning" role="alert">
          <span>工单已更新，点击刷新</span>
          <Button label="刷新" onClick={reload} />
        </div>
      )}
      <div className="dv-stage-row" aria-label="抽检阶段">
        <Badge tone={revealed ? "neutral" : "info"}>
          01 独立判断{revealed ? " · 已锁定" : ""}
        </Badge>
        <Badge tone={revealed ? "info" : "neutral"}>
          02 结论比对{order.status === "CLOSED" ? " · 已完成" : ""}
        </Badge>
      </div>
      {revealed ? (
        <>
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
        </>
      ) : (
        <Panel
          title="独立结论"
          subtitle="提交前不展示原决策或抽样来源；独立结论提交后锁定。"
        >
          <div className="dv-qa-choices">
            {checks.map((item) => (
              <RadioList
                key={item.id}
                label={item.title}
                isRequired
                value={conclusions[item.id] || ""}
                onChange={(value) =>
                  setConclusions((current) => ({
                    ...current,
                    [item.id]: value,
                  }))
                }
                isDisabled={Boolean(blocked) || order.status !== "BLIND"}
                disabledMessage={blocked || undefined}
              >
                {item.options.map((option) => (
                  <RadioListItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                  />
                ))}
              </RadioList>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="证据">
        {independentItems.length ? (
          <div className="dv-stack">
            <TabList
              value={activeEvidence}
              onChange={setEvidenceTab}
              role="tablist"
              aria-label="抽检证据"
              hasDivider
            >
              {independentItems.map((item) => (
                <Tab
                  key={item.id}
                  value={item.id}
                  label={item.title}
                  panelId={`qa-evidence-${item.id}`}
                />
              ))}
            </TabList>
            {independentItems.map((item) => (
              <section
                key={item.id}
                id={`qa-evidence-${item.id}`}
                role="tabpanel"
                aria-label={item.title}
                hidden={activeEvidence !== item.id}
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
              </section>
            ))}
          </div>
        ) : (
          <Empty title="暂无关联证据" description="此样本未关联证据材料。" />
        )}
      </Panel>
      {revealed && data.audit && (
        <Panel title="操作日志">
          <Timeline audit={data.audit} />
        </Panel>
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
