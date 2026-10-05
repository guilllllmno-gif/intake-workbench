import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog } from "@astryxdesign/core/Dialog";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import zhCN from "@astryxdesign/core/locales/zh-CN.generated.js";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { api } from "../api";
import { sessionFor, USERS } from "../access";
import { useAsync, useDetailView } from "../hooks";
import {
  Badge,
  Btn,
  DetailSection,
  DetailTabs,
  DialogHeader,
  Field,
  FileUpload,
  Panel,
} from "../ui";
import type {
  CommunicationLanguage,
  OrderDetail,
  UploadedFile,
} from "../types";
import { MaterialPreview } from "./SupplementPage";
import "./ops-pages.css";

const merchantSession = sessionFor(
  USERS.find((user) => user.roles.includes("MERCHANT"))!,
);
const actionLabels = {
  UPLOAD: { zh: "上传文件", en: "Upload files" },
  CONFIRM_FIELD: { zh: "确认字段", en: "Confirm information" },
  REVERIFY: { zh: "重新做个人验证", en: "Verify identity again" },
};
const rejectionLabels: Record<string, { zh: string; en: string }> = {
  模糊: { zh: "文件不清晰", en: "The file is not clear enough" },
  不完整: { zh: "资料不完整", en: "The information is incomplete" },
  已过期: { zh: "文件已过期", en: "The document has expired" },
  类型不符: {
    zh: "文件类型不符",
    en: "The document type does not match the request",
  },
  与要求不符: {
    zh: "资料与要求不符",
    en: "The information does not meet the request",
  },
  未提供: {
    zh: "尚未提供资料",
    en: "The requested information was not provided",
  },
};
type Response = {
  value?: string;
  files?: UploadedFile[];
  reverified?: boolean;
};
const merchantViews = ["requests", "records"] as const;

export default function MerchantPage() {
  const params = useParams<{ token?: string; id?: string }>();
  const token = params.token || params.id || "";
  return <MerchantPortal key={token} token={token} />;
}

function MerchantPortal({ token }: { token: string }) {
  const resource = useAsync<OrderDetail | null>(
    () =>
      token ? api.getOrder(token, merchantSession) : Promise.resolve(null),
    [token],
  );
  const [local, setLocal] = useState<OrderDetail | null>(null);
  const [chosenLanguage, setChosenLanguage] = useState<CommunicationLanguage>();
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [verifyId, setVerifyId] = useState("");
  const [verifyName, setVerifyName] = useState("");
  const [verifyFiles, setVerifyFiles] = useState<UploadedFile[]>([]);
  const [verifyConsent, setVerifyConsent] = useState(false);
  const data = local || resource.data;
  const language =
    chosenLanguage || data?.application.communicationLanguage || "en";
  const text = (zh: string, en: string) => (language === "zh" ? zh : en);
  const current = useRef(data);
  current.current = data;
  const acting = useRef(false);
  const w = data?.workOrder;
  const items = w?.items || [];
  const actionItems = items.filter(
    (item) => !(item.checked && item.status === "PROVIDED"),
  );
  const preserved = items.filter(
    (item) => item.checked && item.status === "PROVIDED",
  );
  const expired = !!w?.dueAt && new Date(w.dueAt).getTime() <= now;
  const submitted = w?.status === "TO_CHECK" || w?.status === "DONE";
  const closed =
    w?.status === "WITHDRAWN" || w?.status === "CLOSED_NO_RESPONSE";
  const [view, setView] = useDetailView(
    submitted || closed ? "records" : "requests",
    merchantViews,
  );
  const records = submitted
    ? items
    : items.filter(
        (item) =>
          (item.checked && item.status === "PROVIDED") ||
          !!item.files?.length ||
          !!item.response,
      );
  const editable =
    w?.status === "WAITING_MERCHANT" && !expired && !stale && !busy;
  const disabledReason = busy
    ? text("正在提交，请稍候", "Submitting, please wait")
    : stale
      ? text(
          "补件要求已更新，请刷新后继续",
          "The request has changed. Refresh to continue",
        )
      : expired
        ? text(
            "提交期限已过，请联系支持团队申请延期",
            "The deadline has passed. Contact support to request an extension",
          )
        : w?.status !== "WAITING_MERCHANT"
          ? text(
              "请等待正式补交通知",
              "Please wait for the official request before submitting",
            )
          : "";
  const complete = actionItems.filter((item) => {
    const response = responses[item.id];
    return item.actionType === "UPLOAD"
      ? !!response?.files?.length
      : item.actionType === "REVERIFY"
        ? !!response?.reverified
        : !!response?.value?.trim();
  }).length;
  const ready =
    editable && actionItems.length > 0 && complete === actionItems.length;
  const verifyItem = actionItems.find((item) => item.id === verifyId);
  const verifyPerson = data?.people?.find(
    (person) => person.id === verifyItem?.targetPersonId,
  );
  const failureStatus = (resource.error as (Error & { status?: number }) | null)
    ?.status;
  const denied = failureStatus === 403 || failureStatus === 404;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setLocal(null);
    setResponses({});
    setStale(false);
    setSubmitError(null);
    setConfirmOpen(false);
    setVerifyId("");
  }, [resource.data]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const changed = () => {
      if (acting.current) return;
      void api
        .getOrder(token, merchantSession)
        .then((latest) => {
          if (
            active &&
            current.current &&
            latest.workOrder.version !== current.current.workOrder.version
          )
            setStale(true);
        })
        .catch(() => {
          if (active) setStale(true);
        });
    };
    window.addEventListener("workbench:updated", changed);
    window.addEventListener("storage", changed);
    return () => {
      active = false;
      window.removeEventListener("workbench:updated", changed);
      window.removeEventListener("storage", changed);
    };
  }, [token]);
  function update(id: string, response: Response) {
    setResponses((previous) => ({
      ...previous,
      [id]: { ...previous[id], ...response },
    }));
  }
  async function submit() {
    if (!w || !ready || acting.current) return;
    acting.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await api.mutate(
        token,
        "merchant-submit",
        {
          responses: Object.fromEntries(
            actionItems.map((item) => [item.id, responses[item.id]]),
          ),
        },
        w.version,
        merchantSession,
      );
      setLocal(result);
      setConfirmOpen(false);
    } catch (error) {
      const status = (error as Error & { status?: number }).status || 500;
      setSubmitError(status);
      if (status === 409) {
        setStale(true);
        setConfirmOpen(false);
      }
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  const secondsLeft = Math.max(
    0,
    Math.floor(((w?.dueAt ? new Date(w.dueAt).getTime() : now) - now) / 1000),
  );
  const submissionFailure =
    submitError === 403 || submitError === 404
      ? text(
          "链接无法用于提交，请从最新通知打开安全链接或联系支持团队",
          "This link cannot be used to submit. Open the secure link in your latest notification or contact support",
        )
      : submitError === 409
        ? text(
            "补件要求已更新，请刷新后继续",
            "The request has changed. Refresh to continue",
          )
        : text(
            "提交未完成，请检查材料及提交期限后重试；如仍有问题，请联系支持团队",
            "Submission was not completed. Check your documents and deadline, then retry. Contact support if the issue persists",
          );
  return (
    <InternationalizationProvider
      locale={language === "zh" ? "zh-CN" : "en-US"}
      messages={{ "zh-CN": zhCN }}
    >
      <main
        className="merchant-portal ops-pages detail-portal detail-page"
        lang={language}
      >
        <header className="merchant-brand-header">
          <strong className="merchant-brand">FuturePay</strong>
          <label className="merchant-language">
            <span>{text("语言", "Language")}</span>
            <select
              value={language}
              onChange={(event) =>
                setChosenLanguage(event.target.value as CommunicationLanguage)
              }
            >
              <option value="en">English</option>
              <option value="zh">简体中文</option>
            </select>
          </label>
        </header>
        {!token ? (
          <Panel
            title={text("请打开安全补件链接", "Open your secure request link")}
          >
            <p>
              {text(
                "请使用 FuturePay 发送给您的邮件、短信或门户通知中的安全链接查看及提交资料。如未收到通知，请联系支持团队。",
                "Use the secure link in your FuturePay email, text message, or portal notification to view the request and submit information. Contact support if you have not received a notification.",
              )}
            </p>
          </Panel>
        ) : resource.loading ? (
          <p role="status">{text("正在加载…", "Loading…")}</p>
        ) : resource.error ? (
          <Banner
            status="error"
            title={
              denied
                ? text("链接不可用", "Link unavailable")
                : text("暂时无法加载", "Unable to load this request")
            }
            description={
              denied
                ? text(
                    "请从最新通知打开安全链接，或联系支持团队获取帮助",
                    "Open the secure link from your latest notification, or contact support for help",
                  )
                : text(
                    "请检查网络连接后重试",
                    "Check your connection and try again",
                  )
            }
            endContent={
              !denied ? (
                <Btn onClick={resource.reload}>{text("重试", "Retry")}</Btn>
              ) : undefined
            }
          />
        ) : (
          data &&
          w && (
            <>
              <Panel className="detail-hero">
                <div className="detail-hero-top">
                  <div className="detail-identity">
                    <div>
                      <p className="detail-kicker">
                        {text("安全资料提交", "Secure information request")}
                      </p>
                      <div className="detail-name-row">
                        <h1>{data.merchant.legalName}</h1>
                        <Badge
                          tone={
                            submitted
                              ? "success"
                              : expired || closed
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {submitted
                            ? text("已提交", "Submitted")
                            : closed
                              ? text("已关闭", "Closed")
                              : expired
                                ? text("已过截止时间", "Deadline passed")
                                : text("待补充资料", "Information requested")}
                        </Badge>
                      </div>
                      <p className="secondary">
                        {text("补充资料", "Additional information")}
                      </p>
                    </div>
                  </div>
                </div>
                <dl className="detail-meta-grid">
                  <div>
                    <dt>{text("申请号", "Application reference")}</dt>
                    <dd>{data.application.id}</dd>
                  </div>
                  <div>
                    <dt>{text("补交截止", "Submission deadline")}</dt>
                    <dd>
                      {w.dueAt
                        ? new Intl.DateTimeFormat(
                            language === "zh" ? "zh-CN" : "en-GB",
                            {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZoneName: undefined,
                            },
                          ).format(new Date(w.dueAt))
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{text("请求资料", "Requested items")}</dt>
                    <dd>{items.length}</dd>
                  </div>
                  <div>
                    <dt>{text("已接收资料", "Accepted items")}</dt>
                    <dd>
                      {preserved.length} / {items.length}
                    </dd>
                  </div>
                </dl>
              </Panel>
              {stale && (
                <Banner
                  status="warning"
                  title={text(
                    "补件要求已更新，请刷新后继续",
                    "The request has changed. Refresh to continue",
                  )}
                  endContent={
                    <Btn onClick={resource.reload}>
                      {text("刷新", "Refresh")}
                    </Btn>
                  }
                />
              )}
              {submitError && (
                <Banner status="error" title={submissionFailure} />
              )}
              <div className="detail-layout">
                <div className="detail-main">
                  <DetailTabs
                    id="merchant-detail"
                    value={view}
                    onChange={setView}
                    label={text("资料导航", "Information sections")}
                    items={[
                      {
                        value: "requests",
                        label: text("待补充资料", "Requested information"),
                        count: submitted || closed ? 0 : actionItems.length,
                      },
                      {
                        value: "records",
                        label: text("已提供资料", "Provided information"),
                        count: records.length,
                      },
                    ]}
                  />
                  <DetailSection
                    id="merchant-detail"
                    value="requests"
                    active={view}
                  >
                    {submitted ? (
                      <Banner
                        status="success"
                        title={text("已提交，审核中", "Submitted for review")}
                        description={text(
                          "资料已收到，请留意后续通知",
                          "We have received your information. Please look out for further notifications",
                        )}
                      />
                    ) : closed ? (
                      <Banner
                        status="info"
                        title={
                          w.status === "WITHDRAWN"
                            ? text("申请已撤回", "Application withdrawn")
                            : text(
                                "补交期限已过，资料请求已关闭",
                                "The deadline has passed and this request is closed",
                              )
                        }
                      />
                    ) : (
                      <>
                        {expired && (
                          <Banner
                            status="warning"
                            title={text(
                              "提交期限已过，请联系支持团队确认延期后再提交",
                              "The deadline has passed. Contact support to confirm an extension before submitting",
                            )}
                          />
                        )}
                        {w.status === "TO_SEND" && (
                          <Banner
                            status="info"
                            title={text(
                              "请等待正式补交通知",
                              "Please wait for the official request notification",
                            )}
                          />
                        )}
                        <Panel
                          title={text(
                            "完成本次资料请求",
                            "Complete this request",
                          )}
                        >
                          <p className="secondary">
                            {actionItems.length
                              ? text(
                                  "请完成以下各项后统一提交。切换资料页面不会清除本次填写的内容。",
                                  "Complete each item below, then submit them together. Switching sections keeps your current entries.",
                                )
                              : text(
                                  "暂无需要补充的资料，请留意后续通知。",
                                  "There is nothing to provide right now. Please look out for further notifications.",
                                )}
                          </p>
                          <div className="stack merchant-items">
                            {actionItems.map((item) => (
                              <section key={item.id} className="merchant-item">
                                <div className="spread">
                                  <h2 className="section-title">
                                    {item.externalText[language]}
                                  </h2>
                                  <Badge>
                                    {actionLabels[item.actionType][language]}
                                  </Badge>
                                </div>
                                {item.rejectReason && (
                                  <Banner
                                    status="warning"
                                    title={text(
                                      "请重新补交",
                                      "Please resubmit",
                                    )}
                                    description={
                                      rejectionLabels[item.rejectReason]?.[
                                        language
                                      ] ||
                                      text(
                                        "请按本项要求重新提供资料",
                                        "Please provide updated information matching this request",
                                      )
                                    }
                                  />
                                )}
                                {item.actionType === "UPLOAD" && (
                                  <Field
                                    label={text(
                                      "补交文件（必填）",
                                      "Requested files (required)",
                                    )}
                                  >
                                    <FileUpload
                                      value={responses[item.id]?.files || []}
                                      onChange={(files) =>
                                        update(item.id, { files })
                                      }
                                      disabled={!editable}
                                      language={language}
                                      session={merchantSession}
                                    />
                                  </Field>
                                )}
                                {item.actionType === "CONFIRM_FIELD" && (
                                  <TextArea
                                    label={text(
                                      item.field || "确认或修改内容",
                                      "Confirm or update the information",
                                    )}
                                    isRequired
                                    rows={3}
                                    value={responses[item.id]?.value ?? ""}
                                    placeholder={text(
                                      "请输入确认后的内容",
                                      "Enter the confirmed information",
                                    )}
                                    onChange={(value) =>
                                      update(item.id, { value })
                                    }
                                    isDisabled={!editable}
                                  />
                                )}
                                {item.actionType === "REVERIFY" && (
                                  <div className="stack">
                                    <span>
                                      {data.people?.find(
                                        (person) =>
                                          person.id === item.targetPersonId,
                                      )?.name ||
                                        text(
                                          "指定关联人",
                                          "Requested person",
                                        )}{" "}
                                      ·{" "}
                                      {text(
                                        "个人验证",
                                        "Identity verification",
                                      )}
                                    </span>
                                    {responses[item.id]?.reverified ? (
                                      <Badge tone="success">
                                        {text(
                                          "已确认验证资料",
                                          "Verification information confirmed",
                                        )}
                                      </Badge>
                                    ) : (
                                      <Btn
                                        disabled={!editable}
                                        title={disabledReason || undefined}
                                        onClick={() => {
                                          setVerifyId(item.id);
                                          setVerifyName("");
                                          setVerifyFiles([]);
                                          setVerifyConsent(false);
                                        }}
                                      >
                                        {text(
                                          "重新做个人验证",
                                          "Verify identity again",
                                        )}
                                      </Btn>
                                    )}
                                  </div>
                                )}
                              </section>
                            ))}
                          </div>
                        </Panel>
                      </>
                    )}
                  </DetailSection>
                  <DetailSection
                    id="merchant-detail"
                    value="records"
                    active={view}
                  >
                    {submitted && (
                      <Banner
                        status="success"
                        title={text("已提交，审核中", "Submitted for review")}
                        description={text(
                          "资料已收到，请留意后续通知。您可以在下方查看已提交的内容。",
                          "We have received your information. You can review it below. Please look out for further notifications.",
                        )}
                      />
                    )}
                    <Panel title={text("已提供资料", "Provided information")}>
                      <p className="secondary">
                        {submitted
                          ? text(
                              "已提交的资料仅供查看，暂时不能修改。",
                              "Submitted information is read-only and cannot be edited.",
                            )
                          : text(
                              "已接收的资料无需再次提交。如某项需要更新，请在「待补充资料」中提供新内容。",
                              "Accepted information does not need to be submitted again. If an update is requested, provide it under Requested information.",
                            )}
                      </p>
                      {records.length ? (
                        records.map((item) => (
                          <section className="merchant-preserved" key={item.id}>
                            <div className="row">
                              <Badge
                                tone={
                                  item.checked && item.status === "PROVIDED"
                                    ? "success"
                                    : "neutral"
                                }
                              >
                                {item.checked && item.status === "PROVIDED"
                                  ? text("已接收", "Accepted")
                                  : submitted
                                    ? text("已提交", "Submitted")
                                    : text("此前提供", "Previously provided")}
                              </Badge>
                              <h3 className="section-title">
                                {item.externalText[language]}
                              </h3>
                            </div>
                            <MaterialPreview
                              files={item.files}
                              value={item.response}
                              language={language}
                              merchant
                            />
                          </section>
                        ))
                      ) : (
                        <p>
                          {text(
                            "暂无已提供的资料。完成本次提交后，可在此查看。",
                            "No information has been provided yet. Your submission will appear here once sent.",
                          )}
                        </p>
                      )}
                    </Panel>
                  </DetailSection>
                </div>
                <aside className="detail-aside">
                  <Panel
                    className="detail-context"
                    title={text("本次提交", "Your submission")}
                  >
                    <div className="stack">
                      {submitted ? (
                        <p>
                          {text(
                            "资料已成功提交，无需重复操作。请留意 FuturePay 的后续通知。",
                            "Your information has been submitted. No further action is needed right now. Please look out for updates from FuturePay.",
                          )}
                        </p>
                      ) : closed ? (
                        <p>
                          {w.status === "WITHDRAWN"
                            ? text(
                                "申请已撤回，无法继续提交。如需帮助，请联系支持团队。",
                                "The application has been withdrawn and no further submission is available. Contact support if you need help.",
                              )
                            : text(
                                "资料请求已关闭。如需帮助，请联系支持团队。",
                                "This information request is closed. Contact support if you need help.",
                              )}
                        </p>
                      ) : (
                        <>
                          <p role="status">
                            {complete === actionItems.length &&
                            actionItems.length > 0
                              ? text(
                                  "资料已准备齐全，请确认并提交。",
                                  "Your information is ready. Review and submit when you are ready.",
                                )
                              : text(
                                  `已完成 ${complete} / ${actionItems.length} 项待补充资料`,
                                  `${complete} of ${actionItems.length} requested items complete`,
                                )}
                          </p>
                          <ProgressBar
                            label={text(
                              "资料完成进度",
                              "Information completion",
                            )}
                            variant="neutral"
                            value={
                              actionItems.length
                                ? (complete / actionItems.length) * 100
                                : 100
                            }
                          />
                          {disabledReason && (
                            <p className="secondary">{disabledReason}</p>
                          )}
                          {w.status === "WAITING_MERCHANT" &&
                            w.dueAt &&
                            !expired && (
                              <div className="merchant-countdown">
                                <span className="secondary">
                                  {text("剩余提交时间", "Time remaining")}
                                </span>
                                <strong>
                                  {Math.floor(secondsLeft / 86400)}{" "}
                                  {text("天", "days")}{" "}
                                  {Math.floor((secondsLeft % 86400) / 3600)}{" "}
                                  {text("时", "hours")}{" "}
                                  {Math.floor((secondsLeft % 3600) / 60)}{" "}
                                  {text("分", "minutes")}
                                </strong>
                              </div>
                            )}
                          <div className="detail-context-actions">
                            {view !== "requests" && (
                              <Btn onClick={() => setView("requests")}>
                                {text("继续补充资料", "Continue request")}
                              </Btn>
                            )}
                            <Btn
                              variant="primary"
                              busy={busy}
                              disabled={!ready}
                              title={
                                disabledReason ||
                                (!ready
                                  ? text(
                                      "请补齐所有待补充资料后提交",
                                      "Complete all requested items before submitting",
                                    )
                                  : undefined)
                              }
                              onClick={() => setConfirmOpen(true)}
                            >
                              {text("提交资料", "Submit information")}
                            </Btn>
                          </div>
                        </>
                      )}
                      <p className="secondary">
                        {text(
                          "此安全链接仅供您使用，请勿转发。",
                          "This secure link is for your use only. Please do not forward it.",
                        )}
                      </p>
                    </div>
                  </Panel>
                </aside>
              </div>
              <Dialog
                isOpen={!!verifyId}
                onOpenChange={(open) => {
                  if (!open) setVerifyId("");
                }}
                purpose="form"
                width={560}
              >
                <DialogHeader
                  title={text("重新做个人验证", "Verify identity again")}
                  onOpenChange={() => setVerifyId("")}
                />
                <div className="stack ops-dialog-body">
                  <TextInput
                    label={text("本人完整姓名", "Full legal name")}
                    isRequired
                    value={verifyName}
                    onChange={setVerifyName}
                    description={
                      verifyPerson
                        ? text(
                            `应与 ${verifyPerson.name} 的有效证件一致`,
                            `Must match the valid identity document for ${verifyPerson.name}`,
                          )
                        : undefined
                    }
                  />
                  <Field
                    label={text(
                      "有效身份证明及验证材料（必填）",
                      "Valid identity and verification documents (required)",
                    )}
                  >
                    <FileUpload
                      value={verifyFiles}
                      onChange={setVerifyFiles}
                      accept="image/*,.pdf"
                      language={language}
                      session={merchantSession}
                    />
                  </Field>
                  <CheckboxInput
                    label={text(
                      "本人确认所提交身份与材料真实、有效，并授权进行个人验证",
                      "I confirm that the identity and documents provided are genuine and valid, and authorize identity verification",
                    )}
                    value={verifyConsent}
                    onChange={setVerifyConsent}
                  />
                </div>
                <footer className="ops-dialog-footer">
                  <Btn onClick={() => setVerifyId("")}>
                    {text("取消", "Cancel")}
                  </Btn>
                  <Btn
                    variant="primary"
                    disabled={
                      !verifyName.trim() ||
                      (!!verifyPerson &&
                        verifyName.trim() !== verifyPerson.name) ||
                      !verifyFiles.length ||
                      !verifyConsent ||
                      !editable
                    }
                    title={
                      disabledReason ||
                      text(
                        "填写匹配证件的姓名，上传材料并授权验证后可确认",
                        "Enter the name matching the document, upload files and authorize verification to confirm",
                      )
                    }
                    onClick={() => {
                      update(verifyId, {
                        value: verifyName.trim(),
                        files: verifyFiles,
                        reverified: true,
                      });
                      setVerifyId("");
                    }}
                  >
                    {text("确认验证资料", "Confirm verification information")}
                  </Btn>
                </footer>
              </Dialog>
              <Dialog
                isOpen={confirmOpen}
                onOpenChange={(open) => {
                  if (!busy) setConfirmOpen(open);
                }}
                purpose="form"
                width={520}
              >
                <DialogHeader
                  title={text("提交补充资料", "Submit additional information")}
                  onOpenChange={() => {
                    if (!busy) setConfirmOpen(false);
                  }}
                />
                <div className="stack ops-dialog-body">
                  <p>
                    {text(
                      `提交 ${actionItems.length} 项补充资料供审核。提交后不能编辑；如需补充，我们会另行通知。`,
                      `Submit ${actionItems.length} items for review. Submitted information cannot be edited. We will notify you if anything else is needed.`,
                    )}
                  </p>
                  {submitError && (
                    <Banner status="error" title={submissionFailure} />
                  )}
                </div>
                <footer className="ops-dialog-footer">
                  <Btn disabled={busy} onClick={() => setConfirmOpen(false)}>
                    {text("取消", "Cancel")}
                  </Btn>
                  <Btn
                    variant="primary"
                    busy={busy}
                    disabled={!ready}
                    onClick={() => void submit()}
                  >
                    {text("确认提交", "Confirm submission")}
                  </Btn>
                </footer>
              </Dialog>
            </>
          )
        )}
      </main>
    </InternationalizationProvider>
  );
}
