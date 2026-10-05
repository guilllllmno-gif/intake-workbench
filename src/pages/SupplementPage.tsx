import { useEffect, useState } from "react";
import { useHref, useSearchParams } from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import {
  DateTimeInput,
  type ISODateTimeString,
} from "@astryxdesign/core/DateTimeInput";
import { Dialog } from "@astryxdesign/core/Dialog";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Link } from "@astryxdesign/core/Link";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import dayjs from "dayjs";
import { api } from "../api";
import { useDetailView, useOrder, useQueueFlow, useSession } from "../hooks";
import {
  Badge,
  Btn,
  Confirm,
  DetailSection,
  DetailTabs,
  DialogHeader,
  Empty,
  Field,
  FileUpload,
  IdText,
  InlineConfirm,
  LoadState,
  OrderHeader,
  OrderSummary,
  Panel,
  PersonName,
  Timeline,
} from "../ui";
import { dateTime, deadlineDate } from "../format";
import type {
  CommunicationLanguage,
  ContactLog,
  MutationAction,
  NoticePreview,
  UploadedFile,
} from "../types";
import "./ops-pages.css";

export const supplementActionLabels = {
  UPLOAD: "上传文件",
  REVERIFY: "重新做个人验证",
  CONFIRM_FIELD: "确认字段",
};
const itemLabels = {
  PENDING: "待发送",
  SENT: "已发送",
  PROVIDED: "已提供",
  REJECTED: "不合格",
  MISSING: "未提供",
};
const channels = {
  PHONE: "电话",
  EMAIL: "邮件",
  IM: "即时消息",
  SMS: "短信",
  PORTAL: "门户",
};
const rejectOptions = [
  "模糊",
  "不完整",
  "已过期",
  "类型不符",
  "与要求不符",
].map((value) => ({ value, label: value }));
const contactResults = {
  CONNECTED: "已接通",
  NO_ANSWER: "未接通",
  PROMISED: "承诺提交日期",
};

export function MaterialPreview({
  files,
  value,
  language = "zh",
  merchant = false,
}: {
  files?: UploadedFile[];
  value?: string;
  language?: CommunicationLanguage;
  merchant?: boolean;
}) {
  const [selected, setSelected] = useState<UploadedFile>();
  const source =
    selected?.url ||
    (selected?.content?.startsWith("data:") ? selected.content : undefined);
  const text = (zh: string, en: string) => (language === "zh" ? zh : en);
  return (
    <div className="material-preview" lang={language}>
      {value && <p className="ops-preserve">{value}</p>}
      {!!files?.length && (
        <ul className="ops-thumbnail-list">
          {files.map((file) => {
            const url =
              file.url ||
              (file.content?.startsWith("data:") ? file.content : undefined);
            return (
              <li key={file.id}>
                <button
                  type="button"
                  className="ops-thumbnail"
                  onClick={() => setSelected(file)}
                  aria-label={`${text("预览", "Preview")} ${file.name}`}
                >
                  <span className="ops-thumbnail-image" aria-hidden="true">
                    {url && file.type.startsWith("image/") ? (
                      <img src={url} alt="" loading="lazy" />
                    ) : url && file.type === "application/pdf" ? (
                      <iframe
                        src={`${url}#toolbar=0&navpanes=0&view=FitH`}
                        title={file.name}
                        tabIndex={-1}
                        loading="lazy"
                      />
                    ) : (
                      <span>{text("文件", "File")}</span>
                    )}
                  </span>
                  <strong>{file.name}</strong>
                  <span className="secondary">
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </button>
                {!merchant && (
                  <div className="secondary">
                    <PersonName user={file.uploadedBy} /> ·{" "}
                    {dateTime(file.uploadedAt)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        isOpen={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        width={1100}
      >
        <DialogHeader
          title={selected?.name || text("文件预览", "File preview")}
          onOpenChange={() => setSelected(undefined)}
        />
        {selected &&
          source &&
          (selected.type.startsWith("image/") ? (
            <img
              src={source}
              alt={selected.name}
              className="ops-document-full"
            />
          ) : selected.type === "application/pdf" ? (
            <iframe
              className="ops-document-frame"
              title={selected.name}
              src={source}
            />
          ) : (
            <Link href={source} download={selected.name}>
              {text("下载", "Download")} {selected.name}
            </Link>
          ))}
        {selected && !source && (
          <pre className="ops-document-text">
            {selected.content || text("文件暂不可预览", "Preview unavailable")}
          </pre>
        )}
      </Dialog>
      {!files?.length && !value && (
        <p className="secondary">
          {text("商户尚未提交本项内容", "No information submitted yet")}
        </p>
      )}
    </div>
  );
}

export default function SupplementPage() {
  const { session } = useSession();
  const queueFlow = useQueueFlow();
  const merchantHref = useHref("/merchant/");
  const { data, loading, error, stale, busy, reload, act } = useOrder();
  const [tab, setTab] = useDetailView("workspace", [
    "workspace",
    ...(session.role === "OPS_AGENT" ||
    session.role === "OPS_LEAD" ||
    data?.workOrder.contactLog
      ? ["contacts"]
      : []),
    ...(session.role === "OPS_AGENT" || session.role === "OPS_LEAD"
      ? ["notices"]
      : []),
    "extensions",
    ...(data?.audit ? ["audit"] : []),
  ]);
  const [copyStatus, setCopyStatus] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("item") || "";
  function setSelectedId(id: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("item", id);
      return next;
    });
  }
  const [dialog, setDialog] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeChannel, setNoticeChannel] = useState<
    "EMAIL" | "SMS" | "PORTAL"
  >("EMAIL");
  const [recipient, setRecipient] = useState("");
  const [noticePreview, setNoticePreview] = useState<NoticePreview | null>(
    null,
  );
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);
  const [contactAt, setContactAt] = useState(() => dayjs());
  const [contactName, setContactName] = useState("");
  const [contactResult, setContactResult] =
    useState<NonNullable<ContactLog["result"]>>("CONNECTED");
  const [promisedAt, setPromisedAt] = useState<dayjs.Dayjs | null>(null);
  const [rejectItemId, setRejectItemId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [reason, setReason] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [contactChannel, setContactChannel] = useState<
    "PHONE" | "EMAIL" | "IM"
  >("PHONE");
  const [dueAt, setDueAt] = useState<dayjs.Dayjs | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [extensionId, setExtensionId] = useState("");
  const w = data?.workOrder;
  const items = w?.items || [];
  const selected =
    items.find((item) => item.id === selectedId) ||
    items.find((item) => !item.checked) ||
    items[0];
  const ops = session.role === "OPS_AGENT" || session.role === "OPS_LEAD";
  const terminal =
    !!w && ["DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(w.status);
  const owns = ops && w?.assignee?.id === session.userId;
  const disabled = busy || stale || !owns || terminal;
  const disabledReason = busy
    ? "正在保存，请完成后再操作"
    : stale
      ? "工单已更新，刷新后可操作"
      : terminal
        ? "工单已结束，不能再修改"
        : !owns
          ? w?.assignee
            ? `由 ${w.assignee.name} 处理，转派给你后可操作`
            : "领取工单后可操作"
          : "";
  const rejected = items.filter(
    (item) => item.status === "REJECTED" || item.status === "MISSING",
  );
  const uncheckedProvided = items.some(
    (item) => item.status === "PROVIDED" && !item.checked,
  );
  const allUsable =
    items.length > 0 &&
    items.every((item) => item.checked && item.status === "PROVIDED");
  const pendingNotices = items.filter((item) => item.status === "PENDING");
  const noticeItems = pendingNotices.length ? pendingNotices : items;
  const contacts = data?.merchant.contacts || [];
  const contact = contacts[0];
  const extensions = w?.extensions || [];
  const pendingExtension = extensions.find((item) => item.status === "PENDING");
  const firstExtension = !extensions.some((item) => item.status === "APPROVED");
  const currentExtension = extensions.find((item) => item.id === extensionId);
  useEffect(() => {
    setRejectItemId("");
    setRejectReason(selected?.rejectReason || "");
  }, [
    selected?.id,
    selected?.status,
    selected?.checked,
    selected?.rejectReason,
  ]);
  useEffect(() => {
    setDialog("");
    setCopyStatus("");
    setNoticeOpen(false);
    setReleaseReason("");
  }, [w?.id, session.userId]);
  useEffect(() => {
    if (!noticeOpen || !w?.id) return;
    let current = true;
    setNoticeLoading(true);
    setNoticeError("");
    setNoticePreview(null);
    void api
      .previewNotice(w.id, { channel: noticeChannel }, session)
      .then(
        (preview) => {
          if (!current) return;
          setNoticePreview(preview);
          setNoticeBody(preview.body);
        },
        (error: unknown) => {
          if (current)
            setNoticeError(
              error instanceof Error
                ? error.message
                : "通知预览加载失败，请重试",
            );
        },
      )
      .finally(() => {
        if (current) setNoticeLoading(false);
      });
    return () => {
      current = false;
    };
  }, [noticeOpen, w?.id, w?.version, noticeChannel, session, previewRevision]);
  function open(name: string) {
    setReason("");
    setFiles([]);
    setDueAt(w?.dueAt ? dayjs(w.dueAt).add(7, "day") : null);
    if (name === "contact") {
      setContactAt(dayjs());
      setContactName(contact?.name || "");
      setContactResult("CONNECTED");
      setPromisedAt(null);
    }
    setDialog(name);
  }
  function openNotice() {
    const channel = contact?.preferredChannel || "EMAIL";
    setNoticeChannel(channel);
    setRecipient(
      channel === "EMAIL"
        ? contact?.email || ""
        : channel === "SMS"
          ? contact?.phone || ""
          : contact?.email || "",
    );
    setNoticeOpen(true);
  }
  async function execute(
    action: MutationAction,
    payload: Record<string, unknown> = {},
  ) {
    const result = await act(action, payload);
    if (result) {
      setDialog("");
      if (action === "notices") setNoticeOpen(false);
      if (action === "complete-supplement" || action === "withdraw")
        await queueFlow.next(result.workOrder.id);
    }
    return result;
  }
  async function confirmAction() {
    if (!w) return;
    if (dialog === "contact")
      await execute("contact-logs", {
        at: contactAt.toISOString(),
        contact: contactName.trim(),
        channel: contactChannel,
        result: contactResult,
        promisedAt:
          contactResult === "PROMISED" ? promisedAt?.toISOString() : undefined,
        summary: reason.trim(),
      });
    if (dialog === "remind")
      await execute("reminders", {
        channel: contact?.preferredChannel || "EMAIL",
      });
    if (dialog === "extend" && dueAt)
      await execute("extensions", {
        dueAt: dueAt.toISOString(),
        reason: reason.trim(),
      });
    if (dialog === "return") await execute("return-to-merchant");
    if (dialog === "complete") await execute("complete-supplement");
    if (dialog === "withdraw")
      await execute("withdraw", { reason: reason.trim(), files });
    if (dialog === "approve-extension" || dialog === "reject-extension")
      await execute("approve-extension", {
        extensionId,
        approved: dialog === "approve-extension",
        reason: reason.trim(),
      });
  }
  const descriptions: Record<
    string,
    {
      title: string;
      description: string;
      merchant: string;
      sales: string;
      reversible: string;
    }
  > = {
    remind: {
      title: "手动催办",
      description: "立即发送一次补件提醒，累计提醒次数并记录沟通。",
      merchant: "收到补件提醒",
      sales: "资料待补充",
      reversible: "提醒发送后不可撤回。",
    },
    extend: {
      title: "申请延期",
      description: firstExtension
        ? "本次为首次延期，最多延长 7 天，确认后新截止日期立即生效。"
        : "提交运营组长审批；批准前原截止日期仍有效。",
      merchant: firstExtension ? "补件截止日期更新" : "补件截止日期暂不改变",
      sales: "资料待补充",
      reversible: "延期申请及审批记录不可删除。",
    },
    return: {
      title: "退回补正",
      description: `仅退回 ${rejected.length} 项不合格或未提供内容；已判定可用的材料保留。工单变为等待商户。`,
      merchant: "收到本次待补正项与原因",
      sales: "资料待补充",
      reversible: "通知不可撤回，商户可以再次提交。",
    },
    complete: {
      title: "完成补件",
      description:
        "补件工单变为已完成；合规来源仅重跑受影响检查并回到原审核员，全部问题解决时自动结案；渠道来源回到对应渠道工单待重提。",
      merchant: "已提交，审核中",
      sales: "审核中；通过后更新为已通过",
      reversible: "完成后不可修改本次齐套检查记录。",
    },
    withdraw: {
      title: "记录商户放弃",
      description: "保存商户书面确认，申请结案为撤回，并通知合规与销售。",
      merchant: "申请已撤回",
      sales: "申请已撤回",
      reversible: "撤回后本次申请不可继续办理。",
    },
    "approve-extension": {
      title: "批准延期",
      description: `商户截止更新为 ${deadlineDate(currentExtension?.requestedDueAt, data?.merchant.country)}。`,
      merchant: "补件截止日期更新",
      sales: "资料待补充",
      reversible: "审批决定与原截止日期保留。",
    },
    "reject-extension": {
      title: "驳回延期",
      description: "本次申请不生效，仍按原截止日期补件。",
      merchant: "补件截止日期不变",
      sales: "资料待补充",
      reversible: "审批记录不可删除，可重新申请。",
    },
  };
  const extensionValid =
    !!dueAt &&
    !!w?.dueAt &&
    dueAt.isAfter(dayjs(w.dueAt)) &&
    (!firstExtension || !dueAt.isAfter(dayjs(w.dueAt).add(7, "day")));
  const formInvalid =
    (["extend", "withdraw", "reject-extension"].includes(dialog) &&
      !reason.trim()) ||
    (dialog === "withdraw" && !files.length) ||
    (dialog === "extend" && (!extensionValid || !!pendingExtension)) ||
    (dialog === "complete" && !allUsable) ||
    (dialog === "return" && (!rejected.length || uncheckedProvided));
  const actions =
    ops && w && !terminal ? (
      <div className="row">
        {!w.assignee ? (
          <Btn
            variant="primary"
            disabled={busy || stale}
            busy={busy}
            onClick={async () => {
              if (await execute("claim")) {
                if (w.status === "TO_SEND" || pendingNotices.length)
                  openNotice();
                else if (w.status === "TO_CHECK") {
                  setTab("workspace");
                  requestAnimationFrame(() =>
                    document
                      .getElementById("supplement-quality")
                      ?.scrollIntoView({ block: "center" }),
                  );
                }
              }
            }}
          >
            领取并处理
          </Btn>
        ) : (
          <>
            {w.status === "TO_SEND" || pendingNotices.length > 0 ? (
              <Btn
                variant="primary"
                disabled={disabled}
                title={disabledReason || undefined}
                onClick={openNotice}
              >
                发送通知
              </Btn>
            ) : w.status === "TO_CHECK" ? (
              <Btn
                variant="primary"
                disabled={disabled || !allUsable}
                title={
                  disabledReason ||
                  (!allUsable
                    ? "完成补件：全部补件项判定可用后可用"
                    : undefined)
                }
                onClick={() => open("complete")}
              >
                完成补件
              </Btn>
            ) : null}
            <Btn
              disabled={disabled}
              title={disabledReason || undefined}
              onClick={() => open("contact")}
            >
              记录沟通
            </Btn>
          </>
        )}
        <Btn
          disabled={disabled || w.status !== "WAITING_MERCHANT"}
          title={
            disabledReason ||
            (w.status !== "WAITING_MERCHANT"
              ? "手动催办：发送通知并等待商户时可用"
              : undefined)
          }
          onClick={() => open("remind")}
        >
          手动催办
        </Btn>
        <Btn
          disabled={
            disabled || w.status !== "WAITING_MERCHANT" || !!pendingExtension
          }
          title={
            disabledReason ||
            (pendingExtension
              ? "申请延期：现有延期审批完成后可用"
              : w.status !== "WAITING_MERCHANT"
                ? "申请延期：发送通知并等待商户时可用"
                : undefined)
          }
          onClick={() => open("extend")}
        >
          申请延期
        </Btn>
        <DropdownMenu
          button={{ label: "更多", variant: "secondary" }}
          items={[
            {
              label: "退回补正",
              description:
                disabledReason ||
                (w.status !== "TO_CHECK"
                  ? "商户提交材料后可用"
                  : uncheckedProvided
                    ? "完成其余项目齐套检查后可用"
                    : !rejected.length
                      ? "存在不合格或未提供项时可用"
                      : undefined),
              isDisabled:
                disabled ||
                w.status !== "TO_CHECK" ||
                !rejected.length ||
                uncheckedProvided,
              onClick: () => open("return"),
            },
            {
              label: "记录商户放弃",
              variant: "destructive",
              description: disabledReason || undefined,
              isDisabled: disabled,
              onClick: () => open("withdraw"),
            },
          ]}
        />
        <InlineConfirm
          title="释放工单后，工单回到待领取队列，SLA 继续计时。"
          disabled={disabled}
          busy={busy}
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
          onConfirm={() => execute("release", { reason: releaseReason.trim() })}
        >
          <Btn disabled={disabled} title={disabledReason || undefined}>
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
            {ops && !terminal && !owns && (
              <Banner
                status="info"
                title={
                  w.assignee
                    ? `当前由 ${w.assignee.name} 处理`
                    : "可以浏览材料；点击主操作领取并继续"
                }
              />
            )}
            <DetailTabs
              id="supplement"
              value={tab}
              onChange={setTab}
              items={[
                { value: "workspace", label: "材料检查", count: items.length },
                ...(ops || w.contactLog
                  ? [
                      {
                        value: "contacts",
                        label: "联系与沟通",
                        count: w.contactLog?.length,
                      },
                    ]
                  : []),
                ...(ops ? [{ value: "notices", label: "补件通知" }] : []),
                {
                  value: "extensions",
                  label: "截止与延期",
                  count: extensions.length,
                },
                ...(data.audit ? [{ value: "audit", label: "操作日志" }] : []),
              ]}
            />
            <div className="detail-layout">
              <div className="detail-main">
                <DetailSection id="supplement" value="workspace" active={tab}>
                  <div className="supplement-workspace">
                    <div className="ops-main-column">
                      {w.noteToOps && (
                        <div className="ops-info-note" role="note">
                          <strong>给运营的说明</strong>
                          <p>{w.noteToOps}</p>
                        </div>
                      )}
                      <Panel
                        title={`补件清单 · ${items.length} 项`}
                        className="ops-list-panel"
                      >
                        {items.length ? (
                          <ul className="ops-item-list">
                            {items.map((item) => (
                              <li
                                key={item.id}
                                className={
                                  selected?.id === item.id ? "ops-selected" : ""
                                }
                              >
                                <button
                                  type="button"
                                  className="ops-item-button"
                                  aria-pressed={selected?.id === item.id}
                                  onClick={() => setSelectedId(item.id)}
                                >
                                  {item.externalText.zh}
                                </button>
                                <div className="row ops-item-meta">
                                  <span className="secondary">
                                    {supplementActionLabels[item.actionType]}
                                  </span>
                                  <Badge
                                    tone={
                                      item.status === "REJECTED"
                                        ? "danger"
                                        : item.checked
                                          ? "success"
                                          : "neutral"
                                    }
                                  >
                                    {item.checked && item.status === "PROVIDED"
                                      ? "可用"
                                      : itemLabels[item.status]}
                                  </Badge>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <Empty title="暂无补件项" />
                        )}
                      </Panel>
                    </div>
                    <Panel
                      title={selected?.externalText.zh || "提交内容"}
                      className="ops-center-panel"
                    >
                      {selected ? (
                        <div className="stack">
                          <MaterialPreview
                            files={selected.files}
                            value={selected.response}
                          />
                          {selected.rejectReason && (
                            <Banner
                              status="warning"
                              title={`不合格原因：${selected.rejectReason}`}
                            />
                          )}
                          {selected.checkedBy && (
                            <div className="secondary">
                              检查人：
                              <PersonName user={selected.checkedBy} /> ·{" "}
                              {dateTime(selected.checkedAt)}
                            </div>
                          )}
                          {ops && w.status === "TO_CHECK" && (
                            <section
                              className="ops-quality"
                              id="supplement-quality"
                            >
                              <h2 className="section-title">齐套检查</h2>
                              <div
                                className="ops-quality-segments"
                                role="group"
                                aria-label="检查结论"
                              >
                                {(
                                  [
                                    ["USABLE", "可用"],
                                    ["REJECTED", "不合格"],
                                    ["MISSING", "未提供"],
                                  ] as const
                                ).map(([result, label]) => (
                                  <button
                                    key={result}
                                    type="button"
                                    className={
                                      result === "REJECTED"
                                        ? "ops-quality-reject"
                                        : ""
                                    }
                                    aria-pressed={
                                      result === "USABLE"
                                        ? selected.checked &&
                                          selected.status === "PROVIDED"
                                        : selected.status === result
                                    }
                                    disabled={
                                      disabled ||
                                      (result === "USABLE" &&
                                        selected.status !== "PROVIDED")
                                    }
                                    title={
                                      disabledReason ||
                                      (result === "USABLE" &&
                                      selected.status !== "PROVIDED"
                                        ? "商户提供本项材料后可判定可用"
                                        : undefined)
                                    }
                                    onClick={() => {
                                      if (result === "REJECTED") {
                                        setRejectReason(
                                          selected.rejectReason || "",
                                        );
                                        setRejectItemId(selected.id);
                                      } else {
                                        void execute("supplement-check", {
                                          itemId: selected.id,
                                          result,
                                          ...(result === "MISSING"
                                            ? { reason: "未提供" }
                                            : {}),
                                        });
                                      }
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </section>
                          )}
                        </div>
                      ) : (
                        <Empty title="暂无待检查材料" />
                      )}
                    </Panel>
                  </div>
                </DetailSection>
                <DetailSection id="supplement" value="contacts" active={tab}>
                  {ops && (
                    <div className="ops-contact-layout">
                      <Panel title="商户联系人">
                        {contacts.length ? (
                          contacts.map((person) => (
                            <dl
                              key={person.email}
                              className="details-grid ops-details-single"
                            >
                              <div>
                                <dt>姓名</dt>
                                <dd>{person.name}</dd>
                              </div>
                              <div>
                                <dt>邮箱</dt>
                                <dd>{person.email || "—"}</dd>
                              </div>
                              <div>
                                <dt>电话</dt>
                                <dd>{person.phone || "—"}</dd>
                              </div>
                              <div>
                                <dt>首选渠道</dt>
                                <dd>{channels[person.preferredChannel]}</dd>
                              </div>
                            </dl>
                          ))
                        ) : (
                          <Empty title="尚未登记联系人" />
                        )}
                      </Panel>
                      <Panel title="沟通记录">
                        {w.contactLog?.length ? (
                          <ol className="ops-record-list">
                            {w.contactLog.map((log, index) => (
                              <li key={index}>
                                <div className="row">
                                  <Badge>{channels[log.channel]}</Badge>
                                  <PersonName user={log.by} />
                                </div>
                                <p>{log.summary}</p>
                                {log.contact && <p>联系人：{log.contact}</p>}
                                {log.result && (
                                  <p>
                                    {contactResults[log.result]}
                                    {log.promisedAt
                                      ? ` · ${deadlineDate(log.promisedAt, data.merchant.country)}`
                                      : ""}
                                  </p>
                                )}
                                <span className="secondary">
                                  {dateTime(log.at)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <Empty title="暂无沟通记录" />
                        )}
                      </Panel>
                    </div>
                  )}
                  {!ops && w.contactLog && (
                    <Panel title="沟通记录">
                      {w.contactLog.length ? (
                        <ol className="ops-record-list">
                          {w.contactLog.map((log, index) => (
                            <li key={index}>
                              <span>
                                {channels[log.channel]} · {dateTime(log.at)}
                              </span>
                              <p>{log.summary}</p>
                              {log.contact && <p>联系人：{log.contact}</p>}
                              {log.result && (
                                <p>
                                  {contactResults[log.result]}
                                  {log.promisedAt
                                    ? ` · ${deadlineDate(log.promisedAt, data.merchant.country)}`
                                    : ""}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <Empty title="暂无沟通记录" />
                      )}
                    </Panel>
                  )}
                </DetailSection>
                <DetailSection id="supplement" value="notices" active={tab}>
                  {ops && (
                    <Panel title="通知模板">
                      <p>资料补充通知</p>
                      <p className="secondary">
                        {noticeItems.length} 项 · 邮件 / 短信 / 门户
                      </p>
                      {(w.status === "TO_SEND" ||
                        pendingNotices.length > 0) && (
                        <div className="action-row">
                          <Btn
                            disabled={disabled}
                            title={disabledReason || undefined}
                            onClick={openNotice}
                          >
                            预览并发送通知
                          </Btn>
                        </div>
                      )}
                      {w.merchantToken && (
                        <div className="stack">
                          <Link href={`${merchantHref}${w.merchantToken}`}>
                            补件链接
                          </Link>
                          <Btn
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(
                                  new URL(
                                    `${merchantHref}${w.merchantToken}`,
                                    window.location.href,
                                  ).href,
                                )
                                .then(
                                  () => setCopyStatus("补件链接已复制"),
                                  () =>
                                    setCopyStatus(
                                      "复制失败，请打开补件链接后复制地址",
                                    ),
                                );
                            }}
                          >
                            复制补件链接
                          </Btn>
                          <span role="status" className="secondary">
                            {copyStatus}
                          </span>
                        </div>
                      )}
                    </Panel>
                  )}
                </DetailSection>
                <DetailSection id="supplement" value="extensions" active={tab}>
                  <Panel title="当前截止">
                    <dl className="details-grid">
                      <div>
                        <dt>商户补交截止</dt>
                        <dd>{deadlineDate(w.dueAt, data.merchant.country)}</dd>
                      </div>
                      <div>
                        <dt>延期审批</dt>
                        <dd>
                          {pendingExtension
                            ? "待组长批准，原截止仍有效"
                            : "无待审批申请"}
                        </dd>
                      </div>
                    </dl>
                  </Panel>
                  <Panel title="延期记录">
                    {!extensions.length && <Empty title="暂无延期记录" />}
                    <ul className="ops-record-list">
                      {extensions.map((item) => (
                        <li key={item.id}>
                          <div className="spread">
                            <div className="row">
                              <PersonName user={item.requestedBy} />
                              <Badge>
                                {item.status === "PENDING"
                                  ? "待组长批准"
                                  : item.status === "APPROVED"
                                    ? "已批准"
                                    : "已驳回"}
                              </Badge>
                            </div>
                            {ops &&
                              session.role === "OPS_LEAD" &&
                              item.status === "PENDING" && (
                                <div className="row">
                                  <Btn
                                    disabled={busy || stale}
                                    title={
                                      busy
                                        ? "正在保存，请完成后再操作"
                                        : stale
                                          ? "工单已更新，刷新后可审批"
                                          : undefined
                                    }
                                    onClick={() => {
                                      setExtensionId(item.id);
                                      open("approve-extension");
                                    }}
                                  >
                                    批准
                                  </Btn>
                                  <Btn
                                    variant="danger"
                                    disabled={busy || stale}
                                    title={
                                      busy
                                        ? "正在保存，请完成后再操作"
                                        : stale
                                          ? "工单已更新，刷新后可审批"
                                          : undefined
                                    }
                                    onClick={() => {
                                      setExtensionId(item.id);
                                      open("reject-extension");
                                    }}
                                  >
                                    驳回
                                  </Btn>
                                </div>
                              )}
                          </div>
                          <p>
                            {deadlineDate(
                              item.originalDueAt,
                              data.merchant.country,
                            )}{" "}
                            →{" "}
                            {deadlineDate(
                              item.requestedDueAt,
                              data.merchant.country,
                            )}
                          </p>
                          <p>{item.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                </DetailSection>
                {data.audit && (
                  <DetailSection id="supplement" value="audit" active={tab}>
                    <Panel title="操作日志">
                      <Timeline audit={data.audit} />
                    </Panel>
                  </DetailSection>
                )}
              </div>
              <aside className="detail-aside">
                <OrderSummary data={data} title="当前处理" actions={actions}>
                  <dl className="details-grid ops-details-single">
                    <div>
                      <dt>齐套进度</dt>
                      <dd>
                        {
                          items.filter(
                            (item) =>
                              item.checked && item.status === "PROVIDED",
                          ).length
                        }{" "}
                        / {items.length} 项可用
                      </dd>
                    </div>
                    <div>
                      <dt>商户补交截止</dt>
                      <dd>{deadlineDate(w.dueAt, data.merchant.country)}</dd>
                    </div>
                  </dl>
                  <p className="secondary">
                    {terminal
                      ? "工单已结束，保留本次材料与处理记录。"
                      : w.status === "TO_CHECK"
                        ? allUsable
                          ? "全部材料已判定可用，可以完成补件。"
                          : "逐项查看提交内容并完成齐套检查；全部可用后才可完成补件。"
                        : w.status === "TO_SEND" || pendingNotices.length
                          ? "预览补件通知，确认收件人与通讯语言后发送。"
                          : "等待商户补交，可记录沟通、催办或申请延期。"}
                  </p>
                </OrderSummary>
                {pendingExtension && (
                  <Panel title="待处理延期" className="detail-context">
                    <p>
                      申请截止：
                      {deadlineDate(
                        pendingExtension.requestedDueAt,
                        data.merchant.country,
                      )}
                    </p>
                    <Btn
                      className="detail-shortcut"
                      onClick={() => setTab("extensions")}
                    >
                      查看延期申请
                    </Btn>
                  </Panel>
                )}
              </aside>
            </div>
            <BottomSheet
              isOpen={noticeOpen && ops}
              onOpenChange={(isOpen) => {
                if (!busy) setNoticeOpen(isOpen);
              }}
              label="发送补件通知"
              purpose="form"
              height="tall"
              className="ops-notice-sheet"
            >
              <div className="ops-pages ops-notice-content">
                <div className="spread">
                  <h2>发送补件通知 · {noticeItems.length} 项</h2>
                  <Btn
                    onClick={() => setNoticeOpen(false)}
                    disabled={busy}
                    title={busy ? "发送处理中，完成后可关闭" : undefined}
                  >
                    关闭
                  </Btn>
                </div>
                <div className="ops-notice-editor ops-dialog-body">
                  <div className="stack">
                    <Selector
                      label="发送渠道"
                      value={noticeChannel}
                      options={[
                        { value: "EMAIL", label: "邮件" },
                        { value: "SMS", label: "短信" },
                        { value: "PORTAL", label: "门户" },
                      ]}
                      isDisabled={busy}
                      onChange={(value) => {
                        const next = value as typeof noticeChannel;
                        setNoticeChannel(next);
                        setRecipient(
                          next === "SMS"
                            ? contact?.phone || ""
                            : contact?.email || "",
                        );
                      }}
                    />
                    <TextInput
                      label="收件人"
                      isRequired
                      value={recipient}
                      onChange={setRecipient}
                      isDisabled={busy}
                    />
                    <p className="secondary">
                      按申请登记的通讯语言生成中性文案，未登记时使用英文；补件项目不可删除，不得加入内部审核信息。
                    </p>
                    {noticeError && (
                      <Banner
                        status="error"
                        title={noticeError}
                        endContent={
                          <Btn
                            onClick={() =>
                              setPreviewRevision((value) => value + 1)
                            }
                          >
                            重试
                          </Btn>
                        }
                      />
                    )}
                    {noticeLoading ? (
                      <p role="status">正在生成通知预览…</p>
                    ) : (
                      noticePreview && (
                        <TextArea
                          label="通知正文"
                          isRequired
                          rows={12}
                          value={noticeBody}
                          onChange={setNoticeBody}
                          isDisabled={busy}
                        />
                      )
                    )}
                  </div>
                  <Panel
                    title={`${channels[noticeChannel]}预览${noticePreview ? (noticePreview.language === "en" ? " · 英文" : " · 中文") : ""}`}
                  >
                    {noticePreview && (
                      <>
                        <dl className="details-grid ops-details-single">
                          <div>
                            <dt>发件人</dt>
                            <dd>{noticePreview.sender}</dd>
                          </div>
                          <div>
                            <dt>收件人</dt>
                            <dd>{recipient || "—"}</dd>
                          </div>
                          <div>
                            <dt>主题</dt>
                            <dd>{noticePreview.subject}</dd>
                          </div>
                        </dl>
                        <p className="ops-preserve">{noticeBody}</p>
                      </>
                    )}
                  </Panel>
                </div>
                <footer className="ops-notice-footer">
                  <dl className="details-grid">
                    <div>
                      <dt>收件人</dt>
                      <dd>{recipient || "请填写收件人"}</dd>
                    </div>
                    <div>
                      <dt>{w.dueAt ? "商户截止" : "预计截止 · 发送时生效"}</dt>
                      <dd>
                        {noticePreview
                          ? deadlineDate(
                              noticePreview.dueAt,
                              data.merchant.country,
                            )
                          : deadlineDate(w.dueAt, data.merchant.country)}
                      </dd>
                    </div>
                    <div>
                      <dt>状态变化</dt>
                      <dd>
                        {noticePreview?.stateChange || "发送后等待商户补交"}
                      </dd>
                    </div>
                  </dl>
                  <p className="secondary">
                    已发送通知不可撤回。首次发送后开始 7
                    天补交计时，重发不重置截止日期。
                  </p>
                  <div className="action-row">
                    <Btn
                      onClick={() => setNoticeOpen(false)}
                      disabled={busy}
                      title={busy ? "发送处理中，完成后可关闭" : undefined}
                    >
                      取消
                    </Btn>
                    <InlineConfirm
                      title={`确认向 ${recipient} 发送补件通知？发送后不可撤回。`}
                      confirmLabel="确认发送"
                      disabled={
                        disabled ||
                        noticeLoading ||
                        !noticePreview ||
                        !recipient.trim() ||
                        !noticeBody.trim()
                      }
                      busy={busy}
                      onConfirm={() =>
                        execute("notices", {
                          channel: noticeChannel,
                          recipient: recipient.trim(),
                          body: noticeBody.trim(),
                          subject: noticePreview?.subject,
                          sender: noticePreview?.sender,
                        })
                      }
                    >
                      <Btn
                        variant="primary"
                        disabled={
                          disabled ||
                          noticeLoading ||
                          !noticePreview ||
                          !recipient.trim() ||
                          !noticeBody.trim()
                        }
                        title={
                          disabledReason ||
                          (noticeLoading
                            ? "预览生成后可发送"
                            : !noticePreview
                              ? "成功加载通知预览后可发送"
                              : !recipient.trim()
                                ? "填写收件人后可发送"
                                : !noticeBody.trim()
                                  ? "填写通知正文后可发送"
                                  : undefined)
                        }
                      >
                        发送
                      </Btn>
                    </InlineConfirm>
                  </div>
                </footer>
              </div>
            </BottomSheet>
            <Dialog
              isOpen={!!rejectItemId}
              onOpenChange={(open) => {
                if (!open && !busy) setRejectItemId("");
              }}
              purpose="form"
              width={480}
            >
              <DialogHeader
                title="说明不合格原因"
                onOpenChange={() => {
                  if (!busy) setRejectItemId("");
                }}
              />
              <div className="stack ops-dialog-body">
                <p>
                  {
                    items.find((item) => item.id === rejectItemId)?.externalText
                      .zh
                  }
                </p>
                <Selector
                  label="不合格原因"
                  isRequired
                  value={rejectReason || undefined}
                  options={rejectOptions}
                  onChange={setRejectReason}
                  isDisabled={disabled}
                />
              </div>
              <footer className="ops-dialog-footer">
                <Btn disabled={busy} onClick={() => setRejectItemId("")}>
                  取消
                </Btn>
                <Btn
                  variant="danger"
                  disabled={disabled || !rejectReason}
                  busy={busy}
                  onClick={async () => {
                    if (
                      await execute("supplement-check", {
                        itemId: rejectItemId,
                        result: "REJECTED",
                        reason: rejectReason,
                      })
                    )
                      setRejectItemId("");
                  }}
                >
                  确认不合格
                </Btn>
              </footer>
            </Dialog>
            <Dialog
              isOpen={dialog === "contact"}
              onOpenChange={(isOpen) => {
                if (!isOpen && !busy) setDialog("");
              }}
              purpose="form"
              width={560}
            >
              <DialogHeader
                title="记录沟通"
                onOpenChange={() => {
                  if (!busy) setDialog("");
                }}
              />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    contactName.trim() &&
                    reason.trim() &&
                    (contactResult !== "PROMISED" || promisedAt) &&
                    !disabled
                  )
                    void confirmAction();
                }}
              >
                <div className="stack ops-dialog-body">
                  <DateTimeInput
                    label="沟通时间"
                    isRequired
                    hourFormat="24h"
                    value={
                      contactAt.format(
                        "YYYY-MM-DDTHH:mm:ss",
                      ) as ISODateTimeString
                    }
                    onChange={(value) => {
                      if (value) setContactAt(dayjs(value));
                    }}
                  />
                  <TextInput
                    label="联系人"
                    isRequired
                    value={contactName}
                    onChange={setContactName}
                  />
                  <Selector
                    label="沟通方式"
                    value={contactChannel}
                    options={["PHONE", "EMAIL", "IM"].map((value) => ({
                      value,
                      label: channels[value as keyof typeof channels],
                    }))}
                    onChange={(value) =>
                      setContactChannel(value as typeof contactChannel)
                    }
                  />
                  <Selector
                    label="沟通结果"
                    value={contactResult}
                    options={Object.entries(contactResults).map(
                      ([value, label]) => ({ value, label }),
                    )}
                    onChange={(value) =>
                      setContactResult(value as typeof contactResult)
                    }
                  />
                  {contactResult === "PROMISED" && (
                    <DateTimeInput
                      label="承诺提交日期"
                      isRequired
                      hourFormat="24h"
                      value={
                        promisedAt?.format("YYYY-MM-DDTHH:mm:ss") as
                          ISODateTimeString | undefined
                      }
                      onChange={(value) =>
                        setPromisedAt(value ? dayjs(value) : null)
                      }
                    />
                  )}
                  <TextArea
                    label="沟通摘要"
                    isRequired
                    rows={3}
                    maxLength={2000}
                    value={reason}
                    onChange={setReason}
                  />
                </div>
                <footer className="ops-dialog-footer">
                  <Btn onClick={() => setDialog("")}>取消</Btn>
                  <Btn
                    type="submit"
                    variant="primary"
                    busy={busy}
                    disabled={
                      disabled ||
                      !contactName.trim() ||
                      !reason.trim() ||
                      (contactResult === "PROMISED" && !promisedAt)
                    }
                    title={
                      disabledReason ||
                      (!contactName.trim()
                        ? "填写联系人后可保存"
                        : !reason.trim()
                          ? "填写沟通摘要后可保存"
                          : contactResult === "PROMISED" && !promisedAt
                            ? "选择承诺提交日期后可保存"
                            : undefined)
                    }
                  >
                    保存记录
                  </Btn>
                </footer>
              </form>
            </Dialog>
            {descriptions[dialog] && (
              <Confirm
                open
                title={descriptions[dialog].title}
                description={descriptions[dialog].description}
                merchant={descriptions[dialog].merchant}
                sales={descriptions[dialog].sales}
                reversible={descriptions[dialog].reversible}
                confirmLabel={`确认${descriptions[dialog].title}`}
                onClose={() => setDialog("")}
                onConfirm={confirmAction}
                busy={busy}
                confirmDisabled={formInvalid || stale}
                danger={dialog === "withdraw" || dialog === "reject-extension"}
              >
                {formInvalid && (
                  <p role="status" className="secondary">
                    {dialog === "withdraw"
                      ? "填写放弃原因并上传商户书面确认后可提交。"
                      : dialog === "extend"
                        ? pendingExtension
                          ? "现有延期申请审批完成后可再申请。"
                          : "填写原因并选择有效的截止日期后可申请。"
                        : dialog === "complete"
                          ? "全部补件项判定可用后可完成。"
                          : dialog === "return"
                            ? "完成所有齐套检查且存在不合格或未提供项后可退回。"
                            : "填写原因后可确认。"}
                  </p>
                )}
                <div className="stack">
                  {dialog === "return" && (
                    <ul className="ops-record-list">
                      {rejected.map((item) => (
                        <li key={item.id}>
                          {item.externalText.zh} ·{" "}
                          {item.rejectReason || "未提供"}
                        </li>
                      ))}
                    </ul>
                  )}
                  {dialog === "extend" && (
                    <DateTimeInput
                      label="新的商户截止时间"
                      isRequired
                      presentation="adaptive-bottom-sheet"
                      hourFormat="24h"
                      hasSeconds
                      value={
                        dueAt?.format("YYYY-MM-DDTHH:mm:ss") as
                          ISODateTimeString | undefined
                      }
                      onChange={(value) =>
                        setDueAt(value ? dayjs(value) : null)
                      }
                      min={
                        w.dueAt
                          ? (dayjs(w.dueAt).format(
                              "YYYY-MM-DDTHH:mm:ss",
                            ) as ISODateTimeString)
                          : undefined
                      }
                      max={
                        firstExtension && w.dueAt
                          ? (dayjs(w.dueAt)
                              .add(7, "day")
                              .format(
                                "YYYY-MM-DDTHH:mm:ss",
                              ) as ISODateTimeString)
                          : undefined
                      }
                      description={
                        firstExtension
                          ? "首次延期不得超过原截止时间 7 天"
                          : "组长批准后生效"
                      }
                      status={
                        dueAt && !extensionValid
                          ? {
                              type: "error",
                              message: "请选择有效的延期截止时间",
                            }
                          : undefined
                      }
                    />
                  )}
                  {["extend", "withdraw", "reject-extension"].includes(
                    dialog,
                  ) && (
                    <TextArea
                      label="原因"
                      isRequired
                      rows={3}
                      value={reason}
                      onChange={setReason}
                      maxLength={2000}
                    />
                  )}
                  {dialog === "withdraw" && (
                    <Field label="商户书面确认（必填）">
                      <FileUpload value={files} onChange={setFiles} />
                    </Field>
                  )}
                  {dialog === "approve-extension" && currentExtension && (
                    <dl className="details-grid ops-details-single">
                      <div>
                        <dt>申请人</dt>
                        <dd>
                          <PersonName user={currentExtension.requestedBy} />
                        </dd>
                      </div>
                      <div>
                        <dt>申请原因</dt>
                        <dd>{currentExtension.reason}</dd>
                      </div>
                      <div>
                        <dt>申请编号</dt>
                        <dd>
                          <IdText value={currentExtension.id} />
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              </Confirm>
            )}
          </>
        )}
      </LoadState>
    </div>
  );
}
