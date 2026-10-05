import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Field as AstryxField } from "@astryxdesign/core/Field";
import { FileInput } from "@astryxdesign/core/FileInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  Check,
  Copy,
  Download,
  Eye,
  Inbox,
  LockKeyhole,
  RotateCw,
  Trash2,
} from "lucide-react";
import "./ui.css";
import { Link } from "react-router-dom";
import { getQueueContext, useSession } from "./hooks";
import { CHECK_LABELS, CHECK_OPTIONS } from "./catalog";
import {
  countryName,
  dateTime,
  deadlineDate,
  duration,
  mccName,
  money,
  RECEIPT_LABELS,
  STAGE_LABELS,
  STATUS_LABELS,
  statusLabel,
  TYPE_LABELS,
} from "./format";
import type {
  AuditLog,
  OrderDetail,
  Status,
  UploadedFile,
  UserRef,
  WorkOrder,
} from "./types";

function accessibleText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(accessibleText).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return accessibleText(node.props.children);
  return "";
}

export function Btn({
  children,
  onClick,
  variant = "secondary",
  disabled,
  busy,
  title,
  icon,
  type = "button",
  className = "",
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  icon?: ReactNode;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <Button
      label={accessibleText(children) || title || "操作"}
      variant={variant === "danger" ? "destructive" : variant}
      isDisabled={disabled}
      isLoading={busy}
      onClick={onClick}
      type={type}
      icon={icon}
      tooltip={title}
      className={className}
    >
      {children}
    </Button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <AstryxBadge
      label={children}
      variant={tone === "danger" ? "error" : tone}
    />
  );
}
export function Panel({
  title,
  subtitle,
  children,
  className = "",
  actions,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <Card padding={0} className={`panel ui-panel ${className}`}>
      {(title || subtitle || actions) && (
        <div className="ui-panel-heading">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="secondary small">{subtitle}</div>}
          </div>
          {actions && <div className="action-row">{actions}</div>}
        </div>
      )}
      <div className="ui-panel-content">{children}</div>
    </Card>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const richLabel = typeof label !== "string";
  return (
    <div className="ui-field">
      {richLabel && (
        <label htmlFor={id} className="ui-rich-label">
          {label}
        </label>
      )}
      <AstryxField
        label={accessibleText(label)}
        inputID={id}
        isLabelHidden={richLabel}
      >
        {isValidElement(children)
          ? cloneElement(
              children as ReactElement<{
                id?: string;
                "aria-describedby"?: string;
              }>,
              {
                id,
                ...(hint ? { "aria-describedby": hintId } : {}),
              },
            )
          : children}
      </AstryxField>
      {hint && (
        <div id={hintId} className="ui-field-hint">
          {hint}
        </div>
      )}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  hiddenLabel = false,
  disabled,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: { value: string; label: ReactNode; disabled?: boolean }[];
  hiddenLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="ui-select">
      <Selector
        label={label}
        isLabelHidden={hiddenLabel}
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          ...option,
          label: accessibleText(option.label),
        }))}
        renderOption={(option) =>
          options.find((item) => item.value === option.value)?.label ??
          option.label
        }
        renderValue={(option) =>
          options.find((item) => item.value === option.value)?.label ??
          option.label
        }
        isDisabled={disabled}
        width="100%"
        placeholder="请选择"
      />
    </div>
  );
}
export function Empty({
  title = "暂无待处理工单",
  description,
}: {
  title?: string;
  description?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <EmptyState
        title={title}
        description={typeof description === "string" ? description : undefined}
        icon={<Inbox size={24} />}
        isCompact
      />
      {description && typeof description !== "string" && (
        <div className="ui-empty-description">{description}</div>
      )}
    </div>
  );
}
export function LoadState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="load-state" role="status" aria-label="加载中">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton
            key={index}
            height={20}
            width={index === 0 ? "36%" : "100%"}
            index={index}
          />
        ))}
      </div>
    );
  if (error)
    return (
      <Banner
        className="load-error"
        status="error"
        icon={error.includes("权限") ? <LockKeyhole size={18} /> : undefined}
        title={error.includes("权限") ? "无访问权限" : "加载失败"}
        description={error}
        endContent={
          <Button label="重试" icon={<RotateCw size={16} />} onClick={retry} />
        }
      />
    );
  return <>{children}</>;
}
export function InlineConfirm({
  children,
  title,
  onConfirm,
  confirmLabel = "确认",
  disabled = false,
  busy = false,
  content,
  confirmDisabled = false,
}: {
  children: ReactNode;
  title: string;
  onConfirm: () => void | Promise<unknown>;
  confirmLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  content?: ReactNode;
  confirmDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Popover
      label={title}
      isOpen={open}
      isEnabled={!disabled && !busy && !pending}
      onOpenChange={(value) => {
        if (pending || busy) return;
        setError("");
        setOpen(value);
      }}
      width={300}
      content={
        <div className="inline-confirm">
          <strong>{title}</strong>
          {content}
          {error && <span role="alert">{error}</span>}
          <div className="action-row">
            <Button
              label="取消"
              size="sm"
              isDisabled={pending || busy}
              onClick={() => setOpen(false)}
            />
            <Button
              label={confirmLabel}
              size="sm"
              variant="primary"
              isLoading={pending || busy}
              isDisabled={disabled || confirmDisabled}
              onClick={async () => {
                setPending(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "操作失败，请重试",
                  );
                } finally {
                  setPending(false);
                }
              }}
            />
          </div>
        </div>
      }
    >
      {children}
    </Popover>
  );
}
export function Confirm({
  open,
  title,
  description,
  merchant = "审核中",
  sales = "审核中",
  reversible = "操作会保留审计记录。",
  confirmLabel = "确认",
  onConfirm,
  onClose,
  busy,
  children,
  danger,
  confirmDisabled,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  merchant?: ReactNode;
  sales?: ReactNode;
  reversible?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  busy?: boolean;
  children?: ReactNode;
  danger?: boolean;
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      purpose={busy ? "required" : "info"}
      width={600}
      padding={0}
      className="ui-confirm-dialog"
    >
      <DialogHeader
        title={title}
        onOpenChange={busy ? undefined : () => onClose()}
      />
      <div className="consequence-preview">
        <section>
          <h3>将发生什么</h3>
          <div>{description}</div>
        </section>
        {children}
        <div className="ui-impact-grid">
          <section>
            <h3>商户端影响</h3>
            <div>{merchant}</div>
          </section>
          <section>
            <h3>销售端影响</h3>
            <div>{sales}</div>
          </section>
        </div>
        <section>
          <h3>能否撤销</h3>
          <div>{reversible}</div>
        </section>
      </div>
      <div className="ui-dialog-actions">
        <Button label="取消" onClick={onClose} isDisabled={busy} />
        <Button
          label={confirmLabel}
          variant={danger ? "destructive" : "primary"}
          isLoading={busy}
          isDisabled={confirmDisabled}
          onClick={() => void onConfirm()}
        />
      </div>
    </Dialog>
  );
}
export { STATUS_LABELS } from "./format";
export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      tone={
        ["CLOSED", "DONE"].includes(status)
          ? "success"
          : ["COMPLIANCE_HOLD", "CLOSED_NO_RESPONSE"].includes(status)
            ? "danger"
            : [
                  "WAITING_MERCHANT",
                  "WAITING_SUPPLEMENT",
                  "PENDING_SECOND",
                  "PENDING_APPROVAL",
                  "TO_CHECK",
                ].includes(status)
              ? "warning"
              : ["IN_PROGRESS", "BLIND", "COMPARE"].includes(status)
                ? "info"
                : "neutral"
      }
    >
      {statusLabel(status)}
    </Badge>
  );
}
export function Sla({
  order,
}: {
  order: Pick<WorkOrder, "slaDueAt" | "slaPaused" | "createdAt">;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  if (order.slaPaused) return <span className="secondary">已暂停</span>;
  const remaining = new Date(order.slaDueAt).getTime() - now;
  const full =
    new Date(order.slaDueAt).getTime() - new Date(order.createdAt).getTime();
  return (
    <Tooltip content={`截止 ${dateTime(order.slaDueAt)}`}>
      <span
        tabIndex={0}
        className={`sla ${remaining < 0 ? "overdue" : remaining < full * 0.2 ? "warning" : ""}`}
      >
        {remaining < 0 ? "已超时 " : ""}
        {duration(remaining)}
      </span>
    </Tooltip>
  );
}
export function IdText({ value }: { value?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  if (!value) return <span>—</span>;
  return (
    <span className="identifier">
      <span>{value}</span>
      <IconButton
        className="identifier-copy"
        label={copyState === "copied" ? "已复制" : "复制编号"}
        tooltip={
          copyState === "error"
            ? "复制失败，请手动复制编号"
            : copyState === "copied"
              ? "已复制"
              : "复制编号"
        }
        icon={copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
        variant="ghost"
        size="sm"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void navigator.clipboard.writeText(value).then(
            () => setCopyState("copied"),
            () => setCopyState("error"),
          );
        }}
      />
      <span className="ui-sr-only" role="status">
        {copyState === "copied"
          ? "已复制编号"
          : copyState === "error"
            ? "复制失败，请手动复制编号"
            : ""}
      </span>
    </span>
  );
}
export function PersonName({ user }: { user?: UserRef }) {
  return user ? (
    <Tooltip
      content={
        <>
          {user.account ?? "—"} · {user.team ?? "—"}
        </>
      }
    >
      <span tabIndex={0} className="person-name">
        {user.name}
      </span>
    </Tooltip>
  ) : (
    <span>—</span>
  );
}
export function PageHeading({
  title,
  actions,
  eyebrow: _eyebrow,
  description: _description,
}: {
  title: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <nav className="ui-breadcrumb" aria-label="当前位置">
        <span>工作台</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">
          {typeof title === "string" ? title : "详情"}
        </span>
      </nav>
      <div className="page-title-row">
        <h1>{title}</h1>
        {actions && <div className="action-row">{actions}</div>}
      </div>
    </div>
  );
}
export function OrderHeader({
  data,
  actions,
}: {
  data: OrderDetail;
  actions?: ReactNode;
}) {
  const { workOrder: w, application: a, merchant: m, channel } = data;
  const { session } = useSession();
  const queueContext = getQueueContext(session);
  const group =
    w.type === "SUPPLEMENT"
      ? "ops"
      : w.type === "CHANNEL"
        ? "channel"
        : w.type === "RESTRICTED"
          ? "restricted"
          : w.type === "QA"
            ? "qa"
            : w.status === "PENDING_APPROVAL"
              ? "approval"
              : "review";
  const common = [
    { key: "id", label: "工单号", children: <IdText value={w.id} /> },
    {
      key: "application",
      label: "申请号",
      children: (
        <Link to={`/applications/${a.id}`}>
          <IdText value={a.id} />
        </Link>
      ),
    },
  ];
  const fields =
    w.type === "SUPPLEMENT"
      ? [
          ...common,
          {
            key: "source",
            label: "补件来源",
            children:
              [
                ...new Set(
                  (w.items ?? []).map(
                    (i) =>
                      ({ COMPLIANCE: "合规", CHANNEL: "渠道", AUTO: "系统" })[
                        i.source
                      ],
                  ),
                ),
              ].join("、") || "—",
          },
          {
            key: "due",
            label: "商户截止",
            children: deadlineDate(w.dueAt, m.country),
          },
          { key: "sla", label: "SLA 剩余", children: <Sla order={w} /> },
          {
            key: "reminders",
            label: "已提醒",
            children: `${w.remindersSent ?? 0}/3`,
          },
          {
            key: "owner",
            label: "处理人",
            children: <PersonName user={w.assignee} />,
          },
        ]
      : w.type === "CHANNEL"
        ? [
            ...common,
            {
              key: "channel",
              label: "渠道",
              children: channel?.channelName ?? "—",
            },
            {
              key: "submission",
              label: "渠道提交号",
              children: <IdText value={channel?.submissionNo} />,
            },
            {
              key: "receipt",
              label: "回执类型",
              children: RECEIPT_LABELS[channel?.receiptType ?? ""] ?? "—",
            },
            {
              key: "receiptAt",
              label: "回执时间",
              children: dateTime(channel?.receiptAt),
            },
            { key: "sla", label: "SLA 剩余", children: <Sla order={w} /> },
            {
              key: "owner",
              label: "处理人",
              children: <PersonName user={w.assignee} />,
            },
          ]
        : [
            ...common,
            {
              key: "stage",
              label: "阶段",
              children: STAGE_LABELS[w.stage] ?? w.stage,
            },
            {
              key: "country",
              label: "注册地",
              children: countryName(m.country),
            },
            { key: "mcc", label: "申报 MCC", children: mccName(m.declaredMcc) },
            {
              key: "volume",
              label: "预估月交易额",
              children: money(m.expectedMonthlyVolume),
            },
            { key: "sla", label: "SLA 剩余", children: <Sla order={w} /> },
            {
              key: "owner",
              label: "处理人",
              children: <PersonName user={w.assignee} />,
            },
          ];
  return (
    <header className="order-header">
      <nav className="ui-breadcrumb" aria-label="当前位置">
        <Link to={queueContext?.url ?? `/queue/${group}`}>
          {TYPE_LABELS[w.type]}工单
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">
          <IdText value={w.id} />
        </span>
      </nav>
      <div className="page-title-row">
        <div className="row ui-order-title">
          <h1>{m.legalName}</h1>
          {m.displayName && <span className="secondary">{m.displayName}</span>}
          <StatusBadge status={w.status} />
          {w.priority === "HIGH" && <Badge tone="danger">高</Badge>}
          {a.isKeyMerchant && <Badge>重点</Badge>}
          {w.type === "CHANNEL" && <Badge>{STAGE_LABELS[w.stage]}</Badge>}
          {w.assignee &&
            !["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(
              w.status,
            ) && (
              <span className="secondary processing-person">
                {w.assignee.name}正在处理
              </span>
            )}
        </div>
        <div className="action-row">{actions}</div>
      </div>
      <dl className="ui-order-details">
        {fields.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>{f.children}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
const CONCLUSION_LABELS = Object.fromEntries(
  Object.values(CHECK_OPTIONS).flatMap((options) =>
    options.map((option) => [option.value, option.label]),
  ),
);
function auditJson(value: unknown) {
  return (
    JSON.stringify(
      value,
      (key, entry) => {
        if (typeof entry !== "string") return entry;
        if (
          [
            "status",
            "outcome",
            "pendingDecision",
            "decision",
            "autoDecision",
          ].includes(key)
        )
          return statusLabel(entry);
        if (key === "stage") return STAGE_LABELS[entry] ?? entry;
        if (key === "conclusion")
          return CONCLUSION_LABELS[entry] ?? statusLabel(entry);
        if (key === "type") return TYPE_LABELS[entry] ?? entry;
        if (key === "checkType" || key === "kind")
          return CHECK_LABELS[entry as keyof typeof CHECK_LABELS] ?? entry;
        return entry;
      },
      2,
    ) ?? "—"
  );
}
export function Timeline({ audit }: { audit: AuditLog[] }) {
  return audit.length ? (
    <div className="audit-timeline">
      {[...audit].reverse().map((entry) => (
        <div key={entry.id} className="audit-entry">
          <div className="spread">
            <strong>{entry.action}</strong>
            <span className="secondary">{dateTime(entry.at)}</span>
          </div>
          <div>
            <PersonName user={entry.actor} />
            {entry.note && <span> · {entry.note}</span>}
          </div>
          <div className="ui-audit-snapshot">
            <span>快照</span>
            <IdText value={entry.snapshotId} />
          </div>
          <Collapsible trigger="查看操作前后数据" defaultIsOpen={false}>
            <div className="audit-values">
              <div>
                <strong>操作前</strong>
                <pre>{auditJson(entry.before)}</pre>
              </div>
              <div>
                <strong>操作后</strong>
                <pre>{auditJson(entry.after)}</pre>
              </div>
            </div>
          </Collapsible>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="暂无操作记录" />
  );
}
export function FileUpload({
  value,
  onChange,
  disabled,
  accept,
  maxCount,
}: {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
  accept?: string;
  maxCount?: number;
}) {
  const { session } = useSession();
  const [preview, setPreview] = useState<UploadedFile>();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const readFiles = async (selected: File | File[] | null) => {
    if (!selected || disabled || reading) return;
    const files = Array.isArray(selected) ? selected : [selected];
    setReading(true);
    setError("");
    try {
      const loaded = await Promise.all(
        files.map(
          (file) =>
            new Promise<UploadedFile>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: `FILE-${crypto.randomUUID()}`,
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  uploadedBy: {
                    id: session.userId,
                    name: session.name,
                    account: session.account,
                    team: session.team,
                  },
                  uploadedAt: new Date().toISOString(),
                  content: String(reader.result),
                });
              reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
              reader.onabort = () =>
                reject(new Error(`读取 ${file.name} 已取消`));
              reader.readAsDataURL(file);
            }),
        ),
      );
      onChange(
        maxCount
          ? [...value, ...loaded].slice(-maxCount)
          : [...value, ...loaded],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取文件");
    } finally {
      setReading(false);
    }
  };
  return (
    <div className="file-upload">
      <FileInput
        label="上传文件"
        isLabelHidden
        mode="dropzone"
        value={null}
        onChange={(selected) => void readFiles(selected)}
        isDisabled={disabled || reading}
        isLoading={reading}
        isMultiple={maxCount !== 1}
        accept={accept}
        placeholder="拖拽文件到此处，或点击上传"
        status={error ? { type: "error", message: error } : undefined}
        width="100%"
      />
      {value.length > 0 && (
        <ul className="ui-upload-list">
          {value.map((file) => (
            <li className="ui-upload-file" key={file.id}>
              <div className="ui-upload-file-info">
                <strong>{file.name}</strong>
                <div className="file-metadata">
                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                  <PersonName user={file.uploadedBy} />
                  <span>{dateTime(file.uploadedAt)}</span>
                </div>
              </div>
              <div className="ui-upload-actions">
                <IconButton
                  label={`预览 ${file.name}`}
                  tooltip="预览"
                  icon={<Eye size={16} />}
                  variant="ghost"
                  onClick={() => setPreview(file)}
                />
                <AstryxLink
                  className="ui-file-download"
                  href={file.content ?? file.url}
                  download={file.name}
                  label={`下载 ${file.name}`}
                  tooltip="下载"
                >
                  <Download size={16} aria-hidden="true" />
                </AstryxLink>
                {!disabled && (
                  <IconButton
                    label={`移除 ${file.name}`}
                    tooltip="移除"
                    icon={<Trash2 size={16} />}
                    variant="ghost"
                    isDisabled={reading}
                    onClick={() => {
                      onChange(value.filter((item) => item.id !== file.id));
                      if (preview?.id === file.id) setPreview(undefined);
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        isOpen={!!preview}
        onOpenChange={(next) => {
          if (!next) setPreview(undefined);
        }}
        width={860}
        padding={0}
        className="ui-file-preview-dialog"
      >
        <DialogHeader
          title={preview?.name}
          onOpenChange={() => setPreview(undefined)}
        />
        <div className="ui-file-preview">
          {preview?.type.startsWith("image/") ? (
            <img src={preview.content ?? preview.url} alt={preview.name} />
          ) : preview?.type === "application/pdf" ? (
            <iframe
              title={preview.name}
              src={preview.content ?? preview.url}
              className="document-preview"
            />
          ) : (
            <p className="secondary">此文件格式不支持在线预览，请下载查看。</p>
          )}
        </div>
        <div className="ui-dialog-actions">
          <AstryxLink
            className="ui-download-link"
            href={preview?.content ?? preview?.url}
            download={preview?.name}
          >
            <Download size={16} aria-hidden="true" />
            下载文件
          </AstryxLink>
          <Button label="关闭" onClick={() => setPreview(undefined)} />
        </div>
      </Dialog>
    </div>
  );
}
