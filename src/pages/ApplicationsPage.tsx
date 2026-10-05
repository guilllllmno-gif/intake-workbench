import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import {
  DateRangeInput,
  type DateRange,
} from "@astryxdesign/core/DateRangeInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import {
  Table,
  useTablePagination,
  useTableSortable,
  useTableStickyColumns,
  useTableColumnSettings,
  type TablePlugin,
  type TableSortState,
} from "@astryxdesign/core/Table";
import { api } from "../api";
import { COMPLIANCE_ROLES, OPS_ROLES } from "../access";
import { COLUMN_DEFINITIONS, getApplicationColumns } from "../columns";
import { useAsync, useSession } from "../hooks";
import { statusLabel } from "../format";
import { Empty, LoadState, PageHeading, Panel } from "../ui";
import type { ApplicationFilters, ApplicationRow } from "../types";
import "./progress-pages.css";

const stageOptions = [
  { value: "SUBMITTED", label: "提交" },
  { value: "AUTO_CHECK", label: "自动核验" },
  { value: "MANUAL_REVIEW", label: "人工审核" },
  { value: "APPROVAL", label: "审批" },
  { value: "CHANNEL", label: "渠道进件" },
  { value: "LIVE", label: "可交易" },
];
const statuses = [
  "QUEUED",
  "IN_PROGRESS",
  "WAITING_SUPPLEMENT",
  "PENDING_APPROVAL",
  "COMPLIANCE_HOLD",
  "CLOSED",
];
type Row = ApplicationRow & Record<string, unknown>;

function ApplicationFiltersForm({
  filters,
  risk,
  ops,
  onApply,
}: {
  filters: ApplicationFilters;
  risk: boolean;
  ops: boolean;
  onApply: (filters: ApplicationFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const set = (key: keyof ApplicationFilters, value: string | null) =>
    setDraft((previous) => ({ ...previous, [key]: value || undefined }));
  const range =
    draft.from && draft.to
      ? ({ start: draft.from, end: draft.to } as DateRange)
      : null;
  return (
    <form
      className="progress-query-form"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <TextInput
        label="搜索"
        value={draft.search ?? ""}
        onChange={(value) => set("search", value)}
        hasClear
        placeholder="申请号、商户名称、注册号"
        className="progress-search-field"
      />
      <Selector
        label="注册地"
        hasClear
        value={draft.country ?? null}
        onChange={(value) => set("country", value)}
        placeholder="全部"
        options={[
          { value: "GB", label: "英国 GB" },
          { value: "SG", label: "新加坡 SG" },
          { value: "HK", label: "中国香港 HK" },
          { value: "DE", label: "德国 DE" },
        ]}
      />
      <Selector
        label="当前环节"
        hasClear
        value={draft.stage ?? null}
        onChange={(value) => set("stage", value)}
        placeholder="全部"
        options={stageOptions}
      />
      <Selector
        label="对外状态"
        hasClear
        value={draft.externalStatus ?? null}
        onChange={(value) => set("externalStatus", value)}
        placeholder="全部"
        options={["资料待补充", "审核中", "已通过", "未通过"].map((value) => ({
          value,
          label: value,
        }))}
      />
      <DateRangeInput
        label="提交日期"
        value={range}
        onChange={(value) =>
          setDraft((previous) => ({
            ...previous,
            from: value?.start,
            to: value?.end,
          }))
        }
        placeholder="全部日期"
      />
      <Selector
        label="重点商户"
        hasClear
        value={draft.key ?? null}
        onChange={(value) => set("key", value)}
        placeholder="全部"
        options={[
          { value: "true", label: "重点商户" },
          { value: "false", label: "非重点商户" },
        ]}
      />
      {risk && (
        <>
          <Selector
            label="内部状态"
            hasClear
            value={draft.internalStatus ?? null}
            onChange={(value) => set("internalStatus", value)}
            placeholder="全部"
            options={statuses.map((value) => ({
              value,
              label: statusLabel(value),
            }))}
          />
          <Selector
            label="优先级"
            hasClear
            value={draft.priority ?? null}
            onChange={(value) => set("priority", value)}
            placeholder="全部"
            options={[
              { value: "HIGH", label: "高" },
              { value: "NORMAL", label: "常规" },
              { value: "LOW", label: "低" },
            ]}
          />
        </>
      )}
      {ops && (
        <TextInput
          label="渠道"
          value={draft.channel ?? ""}
          hasClear
          onChange={(value) => set("channel", value)}
          placeholder="渠道名称"
        />
      )}
      <div className="row progress-filter-actions">
        <Button label="查询" variant="primary" type="submit" />
        <Button
          label="重置"
          onClick={() => {
            setDraft({});
            onApply({});
          }}
        />
      </div>
    </form>
  );
}

function ApplicationResults({
  rows,
  reload,
}: {
  rows: ApplicationRow[];
  reload: () => void;
}) {
  const { session } = useSession();
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const columns = useMemo(
    () => getApplicationColumns(session.role),
    [session.role],
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<TableSortState>([
    { sortKey: "C36", direction: "descending" },
  ]);
  const [density, setDensity] = useState<"compact" | "balanced" | "spacious">(
    "compact",
  );
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(() =>
    columns.map((column) => column.key),
  );
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        for (const entry of sort) {
          const value = COLUMN_DEFINITIONS[entry.sortKey]?.sort;
          if (!value) continue;
          const delta = value(a) - value(b);
          if (delta) return entry.direction === "ascending" ? delta : -delta;
        }
        return 0;
      }),
    [rows, sort],
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  const pagination = useTablePagination<Row>({
    page: currentPage,
    onPageChange: setPage,
    totalItems: rows.length,
    pageSize,
    onPageSizeChange: (size) => {
      setPageSize(size);
      setPage(1);
    },
    pageSizeOptions: [20, 50, 100],
    label: "申请列表分页",
    align: "end",
  });
  const sortable = useTableSortable<Row>({
    sort,
    onSortChange: (next) => {
      setSort(next);
      setPage(1);
    },
    allowUnsortedState: true,
  });
  const sticky = useTableStickyColumns<Row>({ startKeys: ["C03"] });
  const columnSettings = useTableColumnSettings<Row>({
    columns: columns.map((column) => ({
      key: column.key,
      label: String(column.header),
      isAlwaysVisible: column.key === "C03",
    })),
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const activation: TablePlugin<Row> = {
    transformBodyRow: (props, row) => ({
      ...props,
      htmlProps: {
        ...props.htmlProps,
        className: "progress-clickable-row",
        tabIndex: 0,
        onClick: (event) => {
          if (
            !(event.target as HTMLElement).closest(
              "a,button,input,[role=checkbox]",
            )
          )
            navigate(`/applications/${row.application.id}`);
        },
        onKeyDown: (event) => {
          if (event.target === event.currentTarget && event.key === "Enter")
            navigate(`/applications/${row.application.id}`);
        },
      },
    }),
  };
  return (
    <div ref={root} className="progress-results">
      <Panel
        title="申请列表"
        subtitle={`共 ${rows.length} 笔申请`}
        actions={
          <div className="row progress-table-tools">
            <Selector
              label="密度"
              isLabelHidden
              value={density}
              onChange={(value) => setDensity(value as typeof density)}
              options={[
                { value: "compact", label: "紧凑" },
                { value: "balanced", label: "标准" },
                { value: "spacious", label: "宽松" },
              ]}
            />
            <MultiSelector
              label="显示列"
              isLabelHidden
              value={activeColumnKeys}
              onChange={(keys) =>
                setActiveColumnKeys([
                  "C03",
                  ...keys.filter((key) => key !== "C03"),
                ])
              }
              options={columns.map((column) => ({
                value: column.key,
                label: String(column.header),
              }))}
            />
            <Button
              label="重置列"
              variant="ghost"
              onClick={() =>
                setActiveColumnKeys(columns.map((column) => column.key))
              }
            />
            <Button label="刷新" variant="ghost" onClick={reload} />
            <Button
              label="全屏"
              variant="ghost"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void root.current?.requestFullscreen();
              }}
            />
          </div>
        }
      >
        {rows.length ? (
          <Table<Row>
            aria-label="申请列表"
            data={
              sorted.slice(
                (currentPage - 1) * pageSize,
                currentPage * pageSize,
              ) as Row[]
            }
            columns={columns}
            idKey={(row) => row.application.id}
            density={density}
            hasHover
            textOverflow="truncate"
            rowCount={rows.length}
            rowIndexStart={(currentPage - 1) * pageSize + 1}
            plugins={{
              columnSettings,
              sortable,
              sticky,
              activation,
              ...(rows.length > pageSize ? { pagination } : {}),
            }}
          />
        ) : (
          <Empty
            title="没有符合筛选条件的申请"
            description="请调整筛选条件。"
          />
        )}
      </Panel>
    </div>
  );
}

export default function ApplicationsPage() {
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const risk =
    COMPLIANCE_ROLES.includes(session.role) || session.role === "APPROVER";
  const ops = OPS_ROLES.includes(session.role);
  const filters = useMemo(() => {
    const allowed = [
      "search",
      "country",
      "stage",
      "externalStatus",
      "from",
      "to",
      "key",
    ];
    if (risk) allowed.push("internalStatus", "priority");
    if (ops) allowed.push("channel");
    return Object.fromEntries(
      allowed.flatMap((key) =>
        params.get(key) ? [[key, params.get(key)!]] : [],
      ),
    ) as ApplicationFilters;
  }, [params, risk, ops]);
  const filterKey = JSON.stringify(filters);
  const { data, loading, error, reload } = useAsync(
    () => api.listApplications(filters, session),
    [filterKey, session.role, session.userId],
  );
  return (
    <div className="page stack progress-pages">
      <PageHeading title="申请查询" />
      <Panel>
        <ApplicationFiltersForm
          key={`${session.role}:${filterKey}`}
          filters={filters}
          risk={risk}
          ops={ops}
          onApply={(values) =>
            setParams(
              Object.fromEntries(
                Object.entries(values)
                  .filter(([, value]) => value !== undefined && value !== "")
                  .map(([key, value]) => [key, String(value)]),
              ),
            )
          }
        />
      </Panel>
      <LoadState loading={loading} error={error} retry={reload}>
        <ApplicationResults
          key={`${session.role}:${filterKey}`}
          rows={data ?? []}
          reload={reload}
        />
      </LoadState>
    </div>
  );
}
