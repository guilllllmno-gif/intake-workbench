import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import {
  DateRangeInput,
  type DateRange,
} from "@astryxdesign/core/DateRangeInput";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import dayjs from "dayjs";
import { api } from "../api";
import { useAsync, useSession } from "../hooks";
import { Empty, LoadState, PageHeading, Panel } from "../ui";
import "./progress-pages.css";

export default function MetricsPage() {
  const { session } = useSession();
  const [filters, setFilters] = useState<{ from?: string; to?: string }>(
    () => ({
      from: dayjs().subtract(29, "day").format("YYYY-MM-DD"),
      to: dayjs().format("YYYY-MM-DD"),
    }),
  );
  const { data, loading, error, reload } = useAsync(
    () => api.metrics(filters, session),
    [filters.from, filters.to, session.role, session.userId],
  );
  const allowed = ["OPS_LEAD", "COMPLIANCE_HEAD", "APPROVER"].includes(
    session.role,
  );
  const reasons = [...(data?.reasons ?? [])].sort((a, b) => b.count - a.count);
  const maxReason = Math.max(1, ...reasons.map((entry) => entry.count));
  const maxDuration = Math.max(
    1,
    ...(data?.duration.map((entry) => entry.count) ?? []),
  );
  const trend =
    data?.trend.filter((point) => point.lossRate !== undefined) ?? [];
  const maxRate = Math.max(
    5,
    Math.ceil(Math.max(0, ...trend.map((point) => point.lossRate!)) / 5) * 5,
  );
  const chart = {
    width: 1000,
    height: 240,
    left: 54,
    right: 26,
    top: 22,
    bottom: 42,
  };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const points = trend.map((point, index) => ({
    ...point,
    x:
      chart.left +
      (trend.length === 1
        ? plotWidth / 2
        : (index / (trend.length - 1)) * plotWidth),
    y: chart.top + (1 - point.lossRate! / maxRate) * plotHeight,
  }));
  return (
    <div className="page stack progress-pages metrics-page">
      <PageHeading
        title="指标看板"
        metadata={
          allowed && filters.from && filters.to
            ? `${filters.from} – ${filters.to}`
            : undefined
        }
      />
      {!allowed ? (
        <Banner status="error" title="无权访问指标看板" />
      ) : (
        <>
          <div className="list-toolbar progress-query-form metrics-toolbar">
            <DateRangeInput
              label="统计日期"
              value={
                filters.from && filters.to
                  ? ({ start: filters.from, end: filters.to } as DateRange)
                  : null
              }
              onChange={(range) =>
                setFilters(range ? { from: range.start, to: range.end } : {})
              }
              placeholder="全部日期"
              presets={[
                {
                  label: "最近 7 天",
                  getRange: () =>
                    ({
                      start: dayjs().subtract(6, "day").format("YYYY-MM-DD"),
                      end: dayjs().format("YYYY-MM-DD"),
                    }) as DateRange,
                },
                {
                  label: "最近 30 天",
                  getRange: () =>
                    ({
                      start: dayjs().subtract(29, "day").format("YYYY-MM-DD"),
                      end: dayjs().format("YYYY-MM-DD"),
                    }) as DateRange,
                },
                {
                  label: "本月",
                  getRange: () =>
                    ({
                      start: dayjs().startOf("month").format("YYYY-MM-DD"),
                      end: dayjs().format("YYYY-MM-DD"),
                    }) as DateRange,
                },
              ]}
            />
          </div>
          <LoadState loading={loading} error={error} retry={reload}>
            {data && (
              <>
                <div className="progress-kpis">
                  {data.cards.slice(0, 4).map((card) => (
                    <Panel key={card.label}>
                      <div className="progress-kpi-label">{card.label}</div>
                      <div className="progress-kpi-value">
                        <strong>{card.value}</strong>
                        <Tooltip content="与上一等长统计周期相比">
                          <span
                            className={
                              card.good
                                ? "progress-positive"
                                : "progress-negative"
                            }
                          >
                            环比 {card.delta}
                          </span>
                        </Tooltip>
                      </div>
                    </Panel>
                  ))}
                </div>
                <div className="progress-charts">
                  <Panel
                    title="工单量排行"
                    actions={
                      <span className="secondary small">按原因 · 单</span>
                    }
                  >
                    {reasons.length ? (
                      <ol
                        className="progress-ranking"
                        aria-label="按原因统计的工单量排行"
                      >
                        {reasons.map((entry) => (
                          <li key={entry.code}>
                            <div className="progress-rank-label">
                              <span>{entry.name}</span>
                              {session.role === "COMPLIANCE_HEAD" && (
                                <span className="secondary progress-code">
                                  {entry.code}
                                </span>
                              )}
                            </div>
                            <Tooltip
                              content={`${entry.name}：${entry.count} 单`}
                            >
                              <div
                                className="progress-bar-track"
                                tabIndex={0}
                                aria-label={`${entry.name}，${entry.count} 单`}
                              >
                                <div
                                  className="progress-bar-fill"
                                  style={{
                                    width: `${(entry.count / maxReason) * 100}%`,
                                  }}
                                />
                              </div>
                            </Tooltip>
                            <strong>
                              {entry.count.toLocaleString("zh-CN")}
                            </strong>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <Empty title="该日期范围内没有工单" />
                    )}
                  </Panel>
                  <Panel
                    title="端到端上线时长分布"
                    actions={
                      <span className="secondary small">申请数 · 单</span>
                    }
                  >
                    {data.duration.some((entry) => entry.count > 0) ? (
                      <div
                        className="progress-histogram"
                        role="img"
                        aria-label={data.duration
                          .map((entry) => `${entry.label}：${entry.count} 单`)
                          .join("；")}
                      >
                        {data.duration.map((entry) => (
                          <div
                            className="progress-hist-column"
                            key={entry.label}
                          >
                            <div className="progress-hist-space">
                              <Tooltip
                                content={`${entry.label}：${entry.count} 单`}
                              >
                                <div
                                  className="progress-hist-bar"
                                  tabIndex={0}
                                  style={{
                                    height: `${(entry.count / maxDuration) * 100}%`,
                                  }}
                                  aria-label={`${entry.label}，${entry.count} 单`}
                                >
                                  <span>{entry.count}</span>
                                </div>
                              </Tooltip>
                            </div>
                            <span>{entry.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty title="该日期范围内没有已上线申请" />
                    )}
                  </Panel>
                </div>
                <Panel
                  title="补件流失率趋势"
                  actions={
                    <div className="row">
                      <span className="secondary small">区间流失率</span>
                      <strong>{data.lossRate.toFixed(1)}%</strong>
                    </div>
                  }
                >
                  {points.length ? (
                    <div className="progress-line-chart">
                      <svg
                        viewBox={`0 0 ${chart.width} ${chart.height}`}
                        role="img"
                        aria-label={`补件流失率：${trend.map((point) => `${point.label} ${point.lossRate!.toFixed(1)}%`).join("，")}`}
                      >
                        {[0, 1, 2, 3, 4].map((step) => {
                          const y = chart.top + (plotHeight * step) / 4;
                          return (
                            <g key={step}>
                              <line
                                x1={chart.left}
                                x2={chart.width - chart.right}
                                y1={y}
                                y2={y}
                                className="progress-chart-grid"
                              />
                              <text
                                x={chart.left - 10}
                                y={y + 4}
                                textAnchor="end"
                              >
                                {(maxRate * (1 - step / 4)).toFixed(1)}%
                              </text>
                            </g>
                          );
                        })}
                        <polyline
                          points={points
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        {points.map((point, index) => (
                          <g key={`${point.label}:${index}`}>
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r="4"
                              fill="currentColor"
                              tabIndex={0}
                              aria-label={`${point.label}，${point.lossRate!.toFixed(1)}%`}
                            >
                              <title>
                                {point.label}：{point.lossRate!.toFixed(1)}%
                              </title>
                            </circle>
                            {(points.length <= 10 ||
                              index % Math.ceil(points.length / 8) === 0 ||
                              index === points.length - 1) && (
                              <text
                                x={point.x}
                                y={chart.height - 14}
                                textAnchor="middle"
                              >
                                {point.label}
                              </text>
                            )}
                          </g>
                        ))}
                      </svg>
                    </div>
                  ) : (
                    <Empty title="该日期范围内没有补件记录" />
                  )}
                </Panel>
              </>
            )}
          </LoadState>
        </>
      )}
    </div>
  );
}
