import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { api } from "../api";
import { useAsync, useSession } from "../hooks";
import {
  Badge,
  Btn,
  Confirm,
  Field,
  FileUpload,
  IdText,
  LoadState,
  Panel,
} from "../ui";
import { deadlineDate } from "../format";
import type { OrderDetail, UploadedFile } from "../types";
import { MaterialPreview, supplementActionLabels } from "./SupplementPage";
import "./ops-pages.css";

type Response = {
  value?: string;
  files?: UploadedFile[];
  reverified?: boolean;
};
export default function MerchantPage() {
  const params = useParams<{ token?: string; id?: string }>();
  const token = params.token || params.id || "";
  const { session } = useSession();
  const resource = useAsync(
    () => api.getOrder(token, session),
    [token, session.userId, session.role],
  );
  const [local, setLocal] = useState<OrderDetail | null>(null);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [verifyId, setVerifyId] = useState("");
  const [verifyName, setVerifyName] = useState("");
  const [verifyFiles, setVerifyFiles] = useState<UploadedFile[]>([]);
  const [verifyConsent, setVerifyConsent] = useState(false);
  const data = local || resource.data;
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
  const editable =
    w?.status === "WAITING_MERCHANT" &&
    session.role === "MERCHANT" &&
    !expired &&
    !stale &&
    !busy;
  const disabledReason = busy
    ? "正在提交，完成后可继续"
    : stale
      ? "补件要求已更新，刷新后可操作"
      : session.role !== "MERCHANT"
        ? "请使用该商户账号打开补件链接后操作"
        : expired
          ? "已超过补交截止，请联系运营批准延期后提交"
          : w?.status !== "WAITING_MERCHANT"
            ? "收到补件通知且处于等待补交状态时可操作"
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
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setLocal(null);
    setResponses({});
    setStale(false);
    setSubmitError("");
    setConfirmOpen(false);
  }, [token, session.userId, resource.data]);
  useEffect(() => {
    let active = true;
    const changed = () => {
      if (acting.current) return;
      void api
        .getOrder(token, session)
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
  }, [token, session]);
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
    setSubmitError("");
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
        session,
      );
      setLocal(result);
      setConfirmOpen(false);
    } catch (error) {
      const failure = error as Error & { status?: number };
      setSubmitError(failure.message || "提交失败，请重试");
      if (failure.status === 409) setStale(true);
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  const secondsLeft = Math.max(
    0,
    Math.floor(((w?.dueAt ? new Date(w.dueAt).getTime() : now) - now) / 1000),
  );
  return (
    <main className="merchant-portal ops-pages">
      <LoadState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {data && w && (
          <>
            <Panel className="merchant-heading">
              <div className="spread">
                <h1>{data.merchant.legalName}</h1>
                <Badge>
                  {submitted ? "审核中" : data.application.externalStatus}
                </Badge>
              </div>
              <dl className="details-grid">
                <div>
                  <dt>申请号</dt>
                  <dd>
                    <IdText value={data.application.id} />
                  </dd>
                </div>
                <div>
                  <dt>补交截止</dt>
                  <dd>{deadlineDate(w.dueAt, data.merchant.country)}</dd>
                </div>
              </dl>
              {w.status === "WAITING_MERCHANT" && w.dueAt && (
                <div className="merchant-countdown">
                  <span className="secondary">剩余提交时间</span>
                  <strong>
                    {Math.floor(secondsLeft / 86400)} 天{" "}
                    {Math.floor((secondsLeft % 86400) / 3600)} 时{" "}
                    {Math.floor((secondsLeft % 3600) / 60)} 分{" "}
                    {secondsLeft % 60} 秒
                  </strong>
                </div>
              )}
            </Panel>
            {stale && (
              <Banner
                status="warning"
                title="补件要求已更新，请刷新后继续"
                endContent={<Btn onClick={resource.reload}>刷新</Btn>}
              />
            )}
            {submitError && <Banner status="error" title={submitError} />}
            {submitted ? (
              <>
                <Banner
                  status="success"
                  title="已提交，审核中"
                  description="提交的材料已送达，请留意后续通知。"
                />
                {items.map((item) => (
                  <Panel key={item.id} title={item.externalText}>
                    <MaterialPreview files={item.files} value={item.response} />
                  </Panel>
                ))}
              </>
            ) : ["WITHDRAWN", "CLOSED_NO_RESPONSE"].includes(w.status) ? (
              <Banner
                status="info"
                title={
                  w.status === "WITHDRAWN" ? "申请已撤回" : "补交已超时关闭"
                }
              />
            ) : (
              <>
                {expired && (
                  <Banner
                    status="warning"
                    title="已到补交截止时间，请联系运营确认延期后再提交"
                  />
                )}
                {w.status === "TO_SEND" && (
                  <Banner
                    status="info"
                    title="补件要求尚未发出，请等待正式通知"
                  />
                )}
                <Panel
                  title={`待补充资料 · ${actionItems.length} 项`}
                  actions={
                    <span>
                      {complete}/{actionItems.length} 已完成
                    </span>
                  }
                >
                  <ProgressBar
                    label="资料完成进度"
                    isLabelHidden
                    variant="neutral"
                    value={
                      actionItems.length
                        ? (complete / actionItems.length) * 100
                        : 100
                    }
                  />
                  <div className="stack merchant-items">
                    {actionItems.map((item) => (
                      <section key={item.id} className="merchant-item">
                        <div className="spread">
                          <h2 className="section-title">{item.externalText}</h2>
                          <Badge>
                            {supplementActionLabels[item.actionType]}
                          </Badge>
                        </div>
                        {item.rejectReason && (
                          <Banner
                            status="warning"
                            title={`请重新补交：${item.rejectReason}`}
                          />
                        )}
                        {item.actionType === "UPLOAD" && (
                          <Field label="补交文件（必填）">
                            <FileUpload
                              value={responses[item.id]?.files || []}
                              onChange={(files) => update(item.id, { files })}
                              disabled={!editable}
                            />
                          </Field>
                        )}
                        {item.actionType === "CONFIRM_FIELD" && (
                          <TextArea
                            label={item.field || "确认或修改内容"}
                            isRequired
                            rows={3}
                            value={responses[item.id]?.value ?? ""}
                            placeholder={item.response || "请输入确认后的内容"}
                            onChange={(value) => update(item.id, { value })}
                            isDisabled={!editable}
                          />
                        )}
                        {item.actionType === "REVERIFY" && (
                          <div className="stack">
                            <span>
                              {data.people?.find(
                                (person) => person.id === item.targetPersonId,
                              )?.name || "指定关联人"}{" "}
                              · 个人验证
                            </span>
                            {responses[item.id]?.reverified ? (
                              <Badge tone="success">已完成验证资料确认</Badge>
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
                                重新做个人验证
                              </Btn>
                            )}
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </Panel>
                {preserved.length > 0 && (
                  <Panel title="已接收资料">
                    <p className="secondary">
                      以下资料已判定可用，无需再次提交。
                    </p>
                    {preserved.map((item) => (
                      <div className="row merchant-preserved" key={item.id}>
                        <Badge tone="success">可用</Badge>
                        <span>{item.externalText}</span>
                      </div>
                    ))}
                  </Panel>
                )}
                <footer className="merchant-submit">
                  <span className="secondary">
                    {complete === actionItems.length
                      ? "全部待补充项已完成"
                      : `还需完成 ${actionItems.length - complete} 项`}
                  </span>
                  <Btn
                    variant="primary"
                    busy={busy}
                    disabled={!ready}
                    title={
                      disabledReason ||
                      (!ready
                        ? `补齐剩余 ${actionItems.length - complete} 项资料后可提交`
                        : undefined)
                    }
                    onClick={() => setConfirmOpen(true)}
                  >
                    提交
                  </Btn>
                </footer>
              </>
            )}
            <Dialog
              isOpen={!!verifyId}
              onOpenChange={(open) => {
                if (!open) setVerifyId("");
              }}
              purpose="form"
              width={560}
            >
              <DialogHeader
                title="重新做个人验证"
                onOpenChange={() => setVerifyId("")}
              />
              <div className="stack ops-dialog-body">
                <TextInput
                  label="本人完整姓名"
                  isRequired
                  value={verifyName}
                  onChange={setVerifyName}
                  description={
                    verifyPerson
                      ? `应与 ${verifyPerson.name} 的有效证件一致`
                      : undefined
                  }
                />
                <Field label="当前有效的身份证明及验证材料（必填）">
                  <FileUpload
                    value={verifyFiles}
                    onChange={setVerifyFiles}
                    accept="image/*,.pdf"
                  />
                </Field>
                <CheckboxInput
                  label="本人确认所提交身份与材料真实、有效，并授权进行个人验证。"
                  value={verifyConsent}
                  onChange={setVerifyConsent}
                />
              </div>
              <footer className="ops-dialog-footer">
                <Btn onClick={() => setVerifyId("")}>取消</Btn>
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
                    (!verifyName.trim()
                      ? "填写本人完整姓名后可确认"
                      : verifyPerson && verifyName.trim() !== verifyPerson.name
                        ? "姓名与有效证件一致后可确认"
                        : !verifyFiles.length
                          ? "上传有效身份证明后可确认"
                          : !verifyConsent
                            ? "确认材料真实并授权验证后可确认"
                            : undefined)
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
                  确认验证资料
                </Btn>
              </footer>
            </Dialog>
            <Confirm
              open={confirmOpen}
              title="提交补充资料"
              description={`提交 ${actionItems.length} 项补充资料，进入待齐套检查；运营确认全部可用后才会进入后续审核。`}
              merchant="已提交，审核中"
              sales="审核中"
              reversible="已提交内容不可编辑；如需补正，将收到新的补交通知。"
              confirmLabel="确认提交"
              onClose={() => setConfirmOpen(false)}
              onConfirm={submit}
              busy={busy}
              confirmDisabled={!ready}
            />
          </>
        )}
      </LoadState>
    </main>
  );
}
