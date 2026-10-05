import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import {
  Dialog,
  DialogHeader as AstryxDialogHeader,
} from "@astryxdesign/core/Dialog";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Field as AstryxField } from "@astryxdesign/core/Field";
import { FileInput } from "@astryxdesign/core/FileInput";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Popover } from "@astryxdesign/core/Popover";
import { Selector } from "@astryxdesign/core/Selector";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Download,
  Eye,
  Inbox,
  LockKeyhole,
  Info,
  RotateCw,
  Trash2,
} from "lucide-react";
import "./ui.css";
import { Link, useNavigate } from "react-router-dom";
import { getQueueContext, useSession } from "./hooks";
import { homePath } from "./access";
import { ApiError } from "./api";
import { CHECK_LABELS, CHECK_OPTIONS } from "./catalog";
import {
  countryName,
  merchantTradingName,
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
  CommunicationLanguage,
  OrderDetail,
  Session,
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
export function DialogHeader({
  className = "",
  ...props
}: ComponentProps<typeof AstryxDialogHeader>) {
  return (
    <AstryxDialogHeader
      {...props}
      className={`ui-dialog-header ${className}`}
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

export function DetailTabs({
  id,
  value,
  onChange,
  items,
  label = "详情分区",
  compact = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string; count?: number }[];
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={`detail-tabs${compact ? " is-compact" : ""}`}>
      <TabList
        role="tablist"
        aria-label={label}
        value={value}
        onChange={onChange}
        hasDivider
      >
        {items.map((item) => (
          <Tab
            key={item.value}
            id={`${id}-tab-${item.value}`}
            panelId={`${id}-panel-${item.value}`}
            value={item.value}
            label={
              item.count === undefined
                ? item.label
                : `${item.label} · ${item.count}`
            }
          />
        ))}
      </TabList>
    </div>
  );
}

export function DetailSection({
  id,
  value,
  active,
  children,
  className = "",
}: {
  id: string;
  value: string;
  active: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={`${id}-panel-${value}`}
      role="tabpanel"
      aria-labelledby={`${id}-tab-${value}`}
      tabIndex={0}
      hidden={active !== value}
      className={`detail-section ${className}`}
    >
      {children}
    </section>
  );
}

export function OrderSummary({
  data,
  title = "当前处理",
  children,
  actions,
}: {
  data: OrderDetail;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const order = data.workOrder;
  const closed = ["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(
    order.status,
  );
  return (
    <Panel title={title} className="detail-context">
      <div className="detail-summary-heading">
        <strong>
          {order.status === "PENDING_APPROVAL"
            ? "审批"
            : TYPE_LABELS[order.type]}
          工单
        </strong>
        <StatusBadge status={order.status} />
      </div>
      <dl className="detail-summary-facts">
        <div>
          <dt>处理人</dt>
          <dd>
            {order.assignee ? <PersonName user={order.assignee} /> : "待领取"}
          </dd>
        </div>
        <div>
          <dt>{closed ? "处理状态" : "SLA 剩余"}</dt>
          <dd>{closed ? "已结束" : <Sla order={order} />}</dd>
        </div>
      </dl>
      {children}
      {actions && <div className="detail-context-actions">{actions}</div>}
    </Panel>
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
  error: Error | string | null;
  retry: () => void;
  children: ReactNode;
}) {
  const { session } = useSession();
  const navigate = useNavigate();
  const denied = error instanceof ApiError && error.status === 403;
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
        status={denied ? "warning" : "error"}
        icon={denied ? <LockKeyhole size={20} /> : undefined}
        title={denied ? "无访问权限" : "加载失败"}
        description={error instanceof Error ? error.message : error}
        endContent={
          <Button
            label={denied ? "返回我的待办" : "重试"}
            icon={denied ? undefined : <RotateCw size={16} />}
            onClick={denied ? () => navigate(homePath(session.role)) : retry}
          />
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
      placement="below"
      alignment="end"
      width="min(320px, calc(100vw - 32px))"
      padding={4}
      closeButtonLabel="关闭确认气泡"
      className="ui-confirm-popover"
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
export function StatusBadge({
  status,
}: {
  status: Status | OrderDetail["application"]["externalStatus"] | "可交易";
}) {
  let tone: ComponentProps<typeof Badge>["tone"] = "neutral";
  switch (status) {
    case "COMPLIANCE_HOLD":
    case "未通过":
      tone = "danger";
      break;
    case "WAITING_MERCHANT":
    case "WAITING_SUPPLEMENT":
    case "WAITING_CHANNEL":
    case "WAITING_COMPLIANCE":
    case "PENDING_SECOND":
    case "PENDING_APPROVAL":
    case "资料待补充":
      tone = "warning";
      break;
    case "IN_PROGRESS":
    case "TO_CHECK":
    case "BLIND":
    case "COMPARE":
    case "审核中":
      tone = "info";
      break;
    case "已通过":
    case "可交易":
      tone = "success";
  }
  return <Badge tone={tone}>{statusLabel(status)}</Badge>;
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
  if (
    (w.type === "REVIEW" && w.status !== "PENDING_APPROVAL") ||
    w.type === "QA"
  )
    return (
      <header className="order-header ui-order-compact detail-compact-header">
        <Link
          to={queueContext?.url ?? `/queue/${group}`}
          className="ui-order-back"
          aria-label="返回队列"
          title="返回队列"
        >
          <ArrowLeft size={16} />
        </Link>
        <Tooltip content={m.legalName}>
          <h1 tabIndex={0} className="ui-order-compact-name">
            {m.legalName}
          </h1>
        </Tooltip>
        <StatusBadge status={w.status} />
        {w.priority === "HIGH" && (
          <span className="priority-high">
            <Badge tone="danger">高</Badge>
          </span>
        )}
        <span className="ui-order-compact-id">
          <IdText value={w.id} />
        </span>
        <span className="ui-order-compact-sla">
          <Sla order={w} />
        </span>
        <Popover
          label="工单信息"
          closeButtonLabel="关闭工单信息"
          placement="below"
          width="min(400px, calc(100vw - 32px))"
          content={
            <dl className="ui-order-details ui-order-popover-details">
              {fields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{field.children}</dd>
                </div>
              ))}
            </dl>
          }
        >
          <Button
            label="工单信息"
            icon={<Info size={16} />}
            isIconOnly
            variant="ghost"
          />
        </Popover>
        <div className="action-row ui-order-compact-actions">{actions}</div>
      </header>
    );
  return (
    <header className="order-header detail-order-header">
      <nav className="ui-breadcrumb" aria-label="当前位置">
        <Link to={queueContext?.url ?? `/queue/${group}`}>
          <ArrowLeft size={14} aria-hidden="true" />
          {group === "approval" ? "审批" : TYPE_LABELS[w.type]}工单
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{w.id}</span>
      </nav>
      <Panel className="detail-hero">
        <div className="detail-hero-top">
          <div className="detail-identity">
            <div className="detail-icon" aria-hidden="true">
              <Building2 size={24} />
            </div>
            <div className="detail-identity-copy">
              <div className="detail-kicker">
                <span>
                  {group === "approval" ? "审批" : TYPE_LABELS[w.type]}详情
                </span>
                <IdText value={w.id} />
                {merchantTradingName(m.legalName, m.displayName) && (
                  <span>{m.displayName}</span>
                )}
              </div>
              <div className="detail-name-row">
                <h1>{m.legalName}</h1>
                <StatusBadge status={w.status} />
                {w.priority === "HIGH" && <Badge tone="danger">高</Badge>}
                {a.isKeyMerchant && <Badge>重点商户</Badge>}
                {w.type === "CHANNEL" && <Badge>{STAGE_LABELS[w.stage]}</Badge>}
              </div>
            </div>
          </div>
          <div className="action-row detail-header-actions">
            {actions}
            <Popover
              label="工单信息"
              closeButtonLabel="关闭工单信息"
              placement="below"
              alignment="end"
              width="min(400px, calc(100vw - 32px))"
              content={
                <dl className="ui-order-details ui-order-popover-details">
                  {fields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{field.children}</dd>
                    </div>
                  ))}
                </dl>
              }
            >
              <Button
                label="工单信息"
                icon={<Info size={16} />}
                variant="ghost"
              />
            </Popover>
          </div>
        </div>
        <dl className="detail-meta-grid">
          <div>
            <dt>关联申请</dt>
            <dd>
              <Link to={`/applications/${a.id}`}>{a.id}</Link>
            </dd>
          </div>
          <div>
            <dt>
              {w.type === "SUPPLEMENT"
                ? "商户截止"
                : w.type === "CHANNEL"
                  ? "提交渠道"
                  : "当前环节"}
            </dt>
            <dd>
              {w.type === "SUPPLEMENT"
                ? deadlineDate(w.dueAt, m.country)
                : w.type === "CHANNEL"
                  ? (channel?.channelName ?? "—")
                  : (STAGE_LABELS[w.stage] ?? w.stage)}
            </dd>
          </div>
          <div>
            <dt>处理人</dt>
            <dd>{w.assignee ? <PersonName user={w.assignee} /> : "待领取"}</dd>
          </div>
          <div>
            <dt>SLA 剩余</dt>
            <dd>
              {["CLOSED", "DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(
                w.status,
              ) ? (
                "已结束"
              ) : (
                <Sla order={w} />
              )}
            </dd>
          </div>
        </dl>
      </Panel>
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
  language = "zh",
  session: uploadSession,
}: {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  disabled?: boolean;
  accept?: string;
  maxCount?: number;
  language?: CommunicationLanguage;
  session?: Session;
}) {
  const { session: currentSession } = useSession();
  const session = uploadSession ?? currentSession;
  const english = language === "en";
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
              reader.onerror = () =>
                reject(
                  new Error(
                    english
                      ? `Unable to read ${file.name}`
                      : `无法读取 ${file.name}`,
                  ),
                );
              reader.onabort = () =>
                reject(
                  new Error(
                    english
                      ? `Reading ${file.name} was cancelled`
                      : `读取 ${file.name} 已取消`,
                  ),
                );
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
      setError(
        cause instanceof Error
          ? cause.message
          : english
            ? "Unable to read file"
            : "无法读取文件",
      );
    } finally {
      setReading(false);
    }
  };
  return (
    <div className="file-upload">
      <FileInput
        label={english ? "Upload files" : "上传文件"}
        isLabelHidden
        mode="dropzone"
        value={null}
        onChange={(selected) => void readFiles(selected)}
        isDisabled={disabled || reading}
        isLoading={reading}
        isMultiple={maxCount !== 1}
        accept={accept}
        placeholder={
          english
            ? "Drop files here, or click to upload"
            : "拖拽文件到此处，或点击上传"
        }
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
                  label={`${english ? "Preview" : "预览"} ${file.name}`}
                  tooltip={english ? "Preview" : "预览"}
                  icon={<Eye size={16} />}
                  variant="ghost"
                  onClick={() => setPreview(file)}
                />
                <AstryxLink
                  className="ui-file-download"
                  href={file.content ?? file.url}
                  download={file.name}
                  label={`${english ? "Download" : "下载"} ${file.name}`}
                  tooltip={english ? "Download" : "下载"}
                >
                  <Download size={16} aria-hidden="true" />
                </AstryxLink>
                {!disabled && (
                  <IconButton
                    label={`${english ? "Remove" : "移除"} ${file.name}`}
                    tooltip={english ? "Remove" : "移除"}
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
            <p className="secondary">
              {english
                ? "This file cannot be previewed online. Download it to view."
                : "此文件格式不支持在线预览，请下载查看"}
            </p>
          )}
        </div>
        <div className="ui-dialog-actions">
          <AstryxLink
            className="ui-download-link"
            href={preview?.content ?? preview?.url}
            download={preview?.name}
          >
            <Download size={16} aria-hidden="true" />
            {english ? "Download file" : "下载文件"}
          </AstryxLink>
          <Button
            label={english ? "Close" : "关闭"}
            onClick={() => setPreview(undefined)}
          />
        </div>
      </Dialog>
    </div>
  );
}
