import { useEffect, useRef, useState } from "react";
import { useHref } from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog } from "@astryxdesign/core/Dialog";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useDetailView, useOrder, useQueueFlow, useSession } from "../hooks";
import {
  Badge,
  Btn,
  Confirm,
  DetailSection,
  DetailTabs,
  DialogHeader,
  Empty,
  FileUpload,
  IdText,
  InlineConfirm,
  LoadState,
  OrderHeader,
  OrderSummary,
  Panel,
  Timeline,
} from "../ui";
import { countryName, dateTime, mccName, money } from "../format";
import { REASONS, reasonName } from "../catalog";
import type {
  ExternalText,
  ChannelSubmission,
  MutationAction,
  SupplementAction,
  UploadedFile,
} from "../types";
import { MaterialPreview, supplementActionLabels } from "./SupplementPage";
import "./ops-pages.css";

const receiptLabels = {
  REJECTED: "驳回",
  MORE_INFO: "要求补充材料",
  TIMEOUT: "超时",
};
const mappingCodes = [
  "CH-REJECT-DOCS",
  "CH-MORE-INFO",
  "CH-REJECT-POLICY",
  "CH-TIMEOUT",
];
type Document = ChannelSubmission["documents"][number];
type Need = {
  externalText: ExternalText;
  actionType: SupplementAction;
  field?: string;
  targetPersonId?: string;
};
type Action =
  | "channel-supplement"
  | "channel-resubmit"
  | "channel-switch"
  | "channel-escalate"
  | "channel-remind"
  | "channel-terminate";
const actionLabels: Record<Action, string> = {
  "channel-supplement": "发起商户补件",
  "channel-resubmit": "修正后重新提交",
  "channel-switch": "改投其他渠道",
  "channel-escalate": "转合规判断",
  "channel-remind": "催询上游",
  "channel-terminate": "终止该渠道",
};

export default function ChannelPage() {
  const { session } = useSession();
  const queueFlow = useQueueFlow();
  const supplementHref = useHref("/supplements/");
  const { data, loading, error, stale, busy, reload, act } = useOrder();
  const [tab, setTab] = useDetailView("receipt", [
    "receipt",
    "history",
    ...(data?.audit ? ["audit"] : []),
  ]);
  const [dialog, setDialog] = useState<Action | "">("");
  const [mappingCode, setMappingCode] = useState("CH-MORE-INFO");
  const [isRiskType, setRiskType] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [channelId, setChannelId] = useState("");
  const [reason, setReason] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [method, setMethod] = useState("邮件");
  const [preview, setPreview] = useState<Document | null>(null);
  const mappingRef = useRef<HTMLDivElement>(null);
  const w = data?.workOrder;
  const channel = data?.channel;
  const ops = session.role === "OPS_AGENT" || session.role === "OPS_LEAD";
  const lead = session.role === "OPS_LEAD";
  const owns = ops && w?.assignee?.id === session.userId;
  const claimable =
    ops &&
    !!w &&
    !w.assignee &&
    ["QUEUED", "IN_PROGRESS", "WAITING_CHANNEL"].includes(w.status);
  const blocked = (!owns && !claimable) || stale || busy;
  const active =
    w?.status === "IN_PROGRESS" || (claimable && w?.status === "QUEUED");
  const risk = !!channel?.isRiskType;
  const riskCleared = !!w?.outcome?.startsWith("APPROVED");
  const alternatives = (data?.otherChannels || []).filter(
    (item) =>
      item.status === "AVAILABLE" && item.channelId !== channel?.channelId,
  );
  const selectedChannel = alternatives.find(
    (item) => item.channelId === channelId,
  );
  const relatedSupplements = (data?.supplements || []).filter((order) =>
    order.items?.some(
      (item) => item.source === "CHANNEL" && item.sourceWorkOrderId === w?.id,
    ),
  );
  const completedSupplements = relatedSupplements.filter(
    (order) => order.status === "DONE",
  );
  const canResubmit =
    active &&
    (!risk || riskCleared) &&
    (riskCleared ||
      (channel?.receiptType === "MORE_INFO"
        ? completedSupplements.length > 0
        : channel?.mappedReasonCode === "CH-REJECT-DOCS"));
  const canSupplement =
    active &&
    (channel?.receiptType === "MORE_INFO" ||
      (!risk && channel?.mappedReasonCode === "CH-REJECT-DOCS"));
  const canSwitch =
    active &&
    !risk &&
    channel?.mappedReasonCode === "CH-REJECT-POLICY" &&
    alternatives.length > 0;
  const recommendation =
    channel?.receiptType === "MORE_INFO"
      ? "channel-supplement"
      : channel?.receiptType === "TIMEOUT" || w?.status === "WAITING_CHANNEL"
        ? "channel-remind"
        : !channel?.mappedReasonCode
          ? lead
            ? "mapping"
            : "mapping-request"
          : risk
            ? riskCleared
              ? "channel-resubmit"
              : "channel-escalate"
            : channel.mappedReasonCode === "CH-REJECT-DOCS"
              ? "channel-resubmit"
              : channel.mappedReasonCode === "CH-MORE-INFO"
                ? "channel-supplement"
                : "channel-switch";
  useEffect(() => {
    setDialog("");
    setPreview(null);
    setReleaseReason("");
  }, [w?.id, session.userId]);
  useEffect(() => {
    setMappingCode(
      channel?.receiptType === "REJECTED"
        ? "CH-REJECT-DOCS"
        : channel?.receiptType === "TIMEOUT"
          ? "CH-TIMEOUT"
          : "CH-MORE-INFO",
    );
    setRiskType(false);
  }, [w?.id, channel?.receiptType]);
  async function execute(
    action: MutationAction,
    payload: Record<string, unknown> = {},
  ) {
    const result = await act(action, payload);
    if (result) {
      setDialog("");
      if (result.workOrder.status === "CLOSED")
        await queueFlow.next(result.workOrder.id);
    }
    return result;
  }
  function open(action: Action) {
    setReason("");
    setMethod("邮件");
    setChannelId(alternatives[0]?.channelId || "");
    if (action === "channel-supplement") {
      const defaults =
        REASONS[channel?.mappedReasonCode || "CH-MORE-INFO"].externalText;
      setNeeds(
        channel?.requiredDocuments.length
          ? channel.requiredDocuments.map((required) => {
              const wording = Object.values(REASONS).find((entry) =>
                entry.externalText.zh.includes(required),
              )?.externalText;
              return {
                externalText: { zh: required, en: wording?.en || "" },
                actionType: "UPLOAD",
              };
            })
          : [{ externalText: { ...defaults }, actionType: "UPLOAD" }],
      );
    }
    if (action === "channel-resubmit") {
      const next = (channel?.documents || []).map((document) => ({
        ...document,
      }));
      for (const required of channel?.requiredDocuments || [])
        if (!next.some((document) => document.name === required))
          next.push({ name: required, value: "" });
      for (const order of completedSupplements)
        for (const item of order.items || []) {
          if (item.sourceWorkOrderId !== w?.id) continue;
          const provided = {
            name: item.externalText.zh,
            value:
              item.response ||
              item.files?.map((file) => file.name).join("、") ||
              "",
            file: item.files?.[0],
          };
          const index = next.findIndex(
            (document) => document.name === item.externalText.zh,
          );
          if (index >= 0) next[index] = provided;
          else next.push(provided);
        }
      setDocuments(next.length ? next : [{ name: "渠道提交资料", value: "" }]);
    }
    setDialog(action);
  }
  async function confirmAction() {
    if (dialog === "channel-supplement")
      await execute(dialog, { items: needs });
    if (dialog === "channel-resubmit") await execute(dialog, { documents });
    if (dialog === "channel-switch") await execute(dialog, { channelId });
    if (dialog === "channel-escalate")
      await execute(dialog, { reason: reason.trim() || undefined });
    if (dialog === "channel-terminate")
      await execute(dialog, { reason: reason.trim() });
    if (dialog === "channel-remind") await execute(dialog, { method });
  }
  function actionReason(action: string): string {
    if (busy) return "正在保存，完成后可操作";
    if (stale) return "工单已更新，刷新后可操作";
    if (action === "mapping" && lead)
      return active ? "" : "补充映射：渠道工单恢复处理中后可用";
    if (blocked)
      return w?.assignee
        ? `由 ${w.assignee.name} 处理，转派给你后可操作`
        : "当前角色不可处理，切换到运营账号后可操作";
    if (action === "mapping-request")
      return w?.mappingRequestedAt
        ? "已提交组长映射任务，映射完成后可继续处理"
        : active
          ? ""
          : "申请组长映射：工单恢复处理中后可用";
    if (action === "channel-supplement")
      return canSupplement
        ? ""
        : "发起补件：收到补充材料回执或资料问题驳回，并恢复处理中后可用";
    if (action === "channel-resubmit")
      return canResubmit
        ? ""
        : "重新提交：补件完成或映射为可内部修正的资料问题后可用";
    if (action === "channel-switch")
      return canSwitch
        ? ""
        : risk
          ? "风险回执需先转合规；合规批准后才可继续渠道处理"
          : !alternatives.length
            ? "改投渠道：配置其他可用渠道后可用"
            : "改投渠道：完成原因映射并恢复处理中后可用";
    if (action === "channel-escalate")
      return active && risk ? "" : "转合规判断：风险类驳回且处于处理中时可用";
    if (action === "channel-remind")
      return w?.status === "WAITING_CHANNEL" ||
        (active && channel?.receiptType === "TIMEOUT")
        ? ""
        : "催询上游：等待渠道回执或收到超时回执后可用";
    if (action === "channel-terminate")
      return lead && active && !risk
        ? ""
        : "终止渠道：运营组长在非风险工单处理中可用";
    return "";
  }
  function beginRecommended() {
    if (recommendation === "mapping") {
      setTab("receipt");
      requestAnimationFrame(() =>
        mappingRef.current?.scrollIntoView({ block: "center" }),
      );
    } else if (recommendation === "mapping-request")
      void execute("mapping-request");
    else open(recommendation);
  }
  const changes = documents.map((document, index) => ({
    key: `${index}`,
    name: document.name,
    before: channel?.documents.find((item) => item.name === document.name),
    after: document,
  }));
  const changed = changes.some(
    (row) =>
      row.before?.value !== row.after.value ||
      row.before?.file?.id !== row.after.file?.id ||
      row.before?.name !== row.after.name,
  );
  const formInvalid =
    blocked ||
    (dialog === "channel-supplement" &&
      (!needs.length ||
        needs.some(
          (item) =>
            !item.externalText.zh.trim() ||
            !item.externalText.en.trim() ||
            (item.actionType === "REVERIFY" && !item.targetPersonId) ||
            (item.actionType === "CONFIRM_FIELD" && !item.field?.trim()),
        ))) ||
    (dialog === "channel-resubmit" &&
      (!changed ||
        documents.some(
          (document) => !document.name.trim() || !document.value.trim(),
        ))) ||
    (dialog === "channel-switch" && !selectedChannel) ||
    (dialog === "channel-terminate" && !reason.trim());
  const descriptions: Record<Action, string> = {
    "channel-supplement": `创建或合并 ${needs.length} 项补件需求，渠道工单进入补件中；由运营在补件工单发送通知。`,
    "channel-resubmit": "按下方差异重新提交资料，渠道工单变为等待渠道回执。",
    "channel-switch": `终止当前渠道提交，向 ${selectedChannel?.channelName || "所选渠道"} 创建新提交，进入等待渠道回执。`,
    "channel-escalate":
      "生成合规检查项，渠道工单变为等待合规；合规给出结论前停止渠道处理。",
    "channel-remind": "记录催询时间与方式，重新开始渠道超时计时。",
    "channel-terminate": alternatives.length
      ? "终止本次渠道提交；其他可用渠道保留。"
      : "终止本次渠道提交；无其他可用渠道，申请对外状态变为未通过，对外类别为综合评估。",
  };
  const headerActions =
    ops && w?.status !== "CLOSED" ? (
      <div className="row">
        {claimable ? (
          <Btn
            variant="primary"
            disabled={busy || stale}
            busy={busy}
            onClick={async () => {
              if (await execute("claim")) beginRecommended();
            }}
          >
            领取并处理
          </Btn>
        ) : (
          <Btn
            variant="primary"
            disabled={!!actionReason(recommendation)}
            title={actionReason(recommendation) || undefined}
            onClick={beginRecommended}
          >
            {recommendation === "mapping"
              ? "补充映射"
              : recommendation === "mapping-request"
                ? "申请组长映射"
                : actionLabels[recommendation]}
          </Btn>
        )}
        <DropdownMenu
          button={{ label: "更多", variant: "secondary" }}
          items={(Object.keys(actionLabels) as Action[])
            .filter(
              (action) =>
                action !== recommendation &&
                (action !== "channel-terminate" || lead) &&
                (!risk ||
                  channel?.receiptType === "MORE_INFO" ||
                  ![
                    "channel-switch",
                    "channel-terminate",
                    "channel-resubmit",
                    "channel-supplement",
                  ].includes(action)),
            )
            .map((action) => ({
              id: action,
              label: actionLabels[action],
              variant:
                action === "channel-terminate"
                  ? ("destructive" as const)
                  : ("default" as const),
              description: !owns
                ? "领取工单后可用；可先点击主操作领取并继续"
                : actionReason(action) || undefined,
              isDisabled: !owns || !!actionReason(action),
              onClick: () => open(action),
            }))}
        />
        <InlineConfirm
          title="释放工单后，工单回到待领取队列，SLA 继续计时。"
          content={
            <TextArea
              label="释放原因"
              isRequired
              value={releaseReason}
              onChange={setReleaseReason}
              description="填写释放原因后可确认，不向商户发送。"
            />
          }
          confirmDisabled={!releaseReason.trim()}
          disabled={!owns || busy || stale}
          busy={busy}
          onConfirm={() => execute("release", { reason: releaseReason.trim() })}
        >
          <Btn
            disabled={!owns || busy || stale}
            title={
              busy
                ? "保存完成后可释放"
                : stale
                  ? "刷新工单后可释放"
                  : !owns
                    ? "领取工单后可释放"
                    : undefined
            }
          >
            释放
          </Btn>
        </InlineConfirm>
      </div>
    ) : null;
  return (
    <div className="page ops-pages detail-page">
      <LoadState loading={loading} error={error} retry={reload}>
        {data && w && (
          <>
            <OrderHeader data={data} />
            {stale && (
              <Banner
                status="warning"
                title="工单已更新，点击刷新"
                endContent={<Btn onClick={reload}>刷新</Btn>}
              />
            )}
            {ops && !owns && w.status !== "CLOSED" && (
              <Banner
                status="info"
                title={
                  w.assignee
                    ? `当前由 ${w.assignee.name} 处理`
                    : "可以浏览回执；点击主操作领取并继续"
                }
              />
            )}
            {channel ? (
              <>
                <DetailTabs
                  id="channel"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: "receipt", label: "回执与处理" },
                    {
                      value: "history",
                      label: "提交与关联",
                      count: relatedSupplements.length || undefined,
                    },
                    ...(data.audit
                      ? [{ value: "audit", label: "操作日志" }]
                      : []),
                  ]}
                />
                <div className="detail-layout">
                  <div className="detail-main">
                    <DetailSection id="channel" value="receipt" active={tab}>
                      <Panel title="上游回执">
                        <dl className="details-grid">
                          <div>
                            <dt>上游原因码</dt>
                            <dd>
                              <IdText value={channel.upstreamCode} />
                            </dd>
                          </div>
                        </dl>
                        <pre className="channel-raw-receipt">
                          {channel.upstreamReasonRaw || "—"}
                        </pre>
                        <h2 className="section-title">要求的材料</h2>
                        {channel.requiredDocuments.length ? (
                          <ul className="ops-record-list">
                            {channel.requiredDocuments.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="secondary">上游未指定材料清单</p>
                        )}
                      </Panel>
                      <div ref={mappingRef}>
                        <Panel title="原因映射">
                          {channel.mappedReasonCode ? (
                            <div className="row">
                              <span>
                                {reasonName(channel.mappedReasonCode)}
                              </span>
                              {risk && <Badge tone="warning">需合规判断</Badge>}
                            </div>
                          ) : lead ? (
                            <div className="stack">
                              {w.mappingRequestedAt && (
                                <Badge tone="warning">待组长映射</Badge>
                              )}
                              <Selector
                                label="映射为内部原因"
                                value={mappingCode}
                                onChange={setMappingCode}
                                isDisabled={stale || busy || !active}
                                options={mappingCodes
                                  .filter((value) =>
                                    channel?.receiptType === "REJECTED"
                                      ? value.startsWith("CH-REJECT-")
                                      : channel?.receiptType === "TIMEOUT"
                                        ? value === "CH-TIMEOUT"
                                        : [
                                            "CH-MORE-INFO",
                                            "CH-REJECT-DOCS",
                                          ].includes(value),
                                  )
                                  .map((value) => ({
                                    value,
                                    label: reasonName(value),
                                  }))}
                              />
                              <Selector
                                label="原因类型"
                                value={isRiskType ? "risk" : "documents"}
                                isDisabled={stale || busy || !active}
                                options={[
                                  { value: "documents", label: "资料或政策类" },
                                  { value: "risk", label: "风险类" },
                                ]}
                                onChange={(value) =>
                                  setRiskType(value === "risk")
                                }
                              />
                              <div className="action-row">
                                <Btn
                                  disabled={
                                    stale ||
                                    busy ||
                                    !active ||
                                    w.status === "QUEUED"
                                  }
                                  title={
                                    busy
                                      ? "保存完成后可操作"
                                      : stale
                                        ? "刷新后可保存映射"
                                        : w.status === "QUEUED"
                                          ? "点击页面主操作领取工单后可保存映射"
                                          : !active
                                            ? "工单恢复处理中后可保存映射"
                                            : undefined
                                  }
                                  busy={busy}
                                  onClick={() =>
                                    void execute("channel-mapping", {
                                      reasonCode: mappingCode,
                                      isRiskType,
                                    })
                                  }
                                >
                                  保存映射
                                </Btn>
                              </div>
                            </div>
                          ) : (
                            <Badge tone="warning">
                              {w.mappingRequestedAt ? "待组长映射" : "未映射"}
                            </Badge>
                          )}
                        </Panel>
                      </div>
                      <Panel title="本次提交资料">
                        {channel.documents.length ? (
                          <ul className="ops-record-list">
                            {channel.documents.map((document, index) => (
                              <li key={index}>
                                <div className="spread">
                                  <strong>{document.name}</strong>
                                  <Btn
                                    variant="ghost"
                                    onClick={() => setPreview(document)}
                                  >
                                    预览
                                  </Btn>
                                </div>
                                <p className="secondary ops-preserve">
                                  {document.value}
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <Empty title="暂无提交资料" />
                        )}
                      </Panel>
                    </DetailSection>
                    <DetailSection id="channel" value="history" active={tab}>
                      <Panel title="各渠道提交记录">
                        <ol className="ops-record-list">
                          {[
                            channel,
                            ...(data.otherChannels || []).filter(
                              (item) => item.status !== "AVAILABLE",
                            ),
                          ]
                            .filter(
                              (item, index, list) =>
                                list.findIndex(
                                  (other) => other.id === item.id,
                                ) === index,
                            )
                            .sort((a, b) =>
                              b.submittedAt.localeCompare(a.submittedAt),
                            )
                            .map((item) => (
                              <li key={item.id}>
                                <div className="row">
                                  <strong>{item.channelName}</strong>
                                  <IdText value={item.submissionNo} />
                                </div>
                                <p>提交：{dateTime(item.submittedAt)}</p>
                                {item.receiptAt && (
                                  <p>
                                    {item.receiptType
                                      ? receiptLabels[item.receiptType]
                                      : "回执"}
                                    ：{dateTime(item.receiptAt)}
                                  </p>
                                )}
                                {item.lastReminderAt && (
                                  <p>
                                    最近催询：{dateTime(item.lastReminderAt)}
                                  </p>
                                )}
                              </li>
                            ))}
                        </ol>
                      </Panel>
                      {!!relatedSupplements.length && (
                        <Panel title="关联补件">
                          <ul className="ops-record-list">
                            {relatedSupplements.map((order) => (
                              <li key={order.id} className="spread">
                                <Link href={`${supplementHref}${order.id}`}>
                                  {order.id}
                                </Link>
                                <Badge>
                                  {order.status === "DONE"
                                    ? "已完成"
                                    : order.status === "TO_CHECK"
                                      ? "待齐套检查"
                                      : order.status === "TO_SEND"
                                        ? "待发送"
                                        : "等待商户"}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        </Panel>
                      )}
                      <Panel title="申请画像">
                        <dl className="details-grid">
                          <div>
                            <dt>注册地</dt>
                            <dd>{countryName(data.merchant.country)}</dd>
                          </div>
                          <div>
                            <dt>注册号</dt>
                            <dd>
                              <IdText value={data.merchant.registrationNo} />
                            </dd>
                          </div>
                          <div>
                            <dt>申报 MCC</dt>
                            <dd>{mccName(data.merchant.declaredMcc)}</dd>
                          </div>
                          <div>
                            <dt>预估月交易额</dt>
                            <dd>
                              {money(data.merchant.expectedMonthlyVolume)}
                            </dd>
                          </div>
                          <div>
                            <dt>网站</dt>
                            <dd>{data.merchant.website || "—"}</dd>
                          </div>
                          <div>
                            <dt>业务模式</dt>
                            <dd>{data.merchant.businessModel || "—"}</dd>
                          </div>
                        </dl>
                      </Panel>
                    </DetailSection>
                    {data.audit && (
                      <DetailSection id="channel" value="audit" active={tab}>
                        <Panel title="操作日志">
                          <Timeline audit={data.audit} />
                        </Panel>
                      </DetailSection>
                    )}
                  </div>
                  <aside className="detail-aside">
                    <OrderSummary
                      data={data}
                      title="当前处理"
                      actions={headerActions}
                    >
                      <dl className="details-grid ops-details-single">
                        <div>
                          <dt>当前渠道</dt>
                          <dd>{channel.channelName}</dd>
                        </div>
                        <div>
                          <dt>提交编号</dt>
                          <dd>
                            <IdText value={channel.submissionNo} />
                          </dd>
                        </div>
                        <div>
                          <dt>上游回执</dt>
                          <dd>
                            {channel.receiptType
                              ? receiptLabels[channel.receiptType]
                              : "等待回执"}
                          </dd>
                        </div>
                        {channel.receiptAt && (
                          <div>
                            <dt>回执时间</dt>
                            <dd>{dateTime(channel.receiptAt)}</dd>
                          </div>
                        )}
                      </dl>
                      <p className="secondary">
                        {w.status === "CLOSED"
                          ? "工单已结束，保留提交资料与渠道处理记录。"
                          : risk && !riskCleared
                            ? "风险类回执需转合规判断，合规给出结论前停止渠道处理。"
                            : actionReason(recommendation) ||
                              (recommendation === "mapping" ||
                              recommendation === "mapping-request"
                                ? "先完成上游原因映射，再选择处理方式。"
                                : `建议下一步：${actionLabels[recommendation]}`)}
                      </p>
                    </OrderSummary>
                    {!!relatedSupplements.length && (
                      <Panel title="补件进度" className="detail-context">
                        <p>
                          {completedSupplements.length} /{" "}
                          {relatedSupplements.length} 个关联补件已完成
                        </p>
                        <Btn
                          className="detail-shortcut"
                          onClick={() => setTab("history")}
                        >
                          查看关联补件
                        </Btn>
                      </Panel>
                    )}
                  </aside>
                </div>
              </>
            ) : (
              <div className="detail-layout">
                <Empty title="暂无渠道提交记录" />
                <aside className="detail-aside">
                  <OrderSummary data={data} actions={headerActions} />
                </aside>
              </div>
            )}
            {dialog && (
              <Confirm
                open
                title={actionLabels[dialog]}
                description={descriptions[dialog]}
                merchant={
                  dialog === "channel-terminate" && !alternatives.length
                    ? "未通过 · 综合评估"
                    : dialog === "channel-supplement"
                      ? "通知发送后显示资料待补充"
                      : "审核中"
                }
                sales={
                  dialog === "channel-terminate" && !alternatives.length
                    ? "未通过"
                    : "审核中"
                }
                reversible={
                  dialog === "channel-terminate"
                    ? "渠道终止后不可恢复原提交。"
                    : "提交与处理记录保留，不可撤回已发送内容。"
                }
                confirmLabel={`确认${actionLabels[dialog]}`}
                busy={busy}
                confirmDisabled={formInvalid}
                danger={dialog === "channel-terminate"}
                onClose={() => setDialog("")}
                onConfirm={confirmAction}
              >
                {formInvalid && (
                  <p className="secondary" role="status">
                    {blocked
                      ? actionReason(dialog)
                      : dialog === "channel-resubmit"
                        ? "修改至少一项提交资料，并填写全部资料内容后可确认。"
                        : dialog === "channel-supplement"
                          ? "补全每项对外要求及所需字段或人员后可确认。"
                          : dialog === "channel-switch"
                            ? "选择可用的新渠道后可确认。"
                            : "填写原因后可确认。"}
                  </p>
                )}
                <div className="stack">
                  {dialog === "channel-supplement" &&
                    needs.map((item, index) => (
                      <section key={index} className="ops-document-edit stack">
                        {(["zh", "en"] as const).map((language) => (
                          <TextArea
                            key={language}
                            label={`对外补件要求 · ${language === "zh" ? "中文" : "英文"}`}
                            isRequired
                            value={item.externalText[language]}
                            onChange={(text) =>
                              setNeeds((previous) =>
                                previous.map((need, position) =>
                                  position === index
                                    ? {
                                        ...need,
                                        externalText: {
                                          ...need.externalText,
                                          [language]: text,
                                        },
                                      }
                                    : need,
                                ),
                              )
                            }
                          />
                        ))}
                        <div className="ops-info-note">
                          <strong>
                            商户文案预览 ·{" "}
                            {(data.application.communicationLanguage ||
                              "en") === "zh"
                              ? "中文"
                              : "英文"}
                          </strong>
                          <p>
                            {item.externalText[
                              data.application.communicationLanguage || "en"
                            ] || "请填写对应语言的补件要求"}
                          </p>
                        </div>
                        <Selector
                          label="补交方式"
                          value={item.actionType}
                          options={Object.entries(supplementActionLabels).map(
                            ([value, label]) => ({ value, label }),
                          )}
                          onChange={(value) =>
                            setNeeds((previous) =>
                              previous.map((need, position) =>
                                position === index
                                  ? {
                                      ...need,
                                      actionType: value as SupplementAction,
                                    }
                                  : need,
                              ),
                            )
                          }
                        />
                        {item.actionType === "CONFIRM_FIELD" && (
                          <TextInput
                            label="需确认的字段"
                            isRequired
                            value={item.field || ""}
                            onChange={(field) =>
                              setNeeds((previous) =>
                                previous.map((need, position) =>
                                  position === index
                                    ? { ...need, field }
                                    : need,
                                ),
                              )
                            }
                          />
                        )}
                        {item.actionType === "REVERIFY" && (
                          <Selector
                            label="需重新验证的人员"
                            isRequired
                            value={item.targetPersonId}
                            options={(data.people || []).map((person) => ({
                              value: person.id,
                              label: `${person.name} · ${person.role}`,
                            }))}
                            onChange={(targetPersonId) =>
                              setNeeds((previous) =>
                                previous.map((need, position) =>
                                  position === index
                                    ? { ...need, targetPersonId }
                                    : need,
                                ),
                              )
                            }
                          />
                        )}
                      </section>
                    ))}
                  {dialog === "channel-resubmit" && (
                    <>
                      {documents.map((document, index) => (
                        <section
                          key={index}
                          className="ops-document-edit stack"
                        >
                          <TextArea
                            label={document.name}
                            isRequired
                            rows={2}
                            value={document.value}
                            onChange={(value) =>
                              setDocuments((previous) =>
                                previous.map((item, position) =>
                                  position === index
                                    ? { ...item, value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <FileUpload
                            maxCount={1}
                            value={document.file ? [document.file] : []}
                            onChange={(files: UploadedFile[]) =>
                              setDocuments((previous) =>
                                previous.map((item, position) =>
                                  position === index
                                    ? {
                                        ...item,
                                        file: files[0],
                                        value: files[0]?.name || item.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </section>
                      ))}
                      <h3 className="section-title">提交前后对比</h3>
                      <Table
                        data={changes}
                        idKey="key"
                        density="compact"
                        columns={[
                          {
                            key: "name",
                            header: "资料",
                            width: proportional(1),
                          },
                          {
                            key: "before",
                            header: "修改前",
                            width: proportional(2),
                            renderCell: (row) => (
                              <span>
                                {row.before?.value || "—"}
                                {row.before?.file && (
                                  <>
                                    <br />
                                    {row.before.file.name}
                                  </>
                                )}
                              </span>
                            ),
                          },
                          {
                            key: "after",
                            header: "修改后",
                            width: proportional(2),
                            renderCell: (row) => (
                              <span
                                className={
                                  row.before?.value !== row.after.value ||
                                  row.before?.file?.id !== row.after.file?.id
                                    ? "ops-changed"
                                    : ""
                                }
                              >
                                {row.after.value || "—"}
                                {row.after.file && (
                                  <>
                                    <br />
                                    {row.after.file.name}
                                  </>
                                )}
                              </span>
                            ),
                          },
                        ]}
                      />
                    </>
                  )}
                  {dialog === "channel-switch" && (
                    <>
                      <Selector
                        label="新渠道"
                        isRequired
                        value={channelId || undefined}
                        onChange={setChannelId}
                        options={alternatives.map((item) => ({
                          value: item.channelId,
                          label: item.channelName,
                        }))}
                      />
                      <h3 className="section-title">新渠道额外要求的资料</h3>
                      {(selectedChannel?.requiredDocuments || []).filter(
                        (name) =>
                          !channel?.documents.some(
                            (document) => document.name === name,
                          ),
                      ).length ? (
                        <ul className="ops-record-list">
                          {(selectedChannel?.requiredDocuments || [])
                            .filter(
                              (name) =>
                                !channel?.documents.some(
                                  (document) => document.name === name,
                                ),
                            )
                            .map((name, index) => (
                              <li key={index}>{name}</li>
                            ))}
                        </ul>
                      ) : (
                        <p className="secondary">无需额外资料</p>
                      )}
                    </>
                  )}
                  {(dialog === "channel-terminate" ||
                    dialog === "channel-escalate") && (
                    <TextArea
                      label="原因"
                      isRequired={dialog !== "channel-escalate"}
                      value={reason}
                      onChange={setReason}
                      rows={3}
                      maxLength={2000}
                    />
                  )}
                  {dialog === "channel-remind" && (
                    <Selector
                      label="催询方式"
                      value={method}
                      onChange={setMethod}
                      options={["邮件", "电话", "渠道门户"]}
                    />
                  )}
                </div>
              </Confirm>
            )}
            <Dialog
              isOpen={!!preview}
              onOpenChange={(open) => {
                if (!open) setPreview(null);
              }}
              purpose="info"
              width={900}
            >
              <DialogHeader
                title={preview?.name || "资料预览"}
                onOpenChange={() => setPreview(null)}
              />
              {preview && (
                <MaterialPreview
                  value={preview.value}
                  files={preview.file ? [preview.file] : []}
                />
              )}
            </Dialog>
          </>
        )}
      </LoadState>
    </div>
  );
}
