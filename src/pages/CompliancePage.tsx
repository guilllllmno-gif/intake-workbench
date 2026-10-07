import { useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { LockKeyhole } from "lucide-react";
import { useDetailView, useOrder, useQueueFlow, useSession } from "../hooks";
import {
  Badge,
  Panel,
  Confirm,
  Empty,
  IdText,
  LoadState,
  OrderHeader,
  OrderSummary,
  DetailTabs,
  DetailSection,
  PersonName,
  Timeline,
} from "../ui";
import {
  CHECK_LABELS,
  CHECK_OPTIONS,
  DECLINE_CONCLUSIONS,
  reasonName,
} from "../catalog";
import { dateTime } from "../format";
import EvidencePanel, { emptyEvidenceDraft } from "../components/EvidencePanel";
import type { CheckItem } from "../types";
import "./decision-pages.css";

const decisionLabels: Record<string, string> = {
  EXCLUDE: "排除命中",
  DECLINE: "确认拒绝",
  CASE: "升级为案件",
  DISAGREE: "退回重新研判",
};
const exclusionOptions = [
  "名称不同",
  "注册地不同",
  "成立时间不同",
  "标识号不同",
  "非同一主体",
  "证据不足以支持命中",
].map((value) => ({ value, label: value }));
const ignoreDraft = () => {};

export default function CompliancePage() {
  const { data, loading, error, reload, busy, stale, act, mutationError } =
    useOrder();
  const { session } = useSession();
  const { next, busy: nextBusy } = useQueueFlow();
  const [decision, setDecision] = useState("");
  const [preview, setPreview] = useState(false);
  const [reason, setReason] = useState("");
  const [excludeReason, setExcludeReason] = useState("");
  const [tab, setTab] = useDetailView(
    "summary",
    data?.audit
      ? ["summary", "evidence", "decisions", "audit"]
      : ["summary", "evidence", "decisions"],
  );
  useEffect(() => {
    setDecision("");
    setPreview(false);
    setReason("");
    setExcludeReason("");
  }, [data?.workOrder.id, session.userId, session.role]);
  if (session.role !== "COMPLIANCE_HEAD")
    return (
      <div className="page dv-page">
        <Empty
          title="受限内容已锁定"
          description="仅合规负责人可访问受限工单。"
        />
      </div>
    );
  if (!data)
    return (
      <LoadState loading={loading} error={error} retry={reload}>
        <Empty title="未找到受限工单" />
      </LoadState>
    );
  const { workOrder: order } = data;
  const checks = order.checkItems || [];
  const evidence = data.evidence || [];
  const actors = order.restrictedActorIds || [];
  const waitingSecond = order.status === "PENDING_SECOND";
  const first = data.restrictedDecisions?.find((entry) =>
    entry.reviewers.some((user) => user.id === actors[0]),
  );
  const conflict =
    order.submittedBy?.id === session.userId ||
    data.application.submittedBy?.id === session.userId ||
    checks.some((item) => item.decidedBy?.id === session.userId);
  const blocked =
    order.type !== "RESTRICTED"
      ? "此工单不是受限工单"
      : conflict
        ? "不能处理自己提交或作出原结论的申请"
        : !["IN_PROGRESS", "PENDING_SECOND"].includes(order.status)
          ? order.status === "QUEUED"
            ? "请先领取工单"
            : "当前受限工单已结案"
          : (order.assignee && order.assignee.id !== session.userId) ||
              (!waitingSecond && !order.assignee)
            ? `请由${order.assignee?.name || "已指派的负责人"}处理`
            : actors.includes(session.userId)
              ? "您已提交，请由另一位合规负责人确认"
              : stale
                ? "工单已更新，请刷新后操作"
                : "";
  const canClaim =
    order.type === "RESTRICTED" && order.status === "QUEUED" && !order.assignee;
  const valid =
    !blocked &&
    Boolean(decision) &&
    (!waitingSecond ||
      decision === "DISAGREE" ||
      decision === order.pendingDecision) &&
    Boolean(reason.trim()) &&
    (decision !== "EXCLUDE" || Boolean(excludeReason));
  const choose = (value: string) => {
    setDecision(value);
    setReason("");
    setExcludeReason("");
  };
  const submit = async () => {
    if (!valid) return;
    const result = await act("restricted-decision", {
      decision,
      reason:
        decision === "EXCLUDE"
          ? `${excludeReason}：${reason.trim()}`
          : reason.trim(),
    });
    if (result) {
      setDecision("");
      setPreview(false);
    }
  };
  const panels: CheckItem[] = [...checks];
  for (const entry of evidence)
    if (!checks.some((item) => item.evidenceIds.includes(entry.id)))
      panels.push({
        id: entry.id,
        checkType: entry.kind,
        title: CHECK_LABELS[entry.kind],
        reasonCodes: [],
        evidenceIds: [entry.id],
        status: "PENDING",
        hasNewEvidence: false,
      });
  const description =
    decision === "DISAGREE"
      ? "驳回第一位处置意见，受限工单回到处理中，由第一位合规负责人重新研判；申请保持冻结。"
      : !waitingSecond
        ? "保存第一位处置意见，工单变为待第二人确认；另一位合规负责人确认前，申请保持冻结。"
        : decision === "EXCLUDE"
          ? "受限工单结案为排除，原审核工单从合规冻结回到处理中；原审核员仅看到“受限已排除”。"
          : decision === "DECLINE"
            ? "受限工单与原审核工单结案为拒绝，申请变为未通过；商户收到通用拒绝通知。"
            : "受限工单结案为升级案件，生成案件编号；申请继续保持冻结。";
  const externalDecline = waitingSecond && decision === "DECLINE";
  const action = (value: string) => {
    const reasonBlocked =
      blocked ||
      (waitingSecond && value !== "DISAGREE" && value !== order.pendingDecision
        ? "第二位须确认第一位决定，或退回重新研判"
        : "");
    return (
      <Button
        key={value}
        label={decisionLabels[value]}
        variant="secondary"
        className={`dv-disposition${decision === value ? " is-selected" : ""}${value === "DECLINE" ? " dv-danger-action" : ""}`}
        aria-pressed={decision === value}
        isDisabled={Boolean(reasonBlocked) || busy}
        tooltip={reasonBlocked || undefined}
        onClick={() => choose(value)}
      />
    );
  };
  return (
    <div className="page dv-page detail-page dv-decision-page">
      <OrderHeader
        data={data}
        actions={
          order.status === "CLOSED" ? (
            <Button
              label="领取下一单"
              isLoading={nextBusy}
              onClick={() => void next(order.id)}
            />
          ) : undefined
        }
      />
      <div className="dv-notice">
        <LockKeyhole size={16} aria-hidden="true" />
        <span>受限内容 · 仅合规负责人可见，不向商户或销售披露处置原因。</span>
      </div>
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
      <DetailTabs
        id="restricted-detail"
        value={tab}
        onChange={setTab}
        label="受限工单详情"
        items={[
          { value: "summary", label: "转入原因与摘要" },
          { value: "evidence", label: "筛查证据", count: evidence.length },
          {
            value: "decisions",
            label: "处置记录",
            count: data.restrictedDecisions?.length || 0,
          },
          ...(data.audit ? [{ value: "audit", label: "操作日志" }] : []),
        ]}
      />
      <div className="detail-layout">
        <div className="detail-main">
          <DetailSection id="restricted-detail" value="summary" active={tab}>
            <Panel title="转受限原因与审核备注">
              <dl className="details-grid">
                <div className="dv-full">
                  <dt>转受限原因</dt>
                  <dd>
                    {order.restrictedReason ||
                      (order.reasonCodes || []).map(reasonName).join("、") ||
                      "—"}
                  </dd>
                </div>
                <div>
                  <dt>转入时间</dt>
                  <dd>{dateTime(order.frozenAt || order.createdAt)}</dd>
                </div>
                <div>
                  <dt>原审核员</dt>
                  <dd>
                    <PersonName user={order.originalAssignee} />
                  </dd>
                </div>
                <div className="dv-full">
                  <dt>合规备注</dt>
                  <dd>{order.complianceNote || "—"}</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="原检查项结论摘要">
              <div className="dv-two-columns">
                {checks.map((item) => (
                  <div key={item.id} className="dv-reason">
                    <div className="row">
                      <strong>{item.title}</strong>
                      <Badge
                        tone={
                          DECLINE_CONCLUSIONS[item.conclusion || ""]
                            ? "danger"
                            : "neutral"
                        }
                      >
                        {CHECK_OPTIONS[item.checkType]?.find(
                          (option) => option.value === item.conclusion,
                        )?.label || "—"}
                      </Badge>
                      <PersonName user={item.decidedBy} />
                    </div>
                    <dl className="details-grid">
                      <div>
                        <dt>结论依据</dt>
                        <dd>{item.conclusionReason || "—"}</dd>
                      </div>
                      <div>
                        <dt>检查项备注</dt>
                        <dd>{item.note || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </Panel>
          </DetailSection>
          <DetailSection id="restricted-detail" value="evidence" active={tab}>
            {panels.length ? (
              <div className="dv-stack">
                {panels.map((item) => (
                  <Panel title={item.title} key={item.id}>
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
                  </Panel>
                ))}
              </div>
            ) : (
              <Empty title="暂无筛查证据" description="此工单尚未关联证据。" />
            )}
          </DetailSection>
          <DetailSection id="restricted-detail" value="decisions" active={tab}>
            {data.restrictedDecisions?.length ? (
              <Panel>
                <div className="dv-stack">
                  {data.restrictedDecisions.map((entry) => (
                    <div className="dv-record" key={entry.id}>
                      <div className="row">
                        <Badge
                          tone={
                            entry.decision === "DECLINE" ? "danger" : "neutral"
                          }
                        >
                          {decisionLabels[entry.decision] || "处置意见"}
                        </Badge>
                        {entry.reviewers.map((user) => (
                          <PersonName key={user.id} user={user} />
                        ))}
                        <span className="secondary">{dateTime(entry.at)}</span>
                      </div>
                      <p>{entry.reason}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : (
              <Empty
                title="暂无处置记录"
                description="提交处置意见后显示记录。"
              />
            )}
          </DetailSection>
          {data.audit && (
            <DetailSection id="restricted-detail" value="audit" active={tab}>
              <Panel title="操作日志">
                <Timeline audit={data.audit} />
              </Panel>
            </DetailSection>
          )}
        </div>
        <aside className="detail-aside dv-decision-aside">
          <OrderSummary
            data={data}
            title="当前处置"
            actions={
              canClaim ? (
                <Button
                  label="领取受限工单"
                  variant="primary"
                  isDisabled={busy || stale || conflict}
                  tooltip={
                    conflict
                      ? "不能处理自己提交或作出原结论的申请"
                      : stale
                        ? "工单已更新，请刷新"
                        : undefined
                  }
                  onClick={() => act("claim")}
                />
              ) : undefined
            }
          >
            <div className="dv-stack">
              {waitingSecond && (
                <div className="dv-notice dv-warning">
                  <strong>复核进度 1/2</strong>
                  {first && (
                    <PersonName
                      user={first.reviewers.find(
                        (user) => user.id === actors[0],
                      )}
                    />
                  )}
                  <Badge
                    tone={
                      order.pendingDecision === "DECLINE" ? "danger" : "neutral"
                    }
                  >
                    {decisionLabels[order.pendingDecision || ""] || "—"}
                  </Badge>
                </div>
              )}
              {order.caseId && (
                <div className="dv-notice">
                  <span>案件编号</span>
                  <IdText value={order.caseId} />
                  <span>申请保持冻结</span>
                </div>
              )}
              <p className="secondary dv-context-copy">
                {order.status === "CLOSED"
                  ? "处置已完成，可查看处置记录与操作日志。"
                  : blocked ||
                    (waitingSecond
                      ? "请确认第一位处置意见，或退回重新研判。"
                      : "核对转入原因与筛查证据后提交意见，申请在双人确认前保持冻结。")}
              </p>
              <Button
                label="查看筛查证据"
                variant="ghost"
                className="detail-shortcut"
                onClick={() => setTab("evidence")}
              />
            </div>
            {order.status !== "CLOSED" && (
              <section className="dv-treatment" aria-label="受限处置">
                <div className="dv-stack">
                  <div
                    className="dv-dispositions"
                    role="group"
                    aria-label="选择处置结果"
                  >
                    {action("EXCLUDE")}
                    {action("DECLINE")}
                    {action("CASE")}
                    {waitingSecond && action("DISAGREE")}
                  </div>
                  <p
                    className={
                      decision === "DECLINE"
                        ? "dv-danger-selection"
                        : "secondary"
                    }
                    aria-live="polite"
                  >
                    {decision === "DECLINE"
                      ? "已选择确认拒绝 · 双人确认后将结案为拒绝，申请变为未通过。"
                      : decision
                        ? `已选择：${decisionLabels[decision]}`
                        : "请选择处置结果并填写依据，选择不会提交"}
                  </p>
                  <div className="dv-form-grid">
                    {decision === "EXCLUDE" && (
                      <Selector
                        label="排除原因"
                        isRequired
                        options={exclusionOptions}
                        value={excludeReason || undefined}
                        onChange={setExcludeReason}
                        placeholder="选择排除依据"
                        isDisabled={Boolean(blocked) || busy}
                      />
                    )}
                    <TextArea
                      label="处置依据"
                      isRequired
                      value={reason}
                      onChange={setReason}
                      rows={2}
                      placeholder="填写证据与处置依据"
                      isDisabled={Boolean(blocked) || busy}
                    />
                  </div>
                  <Button
                    label="提交处置"
                    variant="primary"
                    isDisabled={!valid || busy}
                    onClick={() => setPreview(true)}
                  />
                </div>
              </section>
            )}
          </OrderSummary>
        </aside>
      </div>
      <Confirm
        open={preview}
        title={`${decisionLabels[decision] || "受限处置"} · 后果预览`}
        description={description}
        merchant={
          externalDecline
            ? "未通过：很抱歉，您的申请未通过审核。"
            : "审核中，不披露受限原因"
        }
        sales={externalDecline ? "未通过" : "审核中，不披露受限原因"}
        reversible={
          !waitingSecond
            ? "第二位负责人确认前可退回重新研判；已保存意见不可删除。"
            : "双人确认后不可直接撤销，后续须按受限案件流程处理。"
        }
        confirmLabel={`确认${decision === "DECLINE" ? "拒绝" : decisionLabels[decision] || "提交"}`}
        onConfirm={submit}
        onClose={() => setPreview(false)}
        busy={busy}
        error={mutationError}
        confirmDisabled={!valid}
        danger={decision === "DECLINE"}
      >
        <dl className="details-grid">
          <div>
            <dt>处置结果</dt>
            <dd>
              <Badge tone={decision === "DECLINE" ? "danger" : "neutral"}>
                {decisionLabels[decision]}
              </Badge>
            </dd>
          </div>
          {decision === "EXCLUDE" && (
            <div>
              <dt>排除原因</dt>
              <dd>{excludeReason}</dd>
            </div>
          )}
          <div className="dv-full">
            <dt>处置依据</dt>
            <dd>{reason}</dd>
          </div>
        </dl>
      </Confirm>
    </div>
  );
}
