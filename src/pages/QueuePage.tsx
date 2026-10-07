import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { Popover } from "@astryxdesign/core/Popover";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  Table,
  pixel,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSelection,
  useTableSortable,
  useTableStickyColumns,
  type TableColumn,
  type TablePlugin,
  type TableSortState,
} from "@astryxdesign/core/Table";
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { api, ApiError } from "../api";
import {
  getQueueContext,
  saveQueueContext,
  useAsync,
  useNotice,
  useQueueFlow,
  useSession,
} from "../hooks";
import {
  COMPLIANCE_ROLES,
  MENUS,
  OPS_ROLES,
  QUEUE_TABS,
  orderPath,
} from "../access";
import { REASONS } from "../catalog";
import {
  COLUMN_DEFINITIONS,
  getQueueColumnIds,
  getQueueColumns,
} from "../columns";
import {
  Confirm,
  DialogHeader,
  Empty,
  InlineConfirm,
  LoadState,
  IdText,
  PageHeading,
  PersonName,
} from "../ui";
import {
  COUNTRY_NAMES,
  RECEIPT_LABELS,
  countryName,
  dateTime,
  duration,
} from "../format";
import type { QueueFilters, QueueRow, QueueView, User } from "../types";
import "./queue.css";

type TableQueueRow = QueueRow & Record<string, unknown>;
const CLOSED_STATUSES: Record<string, true> = {
  CLOSED: true,
  DONE: true,
  CLOSED_NO_RESPONSE: true,
  WITHDRAWN: true,
};
function defaultSort(view: QueueView, tab: string): TableSortState {
  const sortKey =
    view === "restricted"
      ? "C31"
      : view === "qa" && tab === "review"
        ? "C27"
        : view === "review" && tab === "supplement"
          ? "supplementProgress"
          : view === "ops" && tab === "waiting"
            ? "C16"
            : "C10";
  return [
    {
      sortKey,
      direction: ["C31", "C27"].includes(sortKey) ? "descending" : "ascending",
    },
  ];
}

const merchantNames = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});
const reviewBands = [
  { key: "overdue", label: "已超时", tone: "danger" },
  { key: "due", label: "2 小时内到期", tone: "warning" },
  { key: "today", label: "今天到期", tone: "" },
  { key: "high", label: "高优先级", tone: "" },
] as const;

interface QueueTiming {
  due: number;
  remaining: number;
  tone: "paused" | "closed" | "overdue" | "due" | "soon" | "";
  used: number;
}

function queueSla(row: QueueRow, now: number): QueueTiming {
  const due = Date.parse(row.slaDueAt);
  const remaining = due - now;
  const total = Math.max(1, due - Date.parse(row.createdAt));
  const tone = row.slaPaused
    ? "paused"
    : CLOSED_STATUSES[row.status]
      ? "closed"
      : remaining < 0
        ? "overdue"
        : remaining < 7200000
          ? "due"
          : remaining < total * 0.2
            ? "soon"
            : "";
  return {
    due,
    remaining,
    tone,
    used: Math.min(100, Math.max(0, (1 - remaining / total) * 100)),
  };
}

function queueDeadline(value: string, now: number) {
  const due = new Date(value);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = dateTime(value, true).slice(6);
  return due.toDateString() === today.toDateString()
    ? `今天 ${time}`
    : due.toDateString() === tomorrow.toDateString()
      ? `明天 ${time}`
      : dateTime(value, true);
}

export default function QueuePage() {
  const { session } = useSession();
  const location = useLocation();
  return (
    <QueueContents
      key={`${session.userId}:${session.role}:${location.pathname}${location.search}`}
    />
  );
}

function QueueContents() {
  const { session } = useSession();
  const navigate = useNavigate();
  const notify = useNotice();
  const { view: rawView = "review" } = useParams();
  const [params, setParams] = useSearchParams();
  const view = rawView as QueueView;
  const location = useLocation();
  const queueUrl = `${location.pathname}${location.search}`;
  const { next, busy: nextBusy } = useQueueFlow();
  const root = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const [saved] = useState(() => {
    const context = getQueueContext(session);
    return context?.url === queueUrl ? context : null;
  });
  const tabs = QUEUE_TABS[view] ?? [];
  const tab = params.get("tab") || tabs[0]?.key || "";
  const allowed = MENUS[session.role].some((m) => m.key === view);
  const ops = OPS_ROLES.includes(session.role);
  const manager = ["OPS_LEAD", "COMPLIANCE_HEAD"].includes(session.role);
  const filters = useMemo(() => {
    const query = new URLSearchParams(params);
    query.delete("band");
    query.delete("check");
    return {
      view,
      tab,
      ...Object.fromEntries(query.entries()),
    } as QueueFilters;
  }, [view, tab, params]);
  const resource = useAsync(
    () => api.listOrders(filters, session),
    [view, params.toString(), session.userId],
  );
  const channelResource = useAsync(
    async () =>
      view === "channel"
        ? (await api.listOrders({ view: "channel", tab: "all" }, session)).rows
        : [],
    [view, session.userId, session.role],
  );
  const channelOptions = useMemo(
    () =>
      Array.from(
        new Map(
          (channelResource.data ?? [])
            .filter((row) => row.channelId && row.channelName)
            .map((row) => [
              row.channelId!,
              { value: row.channelId!, label: row.channelName! },
            ]),
        ).values(),
      ),
    [channelResource.data],
  );
  const [search, setSearch] = useState(params.get("search") || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [assign, setAssign] = useState(false);
  const [assignee, setAssignee] = useState<string>();
  const [candidates, setCandidates] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);
  const [extension, setExtension] = useState<QueueRow>();
  const [approve, setApprove] = useState(true);
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(saved?.page ?? 1);
  const [pageSize, setPageSize] = useState(saved?.pageSize ?? 50);
  const [sort, setSort] = useState<TableSortState>(() =>
    Array.isArray(saved?.sort)
      ? (saved.sort as TableSortState)
      : defaultSort(view, tab),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [density, setDensity] = useState<"compact" | "balanced" | "spacious">(
    "compact",
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const timingKey =
    view === "review" && tab === "supplement" ? "supplementProgress" : "C10";
  const checkFilter = view === "review" ? params.get("check") : null;
  const band =
    view === "review" && tab !== "supplement"
      ? reviewBands.find((entry) => entry.key === params.get("band"))?.key
      : undefined;
  const queueData = useMemo(() => {
    const counts = { overdue: 0, due: 0, today: 0, high: 0 };
    const timings = new Map<string, QueueTiming>();
    const source = resource.data?.rows ?? [];
    const rows: QueueRow[] = [];
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    for (const row of source) {
      const timing = queueSla(row, now);
      timings.set(row.id, timing);
      if (view !== "review") {
        rows.push(row);
        continue;
      }
      if (
        checkFilter &&
        !row.checkItems?.some((item) => item.title === checkFilter)
      )
        continue;
      const running = timing.tone !== "paused" && timing.tone !== "closed";
      const matches = {
        overdue: timing.tone === "overdue",
        due: timing.tone === "due",
        today: running && timing.remaining >= 0 && timing.due <= end.getTime(),
        high: row.priority === "HIGH",
      };
      for (const entry of reviewBands)
        if (matches[entry.key]) counts[entry.key]++;
      if (!band || matches[band]) {
        rows.push(row);
      }
    }
    return { rows, counts, timings };
  }, [resource.data, view, checkFilter, band, now]);
  const checkOptions = useMemo(() => {
    if (view !== "review") return [];
    const titles = new Set(
      resource.data?.rows.flatMap(
        (row) => row.checkItems?.map((item) => item.title) ?? [],
      ) ?? [],
    );
    if (checkFilter) titles.add(checkFilter);
    return Array.from(titles)
      .sort(merchantNames.compare)
      .map((value) => ({ value, label: value }));
  }, [resource.data, checkFilter, view]);
  const activeFilters = [
    "search",
    "type",
    "priority",
    "country",
    "reasonCode",
    "check",
    "band",
  ].some((key) => !!params.get(key));
  const uniformStatus =
    !!resource.data?.rows.length &&
    resource.data.rows.every(
      (row) => row.status === resource.data!.rows[0].status,
    );
  const base = useMemo(
    () => getQueueColumns(view, tab, session),
    [view, tab, session.userId],
  );
  const availableKeys = useMemo(() => {
    const keys = getQueueColumnIds(view, tab);
    return [
      ...keys.filter((key) => key !== timingKey),
      ...(keys.includes(timingKey) ? [timingKey] : []),
      "actions",
    ];
  }, [view, tab, timingKey]);
  const defaultKeys = useMemo(
    () =>
      view === "review"
        ? [
            "C01",
            "C02",
            "C07",
            "C08",
            ...(["new", "screening", "supplement"].includes(tab)
              ? ["C12"]
              : []),
            timingKey,
            "actions",
          ]
        : availableKeys,
    [view, tab, availableKeys, timingKey],
  );
  const [activeKeys, setActiveKeys] = useState<readonly string[]>(defaultKeys);
  const pinnedCount = availableKeys.includes(timingKey) ? 2 : 1;
  const sortedRows = useMemo(() => {
    const rows = queueData.rows;
    if (!sort.length) return rows;
    return [...rows].sort((a, b) => {
      for (const entry of sort) {
        const accessor = COLUMN_DEFINITIONS[entry.sortKey]?.sort;
        const difference =
          view === "review" && entry.sortKey === "C02"
            ? merchantNames.compare(a.merchantName, b.merchantName)
            : accessor
              ? accessor(a) - accessor(b)
              : 0;
        if (difference)
          return entry.direction === "descending" ? -difference : difference;
      }
      return 0;
    });
  }, [queueData.rows, sort, view]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(sortedRows.length / pageSize)),
  );
  const pageRows = sortedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  ) as TableQueueRow[];
  const persist = useCallback(() => {
    if (!resource.data || resource.loading || !restored.current) return;
    saveQueueContext(session, {
      url: queueUrl,
      ids: sortedRows.map((row) => row.id),
      scrollTop:
        document.getElementById("astryx-app-shell-main")?.scrollTop ??
        window.scrollY,
      scrollLeft:
        root.current?.querySelector(".astryx-table-scroll-wrapper")
          ?.scrollLeft ?? 0,
      sort,
      page: currentPage,
      pageSize,
    });
  }, [
    resource.data,
    resource.loading,
    session,
    queueUrl,
    sortedRows,
    sort,
    currentPage,
    pageSize,
  ]);
  useLayoutEffect(() => {
    if (!resource.data || resource.loading || restored.current) return;
    const frame = requestAnimationFrame(() => {
      const scrollOwner = document.getElementById("astryx-app-shell-main");
      if (scrollOwner) scrollOwner.scrollTop = saved?.scrollTop ?? 0;
      else window.scrollTo(0, saved?.scrollTop ?? 0);
      const tableScroll = root.current?.querySelector(
        ".astryx-table-scroll-wrapper",
      );
      if (tableScroll) tableScroll.scrollLeft = saved?.scrollLeft ?? 0;
      restored.current = true;
      persist();
    });
    return () => cancelAnimationFrame(frame);
  }, [resource.data, resource.loading, saved, persist]);
  useEffect(() => {
    persist();
    document.addEventListener("scroll", persist, true);
    window.addEventListener("pagehide", persist);
    return () => {
      document.removeEventListener("scroll", persist, true);
      window.removeEventListener("pagehide", persist);
    };
  }, [persist]);
  const update = (key: string, value?: string | null) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key === "tab") next.delete("band");
    setParams(next);
    saveQueueContext(session, {
      url: `${location.pathname}${next.size ? `?${next.toString()}` : ""}`,
      ids: [],
      scrollTop: 0,
      scrollLeft: 0,
      sort:
        key === "tab" ? defaultSort(view, value || tabs[0]?.key || "") : sort,
      page: 1,
      pageSize,
    });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const key of [
      "search",
      "type",
      "priority",
      "country",
      "reasonCode",
      "check",
      "band",
    ])
      next.delete(key);
    setSearch("");
    setParams(next);
    saveQueueContext(session, {
      url: `${location.pathname}${next.size ? `?${next.toString()}` : ""}`,
      ids: [],
      scrollTop: 0,
      scrollLeft: 0,
      sort,
      page: 1,
      pageSize,
    });
  };
  const canClaim = (r: QueueRow) =>
    !r.assignee &&
    ((r.type === "SUPPLEMENT" && ops && r.status === "TO_SEND") ||
      (r.status === "QUEUED" &&
        ((r.type === "REVIEW" && COMPLIANCE_ROLES.includes(session.role)) ||
          (r.type === "CHANNEL" && ops) ||
          (r.type === "RESTRICTED" && session.role === "COMPLIANCE_HEAD") ||
          (r.type === "QA" &&
            ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"].includes(session.role)))));
  const open = (r: QueueRow) => {
    persist();
    if (view === "extensions") {
      setExtension(r);
      setApprove(true);
      setReason("");
    } else navigate(orderPath(r));
  };
  const claim = async (r: QueueRow) => {
    if (busy) return;
    persist();
    setBusy(true);
    try {
      const result = await api.mutate(r.id, "claim", {}, r.version, session);
      navigate(orderPath(result.workOrder));
    } catch (e) {
      notify((e as Error).message);
      resource.reload();
    } finally {
      setBusy(false);
    }
  };
  const openAssign = async () => {
    try {
      const users = await api.users(session);
      setCandidates(
        users.filter((u) =>
          u.roles.some((role) =>
            ops ? OPS_ROLES.includes(role) : COMPLIANCE_ROLES.includes(role),
          ),
        ),
      );
      setAssignee(undefined);
      setAssign(true);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const submitAssign = async () => {
    if (!assignee) return;
    setBusy(true);
    let completed = 0;
    try {
      for (const row of resource.data?.rows.filter((r) =>
        selected.includes(r.id),
      ) ?? []) {
        await api.mutate(
          row.id,
          "assign",
          { assigneeId: assignee },
          row.version,
          session,
        );
        completed++;
      }
      setAssign(false);
      setSelected([]);
      notify(`已指派 ${completed} 张工单`);
    } catch (e) {
      notify(`已指派 ${completed} 张；${(e as Error).message}`);
      throw e;
    } finally {
      setBusy(false);
      resource.reload();
    }
  };
  const submitExtension = async () => {
    if (!extension?.extension) return;
    setBusy(true);
    try {
      await api.mutate(
        extension.id,
        "approve-extension",
        {
          extensionId: extension.extension.id,
          approved: approve,
          reason,
        },
        extension.version,
        session,
      );
      setExtension(undefined);
      resource.reload();
      notify(approve ? "延期已批准" : "延期未批准");
    } catch (e) {
      notify((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const exportRows = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(sortedRows, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `工单_${view}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const queueColumn = (
    column: TableColumn<TableQueueRow>,
  ): TableColumn<TableQueueRow> => {
    switch (column.key) {
      case "C01":
        return {
          ...column,
          width: pixel(172),
          renderCell: (row) => (
            <span className="queue-id">
              <IdText value={row.id} />
            </span>
          ),
        };
      case "C02":
        return {
          ...column,
          width: pixel(300),
          sortable: view === "review" || column.sortable,
        };
      case "C07":
        return {
          ...column,
          header:
            view === "review" && tab === "supplement"
              ? "补件原因"
              : column.header,
          width: pixel(232),
        };
      case "C08":
        return {
          ...column,
          width: pixel(80),
        };
      case "C10":
        return {
          ...column,
          width: pixel(172),
          renderCell: (row) => {
            const timing = queueData.timings.get(row.id)!;
            return (
              <div className="queue-sla" data-tone={timing.tone}>
                {row.slaPaused || timing.tone === "closed" ? (
                  <strong className="secondary">
                    {row.slaPaused ? "已暂停" : "已结束"}
                  </strong>
                ) : (
                  <>
                    <div className="queue-sla-line">
                      <strong>
                        {timing.remaining < 0 ? "已超时 " : ""}
                        {duration(timing.remaining)}
                      </strong>
                      <span className="queue-sla-track" aria-hidden="true">
                        <span style={{ width: `${timing.used}%` }} />
                      </span>
                    </div>
                    <small>{queueDeadline(row.slaDueAt, now)} 到期</small>
                  </>
                )}
              </div>
            );
          },
        };
      case "C12":
        return {
          ...column,
          width: pixel(100),
          renderCell: (row) =>
            row.assignee?.id === session.userId ? (
              "我"
            ) : row.assignee ? (
              <PersonName user={row.assignee} />
            ) : (
              "未领取"
            ),
        };
      case "supplementProgress":
        return {
          ...column,
          width: pixel(196),
          renderCell: (row) => (
            <div className="queue-sla queue-supplement">
              {COLUMN_DEFINITIONS.supplementProgress.render(row, session)}
              {row.slaPaused && <small>SLA 暂停计时</small>}
            </div>
          ),
        };
      default:
        return column;
    }
  };
  const columns: TableColumn<TableQueueRow>[] = base.length
    ? [
        ...base
          .filter((column) => column.key !== "C09" || !uniformStatus)
          .map(queueColumn),
        {
          key: "actions",
          header: "操作",
          width: pixel(88),
          renderCell: (r) =>
            canClaim(r) ? (
              <Button
                label="领取"
                variant="secondary"
                size="sm"
                isDisabled={busy}
                tooltip={busy ? "正在领取，请稍候" : "领取并打开工作台"}
                onClick={(event) => {
                  event.stopPropagation();
                  void claim(r);
                }}
              />
            ) : (
              <Button
                label={
                  view === "review"
                    ? r.assignee?.id === session.userId &&
                      !CLOSED_STATUSES[r.status]
                      ? "继续"
                      : "查看"
                    : r.assignee && r.assignee.id !== session.userId
                      ? "只读查看"
                      : "打开"
                }
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  open(r);
                }}
              />
            ),
        },
      ]
    : [];
  const sortableColumns = columns.filter((column) => column.sortable);
  const activeSort = sortableColumns.some(
    (column) => column.key === sort[0]?.sortKey,
  )
    ? sort[0]
    : undefined;
  const settingsState = useTableColumnSettingsState({
    columns: availableKeys.map((key) => ({
      key,
      label: COLUMN_DEFINITIONS[key]?.title ?? "操作",
      isAlwaysVisible: key === "C01" || key === timingKey || key === "actions",
    })),
    activeColumnKeys: activeKeys,
    onChangeActiveColumnKeys: setActiveKeys,
    defaultColumnKeys: defaultKeys,
  });
  const settingsPlugin = useTableColumnSettings<TableQueueRow>({
    ...settingsState.columnSettingsConfig,
    activeColumnKeys: [
      ...activeKeys.filter((key) => key !== timingKey && key !== "actions"),
      ...(availableKeys.includes(timingKey) ? [timingKey] : []),
      "actions",
    ],
  });
  const sortPlugin = useTableSortable<TableQueueRow>({
    sort,
    onSortChange: (next) => {
      setSort(next);
      setPage(1);
    },
    allowUnsortedState: true,
  });
  const paginationPlugin = useTablePagination<TableQueueRow>({
    page: currentPage,
    onPageChange: setPage,
    totalItems: sortedRows.length,
    pageSize,
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
    pageSizeOptions: [20, 50, 100],
    align: "end",
    label: "工单分页",
  });
  const selectableRows = pageRows.filter((row) => !CLOSED_STATUSES[row.status]);
  const selectedIds = new Set(selected);
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selectedIds.has(r.id));
  const selectionPlugin = useTableSelection<TableQueueRow>({
    getIsItemSelected: (r) => selectedIds.has(r.id),
    onSelectItem: ({ item, isSelected }) =>
      setSelected((previous) =>
        isSelected
          ? [...new Set([...previous, item.id])]
          : previous.filter((id) => id !== item.id),
      ),
    onSelectAll: ({ isAllSelected }) =>
      setSelected((previous) =>
        isAllSelected
          ? [...new Set([...previous, ...selectableRows.map((r) => r.id)])]
          : previous.filter((id) => !selectableRows.some((r) => r.id === id)),
      ),
    getIsAllSelected: () => allSelected,
    getIsIndeterminate: () =>
      !allSelected && selectableRows.some((r) => selectedIds.has(r.id)),
    getIsItemEnabled: (row) => !CLOSED_STATUSES[row.status],
    getRowLabel: (r) => `${r.id} ${r.merchantName}`,
  });
  const stickyPlugin = useTableStickyColumns<TableQueueRow>({
    startKeys: ["C01"],
    endKeys: [timingKey, "actions"],
  });
  const navigationPlugin: TablePlugin<TableQueueRow> = {
    transformBodyRow: (props, item) => ({
      ...props,
      htmlProps: {
        ...props.htmlProps,
        tabIndex: 0,
        "data-sla-tone": availableKeys.includes("C10")
          ? queueData.timings.get(item.id)?.tone
          : undefined,
        onClick: (event) => {
          props.htmlProps.onClick?.(event);
          const interactive =
            event.target instanceof Element &&
            event.target.closest(
              "button,a,input,select,textarea,[role='checkbox'],[role='combobox']",
            );
          if (!event.defaultPrevented && !interactive) open(item);
        },
        onKeyDown: (event) => {
          props.htmlProps.onKeyDown?.(event);
          if (
            event.key === "Enter" &&
            event.target === event.currentTarget &&
            !event.defaultPrevented
          ) {
            event.preventDefault();
            open(item);
          }
        },
      },
    }),
  };
  const moveColumn = (key: string, direction: -1 | 1) => {
    const next = [...activeKeys];
    const index = next.indexOf(key);
    const target = index + direction;
    if (index <= 0 || target <= 0 || target >= next.length - pinnedCount)
      return;
    [next[index], next[target]] = [next[target], next[index]];
    setActiveKeys(next);
  };
  if (!allowed)
    return (
      <LoadState
        loading={false}
        error={new ApiError("无权限访问此工作队列", 403)}
        retry={() => navigate("/applications")}
      >
        {null}
      </LoadState>
    );
  return (
    <div className="queue-page workbench-list">
      <PageHeading
        title={
          view === "review"
            ? "审核任务"
            : (MENUS[session.role].find((m) => m.key === view)?.label ?? "工单")
        }
        metadata={
          resource.loading
            ? "加载中"
            : `${sortedRows.length} 张工单 · 今日已处理 ${resource.data?.todayCompleted ?? 0} 张`
        }
        actions={
          <>
            <span className="secondary small">
              更新于{" "}
              {resource.data ? dateTime(resource.data.updatedAt, true) : "—"}
            </span>
            <Button
              label="刷新"
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} />}
              onClick={resource.reload}
              isLoading={resource.loading}
            />
            {view !== "extensions" && (
              <Button
                label={
                  view === "review" && tab === "claim"
                    ? "领取并处理下一张"
                    : "处理下一张"
                }
                variant="primary"
                isLoading={nextBusy}
                isDisabled={
                  resource.loading || busy || nextBusy || !sortedRows.length
                }
                tooltip={
                  resource.loading
                    ? "队列加载完成后可处理"
                    : !sortedRows.length
                      ? "当前筛选没有工单，调整筛选后可用"
                      : "按当前排序领取并打开下一张可处理工单"
                }
                onClick={() => {
                  persist();
                  void next();
                }}
              />
            )}
          </>
        }
      />
      <section className="queue-surface" aria-label="工作队列">
        <div className="queue-tabs">
          <TabList
            value={tab}
            onChange={(key) => update("tab", key)}
            role="tablist"
            hasDivider
            size="md"
            aria-label="工单状态"
          >
            {tabs.map((t) => (
              <Tab
                key={t.key}
                id={`queue-tab-${t.key}`}
                value={t.key}
                label={t.label}
                panelId="queue-results"
                endContent={
                  <span className="queue-tab-count">
                    {(resource.data?.counts[t.key] ?? 0) > 999
                      ? "999+"
                      : (resource.data?.counts[t.key] ?? 0)}
                  </span>
                }
              />
            ))}
          </TabList>
        </div>
        {view === "review" && tab !== "supplement" && (
          <div
            className="queue-review-stats"
            role="group"
            aria-label="按时效快速筛选"
          >
            {reviewBands.map((entry) => (
              <Button
                key={entry.key}
                label={entry.label}
                aria-label={`${entry.label} ${resource.loading ? "—" : queueData.counts[entry.key]}`}
                endContent={
                  <strong>
                    {resource.loading ? "—" : queueData.counts[entry.key]}
                  </strong>
                }
                size="sm"
                variant="secondary"
                className={`queue-review-stat ${entry.tone}`}
                aria-pressed={band === entry.key}
                isDisabled={
                  resource.loading ||
                  (!queueData.counts[entry.key] && band !== entry.key)
                }
                onClick={() =>
                  update("band", band === entry.key ? null : entry.key)
                }
              />
            ))}
          </div>
        )}
        <div className="list-toolbar queue-query-form">
          <div className="list-search">
            <TextInput
              label="搜索工单"
              placeholder="工单号 / 商户 / 申请号"
              startIcon={Search}
              value={search}
              onChange={(value) => {
                setSearch(value);
                if (!value && params.has("search")) update("search", "");
              }}
              onEnter={() => update("search", search)}
              hasClear
            />
            <Button
              label="搜索"
              isIconOnly
              variant="ghost"
              icon={<Search size={16} />}
              onClick={() => update("search", search)}
            />
          </div>
          {view === "review" ? (
            <>
              <Selector
                label="优先级"
                placeholder="优先级"
                hasClear
                width={112}
                value={params.get("priority")}
                onChange={(value) => update("priority", value)}
                options={[
                  { value: "HIGH", label: "高优先级" },
                  { value: "NORMAL", label: "常规" },
                  { value: "LOW", label: "低优先级" },
                ]}
              />
              <Selector
                label="注册地"
                placeholder="注册地"
                hasClear
                width={128}
                value={params.get("country")}
                onChange={(value) => update("country", value)}
                options={Object.keys(COUNTRY_NAMES).map((value) => ({
                  value,
                  label: countryName(value),
                }))}
              />
              <Selector
                label="检查项"
                placeholder="检查项"
                hasClear
                hasSearch
                width={156}
                value={checkFilter}
                onChange={(value) => update("check", value)}
                options={checkOptions}
              />
              {activeFilters && (
                <Button
                  label="清除筛选"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                />
              )}
            </>
          ) : view === "channel" ? (
            <>
              <Selector
                label="渠道"
                placeholder="全部渠道"
                hasClear
                width={140}
                value={params.get("channel")}
                onChange={(value) => update("channel", value)}
                options={channelOptions}
              />
              <Selector
                label="回执类型"
                placeholder="回执类型"
                hasClear
                width={146}
                value={params.get("receiptType")}
                onChange={(value) => update("receiptType", value)}
                options={Object.entries(RECEIPT_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
              <Selector
                label="是否已映射"
                placeholder="是否已映射"
                hasClear
                width={130}
                value={params.get("mapped")}
                onChange={(value) => update("mapped", value)}
                options={[
                  { value: "true", label: "已映射" },
                  { value: "false", label: "未映射" },
                ]}
              />
            </>
          ) : ops ? (
            <>
              <Selector
                label="补件来源"
                placeholder="来源"
                hasClear
                width={100}
                value={params.get("source")}
                onChange={(v) => update("source", v)}
                options={[
                  { value: "COMPLIANCE", label: "合规" },
                  { value: "CHANNEL", label: "渠道" },
                  { value: "AUTO", label: "系统" },
                ]}
              />
              <Selector
                label="商户截止"
                placeholder="商户截止"
                hasClear
                width={128}
                value={params.get("due")}
                onChange={(v) => update("due", v)}
                options={[
                  { value: "overdue", label: "已过期" },
                  { value: "soon", label: "3 天内到期" },
                ]}
              />
              <Selector
                label="重点商户"
                placeholder="重点商户"
                hasClear
                width={122}
                value={params.get("key")}
                onChange={(v) => update("key", v)}
                options={[{ value: "true", label: "仅重点商户" }]}
              />
            </>
          ) : (
            <>
              <Selector
                label="工单类型"
                placeholder="类型"
                hasClear
                width={92}
                value={params.get("type")}
                onChange={(v) => update("type", v)}
                options={[
                  { value: "REVIEW", label: "审核" },
                  { value: "QA", label: "抽检" },
                  { value: "RESTRICTED", label: "受限" },
                ]}
              />
              <Selector
                label="优先级"
                placeholder="优先级"
                hasClear
                width={96}
                value={params.get("priority")}
                onChange={(v) => update("priority", v)}
                options={[
                  { value: "HIGH", label: "高" },
                  { value: "NORMAL", label: "常规" },
                  { value: "LOW", label: "低" },
                ]}
              />
              <Selector
                label="注册地"
                placeholder="注册地"
                hasClear
                width={106}
                value={params.get("country")}
                onChange={(v) => update("country", v)}
                options={Object.entries(COUNTRY_NAMES).map(
                  ([value, label]) => ({ value, label }),
                )}
              />
              <Selector
                label="原因"
                placeholder="原因"
                hasClear
                hasSearch
                width={154}
                value={params.get("reasonCode")}
                onChange={(v) => update("reasonCode", v)}
                options={Object.entries(REASONS).map(([value, r]) => ({
                  value,
                  label: r.name,
                }))}
              />
            </>
          )}
        </div>
        <div className="list-toolbar">
          <div className="list-toolbar-actions">
            {sortableColumns.length > 0 && (
              <div className="list-sort-controls">
                <Selector
                  label="排序"
                  isLabelHidden
                  placeholder="默认顺序"
                  width={168}
                  value={activeSort?.sortKey ?? "default"}
                  onChange={(key) => {
                    setSort(
                      key && key !== "default"
                        ? [
                            {
                              sortKey: key,
                              direction: sort[0]?.direction ?? "ascending",
                            },
                          ]
                        : [],
                    );
                    setPage(1);
                  }}
                  options={[
                    { value: "default", label: "默认顺序" },
                    ...sortableColumns.map((column) => ({
                      value: column.key,
                      label: `按${column.key === "C10" ? " SLA 截止时间" : column.key === "supplementProgress" ? "补件截止时间" : COLUMN_DEFINITIONS[column.key].title}`,
                    })),
                  ]}
                />
                <Button
                  label={
                    sort[0]?.direction === "descending"
                      ? "改为升序"
                      : "改为降序"
                  }
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  isDisabled={!activeSort}
                  icon={
                    sort[0]?.direction === "descending" ? (
                      <ArrowDown size={14} />
                    ) : (
                      <ArrowUp size={14} />
                    )
                  }
                  tooltip={
                    !activeSort
                      ? "先选择排序字段"
                      : sort[0].direction === "descending"
                        ? "当前降序，点击改为升序"
                        : "当前升序，点击改为降序"
                  }
                  onClick={() => {
                    setSort((current) =>
                      current.map((entry) => ({
                        ...entry,
                        direction:
                          entry.direction === "ascending"
                            ? "descending"
                            : "ascending",
                      })),
                    );
                    setPage(1);
                  }}
                />
              </div>
            )}
            {manager && (
              <>
                {view !== "extensions" && (
                  <Popover
                    isOpen={assign}
                    onOpenChange={(open) => {
                      if (open) void openAssign();
                      else setAssign(false);
                    }}
                    isEnabled={selected.length > 0}
                    label="指派工单"
                    width={320}
                    content={
                      <div className="stack">
                        <strong>指派 {selected.length} 张工单</strong>
                        <Selector
                          label="处理人"
                          value={assignee}
                          onChange={setAssignee}
                          options={candidates.map((user) => ({
                            value: user.id,
                            label: `${user.name} · ${user.team}`,
                          }))}
                        />
                        <InlineConfirm
                          title="确认指派给所选处理人？"
                          confirmLabel="确认指派"
                          disabled={!assignee}
                          busy={busy}
                          onConfirm={submitAssign}
                        >
                          <Button
                            label="确认指派"
                            variant="primary"
                            isDisabled={!assignee || busy}
                            tooltip={
                              !assignee
                                ? "选择处理人后可指派"
                                : "确认指派所选工单"
                            }
                          />
                        </InlineConfirm>
                      </div>
                    }
                  >
                    <Button
                      label={`指派${selected.length ? ` (${selected.length})` : ""}`}
                      size="sm"
                      icon={<Users size={16} />}
                      isDisabled={!selected.length}
                      tooltip={
                        selected.length
                          ? "指派本组工单"
                          : "选择至少一张可指派工单后可用"
                      }
                    />
                  </Popover>
                )}
                <Button
                  label="导出"
                  variant="ghost"
                  size="sm"
                  icon={<Download size={16} />}
                  onClick={exportRows}
                  isDisabled={!sortedRows.length}
                  tooltip={
                    !sortedRows.length
                      ? "当前没有可导出的工单，调整筛选后可用"
                      : "导出当前筛选工单"
                  }
                />
              </>
            )}
            <Button
              label="列设置"
              variant="secondary"
              size="sm"
              icon={<Columns3 size={16} />}
              onClick={() => setSettingsOpen(true)}
              tooltip="列设置与行密度"
            />
          </div>
        </div>
        <div
          id="queue-results"
          ref={root}
          role="tabpanel"
          aria-labelledby={`queue-tab-${tab}`}
          className="queue-results list-results"
          data-density={density}
        >
          <LoadState
            loading={resource.loading}
            error={resource.error}
            retry={resource.reload}
          >
            <Table<TableQueueRow>
              data={pageRows}
              columns={columns}
              idKey="id"
              density={density}
              hasHover
              textOverflow="truncate"
              rowIndexStart={(currentPage - 1) * pageSize + 1}
              rowCount={sortedRows.length}
              emptyState={
                <Empty
                  title={
                    view === "review"
                      ? activeFilters
                        ? "没有符合条件的工单"
                        : "这个分类下暂时没有工单"
                      : "暂无待处理工单"
                  }
                  description={
                    view === "review" ? (
                      activeFilters ? (
                        <Button label="清除筛选" onClick={clearFilters} />
                      ) : (
                        "新工单进入队列后会显示在这里"
                      )
                    ) : (
                      `当前筛选下暂无工单，今日已处理 ${resource.data?.todayCompleted ?? 0} 张。`
                    )
                  }
                />
              }
              plugins={{
                settings: settingsPlugin,
                ...(manager && view !== "extensions"
                  ? { selection: selectionPlugin }
                  : {}),
                sort: sortPlugin,
                sticky: stickyPlugin,
                navigation: navigationPlugin,
                ...(sortedRows.length > pageSize
                  ? { pagination: paginationPlugin }
                  : {}),
              }}
            />
          </LoadState>
        </div>
        <div className="list-summary">
          共 {sortedRows.length} 条
          {selected.length ? ` · 已选择 ${selected.length} 条` : ""}
          {band && (
            <>
              <span>
                {" "}
                · 已筛选：
                {reviewBands.find((entry) => entry.key === band)?.label}
              </span>
              <Button
                label="清除"
                variant="ghost"
                size="sm"
                onClick={() => update("band", null)}
              />
            </>
          )}
        </div>
      </section>
      <Dialog isOpen={settingsOpen} onOpenChange={setSettingsOpen} width={440}>
        <DialogHeader
          title="列设置"
          subtitle="调整显示字段、顺序与行密度"
          onOpenChange={setSettingsOpen}
        />
        <div className="queue-settings">
          <Selector
            label="行密度"
            value={density}
            onChange={(value) => setDensity(value as typeof density)}
            options={[
              {
                value: "compact",
                label: "紧凑 · 54px",
              },
              { value: "balanced", label: "标准" },
              { value: "spacious", label: "宽松" },
            ]}
          />
          <div className="queue-column-options">
            {[
              ...activeKeys,
              ...availableKeys.filter((key) => !activeKeys.includes(key)),
            ].map((key) => {
              const autoHidden = key === "C09" && uniformStatus;
              const label = autoHidden
                ? "状态（当前页签状态相同，自动隐藏）"
                : (COLUMN_DEFINITIONS[key]?.title ?? "操作");
              const active = !autoHidden && settingsState.isColumnActive(key);
              const index = activeKeys.indexOf(key);
              return (
                <div className="queue-column-option" key={key}>
                  <CheckboxInput
                    label={label}
                    value={active}
                    onChange={() => {
                      const next = active
                        ? activeKeys.filter((value) => value !== key)
                        : [
                            ...activeKeys.filter(
                              (value) =>
                                value !== timingKey && value !== "actions",
                            ),
                            key,
                            ...(availableKeys.includes(timingKey)
                              ? [timingKey]
                              : []),
                            "actions",
                          ];
                      settingsState.setActiveColumnKeys(next);
                    }}
                    isDisabled={
                      autoHidden || !settingsState.isColumnToggleable(key)
                    }
                  />
                  {key !== "C01" &&
                    key !== timingKey &&
                    key !== "actions" &&
                    !autoHidden && (
                      <div className="row">
                        <Button
                          label={`上移${label}`}
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          icon={<ArrowUp size={14} />}
                          isDisabled={!active || index <= 1}
                          tooltip={
                            !active
                              ? "先显示该列后可调整顺序"
                              : index <= 1
                                ? "已是最靠前的可调整列"
                                : "向左移动一列"
                          }
                          onClick={() => moveColumn(key, -1)}
                        />
                        <Button
                          label={`下移${label}`}
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          icon={<ArrowDown size={14} />}
                          isDisabled={
                            !active ||
                            index >= activeKeys.length - pinnedCount - 1
                          }
                          tooltip={
                            !active
                              ? "先显示该列后可调整顺序"
                              : index >= activeKeys.length - pinnedCount - 1
                                ? "已是最靠后的可调整列"
                                : "向右移动一列"
                          }
                          onClick={() => moveColumn(key, 1)}
                        />
                      </div>
                    )}
                </div>
              );
            })}
          </div>
          <div className="row spread">
            <Button
              label="恢复默认"
              variant="ghost"
              onClick={settingsState.resetToDefault}
            />
            <Button
              label="完成"
              variant="primary"
              onClick={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      </Dialog>
      <Confirm
        open={!!extension}
        title="延期审批"
        description={
          approve
            ? `截止日期由 ${dateTime(extension?.extension?.originalDueAt)} 延长至 ${dateTime(extension?.extension?.requestedDueAt)}。`
            : "保留原截止日期，记录不批准原因。"
        }
        merchant={approve ? "补件截止日期更新。" : "补件截止日期不变。"}
        sales="申请继续等待补件。"
        reversible="已生效的延期保留记录，不可删除。"
        confirmLabel={approve ? "批准延期" : "不批准延期"}
        confirmDisabled={!approve && !reason.trim()}
        busy={busy}
        onClose={() => setExtension(undefined)}
        onConfirm={submitExtension}
      >
        <div className="queue-extension-info">
          申请人：
          <PersonName user={extension?.extension?.requestedBy} />
          <br />
          申请原因：{extension?.extension?.reason}
        </div>
        <SegmentedControl
          label="延期审批结果"
          value={approve ? "approve" : "reject"}
          onChange={(value) => setApprove(value === "approve")}
        >
          <SegmentedControlItem value="approve" label="批准" />
          <SegmentedControlItem value="reject" label="不批准" />
        </SegmentedControl>
        {!approve && (
          <TextArea
            label="不批准原因"
            value={reason}
            onChange={setReason}
            isRequired
          />
        )}
      </Confirm>
    </div>
  );
}
