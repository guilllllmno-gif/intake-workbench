import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import {
  CheckboxList,
  CheckboxListItem,
} from "@astryxdesign/core/CheckboxList";
import { Dialog } from "@astryxdesign/core/Dialog";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import { Lock } from "lucide-react";
import { CHECK_OPTIONS } from "../catalog";
import { useSession } from "../hooks";
import {
  Badge,
  DialogHeader,
  Empty,
  FileUpload,
  IdText,
  PersonName,
} from "../ui";
import { countryName, dateTime, mccName, statusLabel } from "../format";
import type { CheckItem, Evidence, UploadedFile } from "../types";
import "./evidence.css";

export interface EvidenceDraft {
  hitConclusions: Record<
    string,
    { conclusion: string; reason: string; note?: string }
  >;
  articles: Record<string, { relevance: string; reason: string }>;
  mcc: string;
  uboNames: string;
  remediationItems: string[];
  verificationFiles: UploadedFile[];
}
export const emptyEvidenceDraft = (): EvidenceDraft => ({
  hitConclusions: {},
  articles: {},
  mcc: "",
  uboNames: "",
  remediationItems: [],
  verificationFiles: [],
});
type Row = {
  field: string;
  declared: unknown;
  evidence: unknown;
  source?: string;
  difference?: string;
  tolerance?: string;
  region?: { x: number; y: number; width: number; height: number };
  fileId?: string;
};
type ReportPerson = {
  name: string;
  role: string;
  ownershipPct?: number;
  startDate?: string;
  endDate?: string;
  source?: string;
};
type OwnershipNode = {
  id: string;
  name: string;
  parentId?: string;
  ownershipPct: number;
  type: string;
  verified: boolean;
};
type WatchHit = {
  id: string;
  name: string;
  listName: string;
  source?: string;
  program?: string;
  strength: string;
  listedAt?: string;
  aliases?: string[];
  country?: string;
  registrationNo?: string;
  incorporatedAt?: string;
};
type Article = {
  id: string;
  title: string;
  source: string;
  date: string;
  topic: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  url?: string;
};
const text = (value: unknown): string =>
  value == null || value === ""
    ? "—"
    : Array.isArray(value)
      ? value.join("、")
      : String(value);
const comparable = (value: unknown) =>
  text(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
const missing = (value: unknown) =>
  value == null || value === "" || (Array.isArray(value) && !value.length);
const rowMatches = (row: Row) =>
  !missing(row.declared) &&
  !missing(row.evidence) &&
  comparable(row.declared) === comparable(row.evidence);
const tokens = (value: string) =>
  value.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [];
function Difference({ value, against }: { value: unknown; against: unknown }) {
  const other = new Set(
    tokens(text(against)).map((part) => part.toLocaleLowerCase()),
  );
  return (
    <>
      {tokens(text(value)).map((part, index) =>
        /[\p{L}\p{N}]/u.test(part) && !other.has(part.toLocaleLowerCase()) ? (
          <mark key={index}>{part}</mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
function Comparison({
  rows,
  left = "申报值",
  right = "证据值",
  detail = false,
  matchedFields = [],
  fieldLink,
}: {
  rows: Row[];
  left?: string;
  right?: string;
  detail?: boolean;
  matchedFields?: string[];
  fieldLink?: {
    active: string;
    onHighlight: (field: string) => void;
    onLocate: (field: string) => void;
    register: (field: string, element: HTMLDivElement | null) => void;
  };
}) {
  const differences: Row[] = [];
  const matches: Row[] = [];
  for (const row of rows) {
    (rowMatches(row) ? matches : differences).push(row);
  }
  const renderRow = (row: Row) => {
    const declaredMissing = missing(row.declared);
    const evidenceMissing = missing(row.evidence);
    const matches = rowMatches(row);
    const status =
      declaredMissing && evidenceMissing
        ? "双方均无记录"
        : declaredMissing
          ? `${left}缺失`
          : evidenceMissing
            ? `${right}缺失`
            : matches
              ? "一致"
              : "内容不一致";
    return (
      <div className="ev-compare-row" data-different={!matches} key={row.field}>
        <div className="ev-compare-heading">
          {fieldLink && row.region ? (
            <div
              data-ev-field={row.field}
              ref={(element) => fieldLink.register(row.field, element)}
            >
              <Button
                label={row.field}
                size="sm"
                variant="ghost"
                aria-label={`定位原图中的${row.field}`}
                aria-pressed={fieldLink.active === row.field}
                onClick={() => fieldLink.onLocate(row.field)}
              />
            </div>
          ) : (
            <strong>{row.field}</strong>
          )}
          <Badge tone={matches ? "neutral" : "warning"}>{status}</Badge>
        </div>
        <dl className="ev-compare-values">
          <div>
            <dt>{left}</dt>
            <dd
              className={
                matchedFields.includes(row.field) ? "ev-match" : undefined
              }
            >
              {declaredMissing ? (
                "无记录"
              ) : (
                <Difference value={row.declared} against={row.evidence} />
              )}
            </dd>
          </div>
          <div>
            <dt>{right}</dt>
            <dd
              className={
                matchedFields.includes(row.field) ? "ev-match" : undefined
              }
            >
              {evidenceMissing ? (
                "无记录"
              ) : (
                <Difference value={row.evidence} against={row.declared} />
              )}
            </dd>
          </div>
        </dl>
        {detail && (row.difference || row.tolerance) && (
          <p className="ev-compare-note">
            {row.difference && <span>差异说明：{row.difference}</span>}
            {row.tolerance && <span>核对要求：{row.tolerance}</span>}
          </p>
        )}
        {row.source && (
          <p className="ev-field-source">证据来源：{row.source}</p>
        )}
      </div>
    );
  };
  return (
    <div
      className="ev-comparison"
      onMouseOver={
        fieldLink
          ? (event) => {
              const marker = (event.target as HTMLElement)
                .closest(".ev-compare-row")
                ?.querySelector<HTMLElement>("[data-ev-field]");
              if (marker?.dataset.evField)
                fieldLink.onHighlight(marker.dataset.evField);
            }
          : undefined
      }
      onFocus={
        fieldLink
          ? (event) => {
              const marker = (event.target as HTMLElement).closest(
                "[data-ev-field]",
              ) as HTMLElement | null;
              if (marker?.dataset.evField)
                fieldLink.onHighlight(marker.dataset.evField);
            }
          : undefined
      }
    >
      <div className="ev-block-heading">
        <h4>字段比对</h4>
        <p>
          {left}与{right} · {rows.length} 项字段，{differences.length}{" "}
          项差异或缺失
        </p>
      </div>
      {!!differences.length && (
        <div className="ev-compare-list">{differences.map(renderRow)}</div>
      )}
      {!!matches.length && (
        <details className="ev-context-disclosure">
          <summary>
            一致字段（{matches.length} 项）<span>展开查看完整比对</span>
          </summary>
          <div className="ev-compare-list">{matches.map(renderRow)}</div>
        </details>
      )}
      {!rows.length && <p className="ev-secondary">暂无可比对字段</p>}
    </div>
  );
}
const entityRows = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Row[] =>
  [
    ["名称", "name"],
    ["别名", "aliases"],
    ["国家", "country"],
    ["注册号", "registrationNo"],
    ["成立日期", "incorporatedAt"],
  ].map(([field, key]) => ({
    field,
    declared:
      key === "country" && a[key] ? countryName(String(a[key])) : a[key],
    evidence:
      key === "country" && b[key] ? countryName(String(b[key])) : b[key],
  }));
const safeUrl = (url?: string) =>
  !!url &&
  /^(https?:|data:image\/|data:application\/pdf|blob:|\/(?![\/\\]))/i.test(url);
function EvidenceFacts({
  entries,
}: {
  entries: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="ev-facts">
      {entries.map(({ label, value }, index) => (
        <div key={`${label}-${index}`}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function EvidenceImage({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ev-image">
      <img src={url} alt={label} loading="lazy" />
      <Button
        label="放大"
        aria-label={`放大 ${label}`}
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={setOpen} width={880}>
        <DialogHeader title={label} onOpenChange={setOpen} />
        <div className="ev-image-preview">
          <img src={url} alt={label} />
        </div>
      </Dialog>
    </div>
  );
}
export function FileSpecimen({ file }: { file: UploadedFile }) {
  const [open, setOpen] = useState(false);
  const candidate =
    file.url ?? (file.content?.startsWith("data:") ? file.content : undefined);
  const url = safeUrl(candidate) ? candidate : undefined;
  const content = (
    <div className="ev-file-content">
      {url && file.type.startsWith("image/") ? (
        <img src={url} alt={file.name} />
      ) : url && file.type === "application/pdf" ? (
        <iframe title={file.name} src={url} className="ev-pdf" />
      ) : (
        <p className="ev-file-text">
          {file.content || "当前文件未提供页面预览"}
        </p>
      )}
    </div>
  );
  return (
    <>
      <Card padding={3} className="ev-file">
        <div className="ev-card-heading">
          <h4>{file.name}</h4>
          <Button
            label="放大"
            aria-label={`放大 ${file.name}`}
            size="sm"
            variant="secondary"
            onClick={() => setOpen(true)}
          />
        </div>
        {content}
        <div className="ev-file-meta">
          <span>
            {file.pages ?? 1} 页 · {(file.size / 1024).toFixed(1)} KB
          </span>
          <span>
            <PersonName user={file.uploadedBy} /> · {dateTime(file.uploadedAt)}
          </span>
        </div>
      </Card>
      <Dialog isOpen={open} onOpenChange={setOpen} width={880}>
        <DialogHeader title={file.name} onOpenChange={setOpen} />
        {content}
      </Dialog>
    </>
  );
}
function Documents({ files }: { files?: UploadedFile[] }) {
  return files?.length ? (
    <div className="ev-documents">
      {files.map((file) => (
        <FileSpecimen file={file} key={file.id} />
      ))}
    </div>
  ) : null;
}

function ReasonChoices({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (options.length >= 5)
    return (
      <Selector
        label={`${label}（必选）`}
        value={value || undefined}
        options={options.map((option) => ({ value: option, label: option }))}
        isDisabled={disabled}
        onChange={onChange}
      />
    );
  return (
    <fieldset className="ev-reasons" disabled={disabled}>
      <legend>{label}（必选）</legend>
      <div className="ev-reason-tags">
        {options.map((option) => (
          <Button
            key={option}
            label={option}
            size="sm"
            variant="secondary"
            aria-pressed={value === option}
            isDisabled={disabled}
            onClick={() => onChange(option)}
          />
        ))}
      </div>
      {!options.length && (
        <p className="ev-secondary">先选择处置结论，再选择原因。</p>
      )}
    </fieldset>
  );
}

const strongHit = (hit: WatchHit) => /strong|high|强/i.test(hit.strength);
const strengthLabel = (hit: WatchHit) =>
  strongHit(hit)
    ? "强匹配"
    : /medium|中/i.test(hit.strength)
      ? "中匹配"
      : /low|weak|弱/i.test(hit.strength)
        ? "弱匹配"
        : "匹配强度未提供";

function WatchlistEvidence({
  source,
  decisions,
  onChange,
  readOnly,
  senior,
}: {
  source: Evidence;
  decisions: EvidenceDraft["hitConclusions"];
  onChange: (decisions: EvidenceDraft["hitConclusions"]) => void;
  readOnly: boolean;
  senior: boolean;
}) {
  const panelId = useId();
  const [active, setActive] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [message, setMessage] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const hits: WatchHit[] = source.fields.hits ?? [];
  const activeHit = hits.find((hit) => hit.id === active) ?? hits[0];
  const eligible = hits.filter((hit) =>
    /^(medium|low|weak|中|弱)(匹配)?$/i.test(hit.strength),
  );
  const selectedEligible = eligible.filter((hit) => selected.includes(hit.id));
  const options = CHECK_OPTIONS.SCREENING_WATCHLIST;
  const falseReasons =
    options.find((option) => option.value === "FALSE_POSITIVE")?.reasons ?? [];
  const complete = (hit: WatchHit) => {
    const decision = decisions[hit.id];
    return (
      decision?.conclusion &&
      decision.reason &&
      (!(
        decision.reason === "其他" ||
        (strongHit(hit) && decision.conclusion === "FALSE_POSITIVE")
      ) ||
        decision.note?.trim())
    );
  };
  return (
    <>
      <div className="ev-watch-toolbar">
        <span aria-live="polite">
          潜在命中 {hits.length} 项 ·{" "}
          {hits.every(complete) ? "已完成" : "未完成"}{" "}
          {hits.filter(complete).length}/{hits.length}
        </span>
        {hits.length > 1 && (
          <Button
            label="批量处置"
            size="sm"
            variant="secondary"
            aria-expanded={bulkOpen}
            aria-controls={`${panelId}-bulk`}
            onClick={() => setBulkOpen(!bulkOpen)}
          />
        )}
      </div>
      {hits.length > 1 && bulkOpen && (
        <Card padding={3} className="ev-bulk-hits" id={`${panelId}-bulk`}>
          <h4 className="ev-card-title">批量判为误命中</h4>
          <p className="ev-secondary">
            仅弱匹配和中匹配可多选；强匹配必须逐项审核。应用会覆盖所选命中的草稿处置，不会直接提交。
          </p>
          <CheckboxList
            label="选择名单命中"
            value={selected}
            isDisabled={readOnly}
            density="compact"
            onChange={(ids) =>
              setSelected(
                ids.filter((id) => eligible.some((hit) => hit.id === id)),
              )
            }
          >
            {hits.map((hit) => (
              <CheckboxListItem
                key={hit.id}
                value={hit.id}
                label={`${hit.name} · ${hit.listName} · ${strengthLabel(hit)}${strongHit(hit) ? "（不可批量处理）" : ""}`}
                isDisabled={
                  !eligible.some((candidate) => candidate.id === hit.id)
                }
              />
            ))}
          </CheckboxList>
          <ReasonChoices
            label="统一误命中原因"
            value={bulkReason}
            options={falseReasons}
            disabled={readOnly}
            onChange={setBulkReason}
          />
          <Button
            label={`将所选 ${selectedEligible.length} 项判为误命中`}
            variant="secondary"
            isDisabled={
              readOnly ||
              !selectedEligible.length ||
              !falseReasons.includes(bulkReason)
            }
            tooltip={
              readOnly
                ? "当前证据只读"
                : !selectedEligible.length
                  ? "先选择弱匹配或中匹配命中"
                  : !bulkReason
                    ? "必须选择统一的误命中原因"
                    : "应用到所选命中的草稿"
            }
            onClick={() => {
              if (
                readOnly ||
                !selectedEligible.length ||
                !falseReasons.includes(bulkReason)
              )
                return;
              const next = { ...decisions };
              for (const hit of selectedEligible)
                next[hit.id] = {
                  conclusion: "FALSE_POSITIVE",
                  reason: bulkReason,
                };
              onChange(next);
              setMessage(
                `已将 ${selectedEligible.length} 项命中标为误命中，原因：${bulkReason}。提交本项后生效。`,
              );
              setSelected([]);
            }}
          />
          <p className="ev-secondary" role="status">
            {message}
          </p>
        </Card>
      )}
      {activeHit && (
        <TabList
          value={activeHit.id}
          onChange={setActive}
          role="tablist"
          aria-label="潜在名单命中"
          hasDivider
          size="sm"
        >
          {hits.map((hit) => (
            <Tab
              key={hit.id}
              value={hit.id}
              label={hit.name}
              panelId={`${panelId}-${hit.id}`}
              endContent={
                <span className="ev-inline">
                  <Badge>{strengthLabel(hit)}</Badge>
                  {complete(hit) ? (
                    <Badge tone="success">已判断</Badge>
                  ) : decisions[hit.id]?.conclusion ? (
                    <Badge tone="warning">待补原因</Badge>
                  ) : null}
                </span>
              }
            />
          ))}
        </TabList>
      )}
      {hits.map((hit) => {
        const decision = decisions[hit.id] ?? { conclusion: "", reason: "" };
        const strong = strongHit(hit);
        const needsNote =
          decision.reason === "其他" ||
          (strong && decision.conclusion === "FALSE_POSITIVE");
        return (
          <section
            key={hit.id}
            id={`${panelId}-${hit.id}`}
            role="tabpanel"
            aria-label={hit.name}
            hidden={hit.id !== activeHit?.id}
            className="ev-hit-panel"
          >
            <EvidenceFacts
              entries={[
                {
                  label: "名单来源",
                  value: hit.listName,
                },
                { label: "名单项目", value: text(hit.program ?? hit.listName) },
                { label: "列入日期", value: text(hit.listedAt) },
                {
                  label: "匹配强度",
                  value: <Badge>{strengthLabel(hit)}</Badge>,
                },
              ]}
            />
            <Comparison
              left="申请主体"
              right="名单记录"
              rows={entityRows(source.fields.subject ?? {}, hit)}
            />
            <div className="ev-form">
              <RadioList
                label="命中处置"
                orientation="horizontal"
                value={decision.conclusion}
                isDisabled={readOnly}
                onChange={(conclusion) =>
                  onChange({
                    ...decisions,
                    [hit.id]: { conclusion, reason: "" },
                  })
                }
              >
                {options.map((option) => (
                  <RadioListItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                    isDisabled={
                      strong && !senior && option.value === "FALSE_POSITIVE"
                    }
                  />
                ))}
              </RadioList>
              <ReasonChoices
                label="处置原因"
                value={decision.reason}
                options={
                  options.find((option) => option.value === decision.conclusion)
                    ?.reasons ?? []
                }
                disabled={readOnly || !decision.conclusion}
                onChange={(reason) =>
                  onChange({ ...decisions, [hit.id]: { ...decision, reason } })
                }
              />
              {needsNote && (
                <TextArea
                  label="处置说明（必填）"
                  rows={3}
                  value={decision.note ?? ""}
                  isReadOnly={readOnly}
                  placeholder={
                    strong
                      ? "说明为何排除强匹配，并列明核验依据"
                      : "说明具体处置依据"
                  }
                  onChange={(note) =>
                    onChange({ ...decisions, [hit.id]: { ...decision, note } })
                  }
                />
              )}
            </div>
            {strong && (
              <p className="ev-secondary">
                {senior
                  ? "强匹配不可批量处置；判为误命中须逐项填写核验说明。"
                  : "强匹配误命中须由资深合规或合规负责人判断。"}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

function DataMatchViewer({
  rows,
  files = [],
}: {
  rows: Row[];
  files?: UploadedFile[];
}) {
  const [active, setActive] = useState("");
  const [zoom, setZoom] = useState(100);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const regionRefs = useRef(new Map<string, HTMLButtonElement>());
  const locateSource = (field: string) => {
    setActive(field);
    regionRefs.current
      .get(field)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const locate = (field: string) => {
    setActive(field);
    const row = rowRefs.current.get(field);
    const disclosure = row?.closest("details");
    if (disclosure) disclosure.open = true;
    row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    row?.querySelector("button")?.focus({ preventScroll: true });
  };
  return (
    <div className="ev-linked-viewer">
      <p className="ev-secondary">
        悬停或聚焦字段以高亮原图；点击原图标记可定位比对行。键盘可用 Tab
        切换字段，Enter 定位。
      </p>
      <Comparison
        rows={rows}
        detail
        fieldLink={{
          active,
          onHighlight: setActive,
          onLocate: locateSource,
          register: (field, element) => {
            if (element) rowRefs.current.set(field, element);
            else rowRefs.current.delete(field);
          },
        }}
      />
      {!!files.length && (
        <div className="ev-zoom-toolbar" role="group" aria-label="文件缩放">
          <Button
            label="缩小"
            size="sm"
            variant="secondary"
            isDisabled={zoom <= 100}
            onClick={() => setZoom((value) => Math.max(100, value - 25))}
          />
          <span aria-live="polite">{zoom}%</span>
          <Button
            label="放大"
            size="sm"
            variant="secondary"
            isDisabled={zoom >= 250}
            onClick={() => setZoom((value) => Math.min(250, value + 25))}
          />
          <Button
            label="重置"
            size="sm"
            variant="ghost"
            onClick={() => setZoom(100)}
          />
        </div>
      )}
      <div className="ev-linked-documents">
        {files.map((file, fileIndex) => {
          const candidate =
            file.url ??
            (file.content?.startsWith("data:") ? file.content : undefined);
          if (!safeUrl(candidate) || !file.type.startsWith("image/"))
            return <FileSpecimen key={file.id} file={file} />;
          const linkedRows = rows.filter(
            (row) =>
              row.region &&
              (row.fileId ? row.fileId === file.id : fileIndex === 0),
          );
          return (
            <div key={file.id} className="ev-linked-file">
              <h4 className="ev-card-title">{file.name}</h4>
              <div className="ev-linked-scroll">
                <div className="ev-region-canvas" style={{ width: `${zoom}%` }}>
                  <img src={candidate} alt={file.name} />
                  {linkedRows.map((row) => {
                    const region = row.region!;
                    return (
                      <Button
                        key={row.field}
                        label={row.field}
                        aria-label={`原图${row.field}，定位比对行`}
                        aria-pressed={active === row.field}
                        className={`ev-region${active === row.field ? " is-active" : ""}`}
                        style={{
                          left: `${region.x}%`,
                          top: `${region.y}%`,
                          width: `${region.width}%`,
                          height: `${region.height}%`,
                        }}
                        ref={(element) => {
                          if (element)
                            regionRefs.current.set(row.field, element);
                          else regionRefs.current.delete(row.field);
                        }}
                        onFocus={() => setActive(row.field)}
                        onMouseEnter={() => setActive(row.field)}
                        onClick={() => locate(row.field)}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="ev-file-meta">
                <span>
                  {file.pages ?? 1} 页 · {(file.size / 1024).toFixed(1)} KB
                </span>
                <span>
                  <PersonName user={file.uploadedBy} /> ·{" "}
                  {dateTime(file.uploadedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type IdentityCheck = {
  name: string;
  passed: boolean;
  reason?: string;
  mediaId?: string;
  region?: { x: number; y: number; width: number; height: number };
};

function MediaCard({
  evidence,
  media,
  onMedia,
  zoom = 100,
  rotation = 0,
}: {
  evidence: Evidence;
  media: Evidence["mediaRefs"][number];
  onMedia?: (id: string, mediaId: string) => Promise<void>;
  zoom?: number;
  rotation?: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<{
    evidenceId: string;
    media: typeof media;
  }>();
  useEffect(() => {
    setRevealed((previous) =>
      media.url
        ? { evidenceId: evidence.id, media }
        : previous?.evidenceId === evidence.id && previous.media.id === media.id
          ? previous
          : undefined,
    );
  }, [evidence.id, media]);
  const shown =
    media.url ||
    revealed?.evidenceId !== evidence.id ||
    revealed.media.id !== media.id
      ? media
      : revealed.media;
  const failures = ((evidence.fields.checks ?? []) as IdentityCheck[]).filter(
    (check) => !check.passed && check.mediaId === media.id && check.region,
  );
  return (
    <div className="ev-media-card">
      <h4 className="ev-card-title">{media.label}</h4>
      {shown.url && safeUrl(shown.url) ? (
        <div className="ev-identity-viewport">
          <div
            className="ev-identity-canvas"
            style={{ width: `${zoom}%`, transform: `rotate(${rotation}deg)` }}
          >
            <img src={shown.url} alt={media.label} />
            {failures.map((check) => (
              <span
                key={check.name}
                className="ev-identity-region"
                tabIndex={0}
                aria-label={`${check.name}失败：${check.reason ?? "需人工核验"}`}
                title={`${check.name}：${check.reason ?? "需人工核验"}`}
                style={{
                  left: `${check.region!.x}%`,
                  top: `${check.region!.y}%`,
                  width: `${check.region!.width}%`,
                  height: `${check.region!.height}%`,
                }}
              >
                <span>{check.name}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="ev-masked">
          <Lock size={24} aria-hidden="true" />
          <span>影像已脱敏</span>
          {onMedia && (
            <Button
              label="查看原图"
              variant="secondary"
              isLoading={pending}
              onClick={async () => {
                setPending(true);
                setError("");
                try {
                  await onMedia(evidence.id, media.id);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "原图加载失败，请重试",
                  );
                } finally {
                  setPending(false);
                }
              }}
            />
          )}
        </div>
      )}
      {shown.file && (
        <p className="ev-secondary">
          {shown.file.name} · {shown.file.pages ?? 1} 页 ·{" "}
          {dateTime(shown.file.uploadedAt)}
        </p>
      )}
      {error && (
        <p className="ev-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function IdentityViewer({
  evidence,
  onMedia,
}: {
  evidence: Evidence;
  onMedia?: (id: string, mediaId: string) => Promise<void>;
}) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const front =
    evidence.mediaRefs.find((media) => /正面|front/i.test(media.label)) ??
    evidence.mediaRefs[0];
  const selfie = evidence.mediaRefs.find((media) =>
    /自拍|selfie/i.test(media.label),
  );
  const remaining = evidence.mediaRefs.filter(
    (media) => media !== front && media !== selfie,
  );
  const checks = [...((evidence.fields.checks ?? []) as IdentityCheck[])].sort(
    (a, b) => Number(a.passed) - Number(b.passed),
  );
  return (
    <>
      {checks.some((check) => !check.passed) && (
        <div className="ev-identity-failure-summary" role="status">
          <strong>检查失败</strong>
          {checks
            .filter((check) => !check.passed)
            .map((check) => (
              <span key={check.name}>
                {check.name}：{check.reason ?? "需人工核验"}
              </span>
            ))}
        </div>
      )}
      <div className="ev-zoom-toolbar" role="group" aria-label="影像同步缩放">
        <strong>同步缩放</strong>
        <Button
          label="缩小"
          size="sm"
          variant="secondary"
          isDisabled={zoom <= 100}
          onClick={() => setZoom((value) => Math.max(100, value - 25))}
        />
        <span aria-live="polite">{zoom}%</span>
        <Button
          label="放大"
          size="sm"
          variant="secondary"
          isDisabled={zoom >= 300}
          onClick={() => setZoom((value) => Math.min(300, value + 25))}
        />
        <Button
          label="旋转"
          size="sm"
          variant="secondary"
          onClick={() => setRotation((value) => (value + 90) % 360)}
        />
        <Button
          label="重置"
          size="sm"
          variant="ghost"
          onClick={() => {
            setZoom(100);
            setRotation(0);
          }}
        />
      </div>
      <div className="ev-media-grid ev-identity-pair">
        {front && (
          <MediaCard
            evidence={evidence}
            media={front}
            onMedia={onMedia}
            zoom={zoom}
            rotation={rotation}
          />
        )}
        {selfie && (
          <MediaCard
            evidence={evidence}
            media={selfie}
            onMedia={onMedia}
            zoom={zoom}
            rotation={rotation}
          />
        )}
      </div>
      {remaining.map((media) => (
        <details className="ev-identity-extra" key={media.id}>
          <summary>{media.label}</summary>
          <MediaCard
            evidence={evidence}
            media={media}
            onMedia={onMedia}
            zoom={zoom}
            rotation={rotation}
          />
        </details>
      ))}
      <div className="ev-identity-checks" aria-label="影像检查结果，失败优先">
        {checks.map((check) => (
          <details
            key={check.name}
            className={`ev-identity-check${check.passed ? "" : " is-failed"}`}
            open={!check.passed}
          >
            <summary>
              <span>{check.name}</span>
              <Badge tone={check.passed ? "success" : "danger"}>
                {check.passed ? "通过" : "失败"}
              </Badge>
            </summary>
            <p>{text(check.reason)}</p>
          </details>
        ))}
      </div>
    </>
  );
}
function Screenshots({
  screenshots,
}: {
  screenshots?: { title: string; url: string }[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected == null ? undefined : screenshots?.[selected];
  return screenshots?.length ? (
    <>
      <div className="ev-screenshots">
        {screenshots.map((shot, index) => (
          <figure key={`${shot.title}-${index}`}>
            <div className="ev-image">
              <img src={shot.url} alt={shot.title} loading="lazy" />
              <Button
                label="放大"
                aria-label={`放大 ${shot.title}`}
                variant="secondary"
                size="sm"
                onClick={() => setSelected(index)}
              />
            </div>
            <figcaption>{shot.title}</figcaption>
          </figure>
        ))}
      </div>
      <Dialog
        isOpen={!!active}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        width={880}
      >
        <DialogHeader
          title={active?.title ?? "网站截图"}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
        {active && (
          <div className="ev-image-preview">
            <img src={active.url} alt={active.title} />
          </div>
        )}
        <div className="ev-preview-navigation">
          <Button
            label="上一张"
            variant="secondary"
            isDisabled={selected == null || selected === 0}
            onClick={() =>
              setSelected((current) =>
                current == null ? null : Math.max(0, current - 1),
              )
            }
          />
          <span className="secondary">
            {selected == null ? 0 : selected + 1} / {screenshots.length}
          </span>
          <Button
            label="下一张"
            variant="secondary"
            isDisabled={selected == null || selected >= screenshots.length - 1}
            onClick={() =>
              setSelected((current) =>
                current == null
                  ? null
                  : Math.min(screenshots.length - 1, current + 1),
              )
            }
          />
        </div>
      </Dialog>
    </>
  ) : (
    <Empty title="暂无网站截图" />
  );
}
export const MCC_CHOICES = [
  { value: "5712", label: "5712 家具店 · 常规", risk: "常规" },
  { value: "5719", label: "5719 家居用品 · 常规", risk: "常规" },
  { value: "5732", label: "5732 电子产品 · 常规", risk: "常规" },
  { value: "5734", label: "5734 软件 · 常规", risk: "常规" },
  { value: "5999", label: "5999 其他零售 · 常规", risk: "常规" },
  { value: "4722", label: "4722 旅行社 · 高", risk: "高" },
  { value: "5815", label: "5815 数字内容 · 高", risk: "高" },
  { value: "7995", label: "7995 博彩 · 禁入", risk: "禁入" },
  { value: "5499", label: "5499 食品零售 · 常规", risk: "常规" },
  { value: "5977", label: "5977 化妆品 · 常规", risk: "常规" },
  { value: "7333", label: "7333 商业设计 · 常规", risk: "常规" },
];
export default function EvidencePanel({
  evidence,
  item,
  draft,
  onDraft,
  onMedia,
  onReadingChange,
  readOnly = false,
  canDismissStrong,
}: {
  evidence: Evidence[];
  item: CheckItem;
  draft: EvidenceDraft;
  onDraft: (draft: EvidenceDraft) => void;
  onMedia?: (id: string, mediaId: string) => Promise<void>;
  onReadingChange?: (reading: boolean) => void;
  readOnly?: boolean;
  canDismissStrong?: boolean;
}) {
  const { session } = useSession();
  const senior =
    canDismissStrong ??
    ["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"].includes(session.role);
  const sources = evidence.filter((source) =>
    item.evidenceIds.includes(source.id),
  );
  const update = (patch: Partial<EvidenceDraft>) =>
    onDraft({ ...draft, ...patch });
  if (!sources.length) return <Empty title="当前检查项暂无可用证据" />;
  const render = (source: Evidence): ReactNode => {
    const fields = source.fields;
    switch (source.kind) {
      case "DATA_MATCH": {
        const registry = fields.registry as Record<string, unknown> | undefined;
        const registryLabels: Record<string, string> = {
          authority: "登记机构",
          registrationAuthority: "登记机构",
          name: "法定名称",
          legalName: "法定名称",
          registrationNo: "公司编号",
          status: "登记状态",
          incorporatedAt: "成立日期",
          address: "注册地址",
          registeredAddress: "注册地址",
          directors: "董事",
        };
        return (
          <>
            <DataMatchViewer
              key={source.id}
              rows={fields.rows ?? []}
              files={fields.documents}
            />
            {registry && (
              <section className="ev-registry">
                <h4 className="ev-card-title">登记摘要</h4>
                <EvidenceFacts
                  entries={Object.entries(registry).map(([key, value]) => ({
                    label: registryLabels[key] ?? key,
                    value:
                      key === "status"
                        ? statusLabel(String(value ?? ""))
                        : text(value),
                  }))}
                />
              </section>
            )}
          </>
        );
      }
      case "SCREENING_WATCHLIST":
        return (
          <WatchlistEvidence
            key={source.id}
            source={source}
            decisions={draft.hitConclusions}
            onChange={(hitConclusions) => update({ hitConclusions })}
            readOnly={readOnly}
            senior={senior}
          />
        );
      case "SCREENING_MEDIA": {
        const ranks: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const articles: Article[] = [...(fields.articles ?? [])].sort(
          (a, b) =>
            (ranks[b.severity] ?? 0) - (ranks[a.severity] ?? 0) ||
            String(b.date).localeCompare(String(a.date)),
        );
        return (
          <div className="ev-articles">
            {articles.map((article) => {
              const decision = draft.articles[article.id] ?? {
                relevance: "",
                reason: "",
              };
              return (
                <article className="ev-article" key={article.id}>
                  <div className="ev-inline">
                    <h4>{article.title}</h4>
                    <Badge
                      tone={
                        article.severity === "HIGH"
                          ? "danger"
                          : article.severity === "MEDIUM"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {
                        { HIGH: "高", MEDIUM: "中", LOW: "低" }[
                          article.severity
                        ]
                      }
                    </Badge>
                  </div>
                  <div className="ev-secondary">
                    {article.source} · {article.date} · {article.topic}
                  </div>
                  <p>{article.summary}</p>
                  {safeUrl(article.url) && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看原文
                    </a>
                  )}
                  <div className="ev-form">
                    <RadioList
                      label="相关性"
                      value={decision.relevance}
                      orientation="horizontal"
                      isDisabled={readOnly}
                      onChange={(relevance) =>
                        update({
                          articles: {
                            ...draft.articles,
                            [article.id]: { relevance, reason: "" },
                          },
                        })
                      }
                    >
                      <RadioListItem value="UNRELATED" label="不相关" />
                      <RadioListItem value="RELATED" label="相关" />
                    </RadioList>
                    {decision.relevance === "UNRELATED" && (
                      <ReasonChoices
                        label="不相关原因"
                        value={decision.reason}
                        disabled={readOnly}
                        options={CHECK_OPTIONS.SCREENING_MEDIA[0].reasons}
                        onChange={(reason) =>
                          update({
                            articles: {
                              ...draft.articles,
                              [article.id]: { ...decision, reason },
                            },
                          })
                        }
                      />
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        );
      }
      case "IDENTITY_MEDIA":
        return (
          <>
            <EvidenceFacts
              entries={[
                { label: "证件类型", value: text(fields.document?.type) },
                {
                  label: "签发国",
                  value: countryName(fields.document?.country),
                },
                { label: "号码后四位", value: text(fields.document?.lastFour) },
                { label: "有效期", value: text(fields.document?.expiresAt) },
              ]}
            />
            <IdentityViewer
              key={source.id}
              evidence={source}
              onMedia={onMedia}
            />
          </>
        );
      case "ASSOCIATED_PERSONS": {
        const declared: ReportPerson[] = fields.declared ?? [];
        const reported: ReportPerson[] = fields.reported ?? [];
        const names = [
          ...new Set([...declared, ...reported].map((person) => person.name)),
        ];
        const pairs = names.map((name) => {
          const applicant = declared.find((value) => value.name === name);
          const report = reported.find((value) => value.name === name);
          const differences: string[] = [];
          if (applicant && report) {
            if (comparable(applicant.role) !== comparable(report.role))
              differences.push("身份 / 职务");
            if (applicant.ownershipPct !== report.ownershipPct)
              differences.push("持股比例");
            if (
              comparable(applicant.startDate) !== comparable(report.startDate)
            )
              differences.push("任职开始日期");
            if (comparable(applicant.endDate) !== comparable(report.endDate))
              differences.push("任职结束日期");
          }
          return { name, applicant, report, differences };
        });
        const unmatched = pairs.filter(
          (pair) => !pair.applicant || !pair.report || pair.differences.length,
        );
        const matched = pairs.filter(
          (pair) => pair.applicant && pair.report && !pair.differences.length,
        );
        const person = (value?: ReportPerson) =>
          value ? (
            <div className="ev-person">
              <strong>{value.name}</strong>
              <div>身份 / 职务：{text(value.role)}</div>
              <div>
                持股比例：
                {value.ownershipPct == null
                  ? "—"
                  : `${value.ownershipPct.toFixed(1)}%`}
              </div>
              <div>任职开始：{value.startDate ?? "—"}</div>
              <div>任职结束：{value.endDate ?? "在任"}</div>
              <span className="ev-field-source">
                来源：{value.source ?? "—"}
              </span>
            </div>
          ) : (
            <span className="ev-person-missing">无此人员记录</span>
          );
        const renderPair = (pair: (typeof pairs)[number]) => {
          const hasDifference =
            !pair.applicant || !pair.report || !!pair.differences.length;
          return (
            <section
              className="ev-person-pair"
              data-different={hasDifference}
              key={pair.name}
            >
              <div className="ev-compare-heading">
                <strong>{pair.name}</strong>
                <Badge tone={hasDifference ? "warning" : "neutral"}>
                  {!pair.applicant
                    ? "未申报人员"
                    : !pair.report
                      ? "报告无记录"
                      : pair.differences.length
                        ? "信息不一致"
                        : "信息一致"}
                </Badge>
              </div>
              {hasDifference && (
                <p className="ev-person-difference">
                  {!pair.applicant
                    ? "报告列有该人员，但申报人员中未找到同名记录。"
                    : !pair.report
                      ? "已申报该人员，但报告中未找到同名记录。"
                      : `${pair.differences.join("、")}与报告不一致，请核对下方原始信息。`}
                </p>
              )}
              <dl className="ev-compare-values">
                <div>
                  <dt>申报人员</dt>
                  <dd>{person(pair.applicant)}</dd>
                </div>
                <div>
                  <dt>报告关联人</dt>
                  <dd>{person(pair.report)}</dd>
                </div>
              </dl>
            </section>
          );
        };
        return (
          <div className="ev-person-comparison">
            <div className="ev-block-heading">
              <h4>关联人员比对</h4>
              <p>
                申报 {declared.length} 人 · 报告 {reported.length} 人 ·{" "}
                {unmatched.length} 人存在差异或缺失
              </p>
            </div>
            {!!unmatched.length && (
              <div className="ev-compare-list">{unmatched.map(renderPair)}</div>
            )}
            {!!matched.length && (
              <details className="ev-context-disclosure">
                <summary>
                  信息一致的人员（{matched.length} 人）
                  <span>展开查看身份、持股与任职信息</span>
                </summary>
                <div className="ev-compare-list">{matched.map(renderPair)}</div>
              </details>
            )}
            {!pairs.length && <p className="ev-secondary">暂无人员比对记录</p>}
          </div>
        );
      }
      case "CLASSIFICATION":
        return (
          <>
            <Comparison
              rows={[
                {
                  field: "MCC",
                  declared: mccName(fields.declaredMcc),
                  evidence: mccName(fields.reportedMcc),
                },
              ]}
            />
            <EvidenceFacts
              entries={[
                {
                  label: "置信度",
                  value:
                    typeof fields.confidence === "number"
                      ? `${(fields.confidence <= 1 ? fields.confidence * 100 : fields.confidence).toFixed(1)}%`
                      : text(fields.confidence),
                },
                { label: "当前风险", value: statusLabel(fields.riskLevel) },
              ]}
            />
            <Screenshots screenshots={fields.screenshots} />
            <p>{text(fields.onlinePresence)}</p>
            <div className="ev-form">
              <Selector
                label="指定 MCC"
                hasSearch
                placeholder="选择类目与风险等级"
                value={draft.mcc || undefined}
                options={MCC_CHOICES}
                isDisabled={readOnly}
                onChange={(mcc) => update({ mcc })}
              />
            </div>
          </>
        );
      case "WEBSITE":
        return (
          <>
            <EvidenceFacts
              entries={[
                {
                  label: "可访问性",
                  value: fields.accessible ? "可访问" : "不可访问",
                },
                { label: "域名注册时间", value: text(fields.domainCreatedAt) },
                {
                  label: "域名主体",
                  value: fields.ownerMatches ? "一致" : "不一致",
                },
                { label: "商品关键词", value: text(fields.keywords) },
                ...[
                  ["refund", "退款政策"],
                  ["contact", "客服联系方式"],
                  ["terms", "交易条款"],
                ].map(([key, label]) => ({
                  label,
                  value: (
                    <Badge
                      tone={fields.policies?.[key] ? "success" : "warning"}
                    >
                      {fields.policies?.[key] ? "有" : "无"}
                    </Badge>
                  ),
                })),
              ]}
            />
            <Screenshots screenshots={fields.screenshots} />
            <div className="ev-form">
              <CheckboxList
                label="整改事项"
                value={draft.remediationItems}
                isDisabled={readOnly}
                density="compact"
                onChange={(remediationItems) => update({ remediationItems })}
              >
                {["退款政策", "客服联系方式", "交易条款", "经营内容说明"].map(
                  (value) => (
                    <CheckboxListItem key={value} value={value} label={value} />
                  ),
                )}
              </CheckboxList>
            </div>
          </>
        );
      case "SCHEME_LIST":
        return (
          <>
            <Comparison
              left="申请主体"
              right="名单记录"
              rows={entityRows(fields.subject ?? {}, fields.record ?? {})}
            />
            <EvidenceFacts
              entries={[
                { label: "列入原因", value: text(fields.record?.reason) },
                { label: "列入日期", value: text(fields.record?.listedAt) },
                {
                  label: "匹配负责人",
                  value: text(fields.record?.matchedPerson),
                },
                { label: "名单项目", value: text(fields.record?.listName) },
              ]}
            />
          </>
        );
      case "OWNERSHIP": {
        const nodes: OwnershipNode[] = fields.nodes ?? [];
        const build = (
          node: OwnershipNode,
          visited: Set<string>,
        ): TreeListItemData => ({
          id: node.id,
          label: (
            <span className={!node.verified ? "ev-danger" : undefined}>
              {node.name}
            </span>
          ),
          description: `${node.type === "PERSON" ? "自然人" : "公司"}${node.parentId ? ` · ${node.ownershipPct.toFixed(1)}%` : ""}`,
          endContent: !node.verified ? (
            <Badge tone="danger">无法穿透</Badge>
          ) : undefined,
          isExpanded: true,
          children: nodes
            .filter(
              (child) => child.parentId === node.id && !visited.has(child.id),
            )
            .map((child) => build(child, new Set([...visited, child.id]))),
        });
        const roots = nodes.filter(
          (node) =>
            !node.parentId ||
            !nodes.some((parent) => parent.id === node.parentId),
        );
        return (
          <>
            <div className="ev-ownership">
              <TreeList
                header="股权结构"
                items={roots.map((node) => build(node, new Set([node.id])))}
                density="compact"
                variant="lineGuides"
              />
              <Documents files={fields.documents} />
            </div>
            <div className="ev-form">
              <TextArea
                label="最终受益所有人名单"
                rows={3}
                value={draft.uboNames}
                isReadOnly={readOnly}
                onChange={(uboNames) => update({ uboNames })}
                placeholder="每行一位自然人姓名"
              />
            </div>
          </>
        );
      }
      case "LINKED_ENTITY": {
        const matched = fields.matched ?? {};
        const labels: Record<string, string> = {
          name: "名称",
          aliases: "别名",
          country: "国家",
          registrationNo: "注册号",
          incorporatedAt: "成立日期",
          director: "董事",
          registeredAddress: "注册地址",
          address: "注册地址",
          account: "收款账户",
          website: "网站",
        };
        return (
          <>
            <EvidenceFacts
              entries={[
                {
                  label: "内部记录号",
                  value: (
                    <IdText value={matched.recordNo ?? source.sourceRef} />
                  ),
                },
                {
                  label: "命中依据",
                  value: text(fields.matchBasis ?? matched.matchBasis),
                },
              ]}
            />
            <Comparison
              left="本申请"
              right="匹配到的记录"
              rows={[
                ...entityRows(fields.subject ?? {}, matched),
                ...((matched.matchedFields ?? []) as string[])
                  .filter(
                    (key) =>
                      ![
                        "name",
                        "aliases",
                        "country",
                        "registrationNo",
                        "incorporatedAt",
                      ].includes(key),
                  )
                  .map((key) => ({
                    field: labels[key] ?? key,
                    declared: fields.subject?.[key],
                    evidence: matched[key],
                  })),
              ]}
              matchedFields={(matched.matchedFields ?? []).map(
                (key: string) => labels[key] ?? key,
              )}
            />
            <EvidenceFacts
              entries={[
                ...(matched.status
                  ? [{ label: "对方状态", value: statusLabel(matched.status) }]
                  : []),
                ...(matched.decision
                  ? [
                      {
                        label: "历史决策",
                        value: statusLabel(matched.decision),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        );
      }
      case "MANUAL_VERIFY":
        return (
          <>
            <Table
              data={
                (fields.missing ?? []) as { name: string; reason: string }[]
              }
              idKey="name"
              density="compact"
              columns={[
                { key: "name", header: "缺失证据", width: proportional(1) },
                { key: "reason", header: "缺失原因", width: proportional(1) },
              ]}
            />
            <Documents files={fields.materials} />
            <div className="ev-form">
              <h4 className="ev-card-title">核验材料</h4>
              <FileUpload
                value={draft.verificationFiles}
                onChange={(verificationFiles) => update({ verificationFiles })}
                onReadingChange={onReadingChange}
                disabled={readOnly}
              />
            </div>
          </>
        );
    }
  };
  return (
    <div className="evidence-panel">
      {sources.map((source) => (
        <section className="ev-source" key={source.id}>
          {render(source)}
          <div className="ev-source-meta">
            <span>
              证据来源{" "}
              <IdText
                value={
                  source.kind === "LINKED_ENTITY"
                    ? (source.fields.matched?.recordNo ?? source.sourceRef)
                    : source.sourceRef
                }
              />
            </span>
            <span>{dateTime(source.generatedAt)}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
