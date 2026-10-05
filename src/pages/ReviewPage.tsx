import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { TextArea } from "@astryxdesign/core/TextArea";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { COMPLIANCE_ROLES, orderPath } from "../access";
import {
  CHECK_LABELS,
  CHECK_OPTIONS,
  DECLINE_CONCLUSIONS,
  REASONS,
  SUPPLEMENT_CONCLUSIONS,
  reasonName,
} from "../catalog";
import { api } from "../api";
import {
  getQueueContext,
  useAsync,
  useNotice,
  useOrder,
  useQueueFlow,
  useSession,
} from "../hooks";
import {
  Badge,
  Empty,
  Confirm,
  IdText,
  InlineConfirm,
  LoadState,
  OrderHeader,
  PersonName,
  StatusBadge,
  Timeline,
} from "../ui";
import {
  countryName,
  dateTime,
  deadlineDate,
  mccName,
  money,
  verificationStatus,
} from "../format";
import EvidencePanel, {
  emptyEvidenceDraft,
  MCC_CHOICES,
  type EvidenceDraft,
} from "../components/EvidencePanel";
import SupplementNeedsDialog from "../components/SupplementNeedsDialog";
import type { CheckItem, EvidenceSnapshot, OrderDetail } from "../types";
import "../review.css";

type Preview = {
  title: string;
  description: string;
  merchant: string;
  sales: string;
  reversible: string;
  label: string;
  danger?: boolean;
  reason?: boolean;
  finalize?: boolean;
  execute: (reason: string, outcome: string) => Promise<boolean>;
};
const resultNames: Record<string, string> = {
  APPROVED: "通过",
  DECLINED: "拒绝",
  PENDING_APPROVAL: "提交审批",
};
type ReviewDraft = {
  draft: EvidenceDraft;
  conclusion: string;
  reason: string;
  note: string;
};
const itemDraft = (item?: CheckItem): ReviewDraft => ({
  draft: {
    ...emptyEvidenceDraft(),
    hitConclusions: item?.hitConclusions ?? {},
    articles: Object.fromEntries(
      Object.entries(item?.articles ?? {}).map(([id, value]) => [
        id,
        { relevance: value.relevance, reason: value.reason ?? "" },
      ]),
    ),
    mcc: item?.mcc ?? "",
    uboNames: item?.uboNames?.join("\n") ?? "",
    remediationItems: item?.remediationItems ?? [],
    verificationFiles: item?.verificationFiles ?? [],
  },
  conclusion: item?.conclusion ?? "",
  reason: item?.conclusionReason ?? "",
  note: item?.note ?? "",
});
export default function ReviewPage() {
  const { data, loading, error, stale, busy, reload, act } = useOrder();
  const { session } = useSession();
  const notice = useNotice();
  const navigate = useNavigate();
  const queueFlow = useQueueFlow();
  const [params, setParams] = useSearchParams();
  const [notesOpen, setNotesOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewReason, setPreviewReason] = useState("");
  const [outcome, setOutcome] = useState("APPROVED");
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(true);
  const [referenceTab, setReferenceTab] = useState("application");
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>();
  const [snapshot, setSnapshot] = useState<EvidenceSnapshot | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sessionLeave, setSessionLeave] = useState<(() => void) | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftStorageError, setDraftStorageError] = useState("");
  const finalAction = useRef<HTMLDivElement>(null);
  const claimTrigger = useRef<HTMLDivElement>(null);
  const claimContinuation = useRef<(() => void) | null>(null);
  const completedNavigation = useRef(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const selectedElement = useRef<HTMLDivElement>(null);
  const evidenceElement = useRef<HTMLDivElement>(null);
  const readInFlight = useRef("");
  const order = data?.workOrder;
  const checks = order?.checkItems ?? [];
  const sortedChecks = [...checks].sort((a, b) => {
    const rank = (item: CheckItem) =>
      Math.max(
        ...item.reasonCodes.map((code) =>
          REASONS[code]?.priority === "HIGH"
            ? 3
            : REASONS[code]?.priority === "LOW"
              ? 1
              : 2,
        ),
        0,
      );
    return rank(b) - rank(a);
  });
  const selected =
    checks.find((item) => item.id === params.get("item")) ??
    sortedChecks.find((item) => item.status === "PENDING") ??
    sortedChecks[0];
  const draftPrefix = `intake-review-draft-v05:${session.userId}:${order?.id ?? ""}:`;
  const draftBook = useMemo(() => {
    const entries: Record<string, ReviewDraft> = {};
    if (!order) return entries;
    for (const item of order.checkItems ?? []) {
      try {
        const stored = JSON.parse(
          localStorage.getItem(`${draftPrefix}${item.id}`) ?? "null",
        );
        if (
          stored &&
          typeof stored.conclusion === "string" &&
          typeof stored.reason === "string" &&
          typeof stored.note === "string" &&
          stored.draft?.hitConclusions &&
          stored.draft?.articles
        )
          entries[item.id] = stored;
      } catch {
        /* An unreadable draft must not prevent access to the case. */
      }
    }
    return entries;
  }, [draftPrefix]);
  const currentDraft =
    (selected && draftBook[selected.id]) ?? itemDraft(selected);
  const { draft, conclusion, reason, note } = currentDraft;
  const remember = (patch: Partial<ReviewDraft>) => {
    if (!selected) return;
    const value = {
      ...(draftBook[selected.id] ?? itemDraft(selected)),
      ...patch,
    };
    const unchanged =
      JSON.stringify(value) === JSON.stringify(itemDraft(selected));
    if (unchanged) delete draftBook[selected.id];
    else draftBook[selected.id] = value;
    try {
      if (unchanged) localStorage.removeItem(`${draftPrefix}${selected.id}`);
      else
        localStorage.setItem(
          `${draftPrefix}${selected.id}`,
          JSON.stringify(value),
        );
      setDraftStorageError("");
    } catch {
      setDraftStorageError("本机草稿保存失败，请勿关闭页面，先提交当前内容。");
    }
    setDraftRevision((value) => value + 1);
  };
  const clearItemDraft = (itemId: string) => {
    delete draftBook[itemId];
    try {
      localStorage.removeItem(`${draftPrefix}${itemId}`);
    } catch {}
    setDraftRevision((value) => value + 1);
  };
  const dirty =
    Object.keys(draftBook).some((id) =>
      checks.some(
        (item) =>
          item.id === id &&
          item.status === "PENDING" &&
          JSON.stringify(draftBook[id]) !== JSON.stringify(itemDraft(item)),
      ),
    ) || !!comment.trim();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !completedNavigation.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    completedNavigation.current = false;
    try {
      setComment(localStorage.getItem(`${draftPrefix}comment`) ?? "");
    } catch {
      setComment("");
    }
    setPreview(null);
    setSupplementOpen(false);
    claimContinuation.current = null;
  }, [draftPrefix]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, draftRevision]);
  useEffect(() => {
    const changing = (event: Event) => {
      if (!dirty) return;
      event.preventDefault();
      setSessionLeave(
        () => (event as CustomEvent<{ proceed: () => void }>).detail.proceed,
      );
    };
    window.addEventListener("workbench:session-change", changing);
    return () =>
      window.removeEventListener("workbench:session-change", changing);
  }, [dirty]);
  const updateComment = (value: string) => {
    setComment(value);
    try {
      if (value) localStorage.setItem(`${draftPrefix}comment`, value);
      else localStorage.removeItem(`${draftPrefix}comment`);
    } catch {
      setDraftStorageError("本机草稿保存失败，请勿关闭页面，先提交当前内容。");
    }
  };
  const reviewer = COMPLIANCE_ROLES.includes(session.role);
  const eligible =
    reviewer &&
    order?.submittedBy?.id !== session.userId &&
    data?.application.submittedBy?.id !== session.userId;
  const owner = order?.assignee?.id === session.userId;
  const editable =
    !!order &&
    eligible &&
    owner &&
    order.status === "IN_PROGRESS" &&
    !stale &&
    !busy;
  const canClaim =
    eligible &&
    !order?.assignee &&
    order?.status === "QUEUED" &&
    !stale &&
    !busy;
  const sourceEvidence = (data?.evidence ?? []).filter((source) =>
    selected?.evidenceIds.includes(source.id),
  );
  const history = useAsync(
    () =>
      data
        ? api.getApplication(data.application.id, session)
        : Promise.resolve(null),
    [data?.application.id, session.role, session.userId, order?.version],
  );
  const users = useAsync(
    () =>
      session.role === "COMPLIANCE_HEAD"
        ? api.users(session)
        : Promise.resolve([]),
    [session.role, session.userId],
  );
  const queueIds = useMemo(
    () => getQueueContext(session)?.ids ?? [],
    [order?.id, session.userId],
  );
  const queueIndex = queueIds.indexOf(order?.id ?? "");
  const pending = checks.filter((item) => item.status === "PENDING");
  const submittedNeeds = new Set(
    (data?.supplements ?? [])
      .filter(
        (supplement) =>
          !["DONE", "CLOSED_NO_RESPONSE", "WITHDRAWN"].includes(
            supplement.status,
          ),
      )
      .flatMap((supplement) =>
        (supplement.items ?? []).map((item) => item.checkItemId),
      ),
  );
  const unsubmittedSupplement = checks.some(
    (item) =>
      item.conclusion &&
      SUPPLEMENT_CONCLUSIONS[item.conclusion] &&
      !submittedNeeds.has(item.id),
  );
  const hasScreening = checks.some((item) =>
    item.checkType.startsWith("SCREENING_"),
  );
  const needsEscalation = checks.some((item) =>
    ["TRUE_POSITIVE", "UNCERTAIN"].includes(item.conclusion ?? ""),
  );
  const suggested = checks.some(
    (item) => DECLINE_CONCLUSIONS[item.conclusion ?? ""],
  )
    ? "DECLINED"
    : order?.approvalReasons?.length
      ? "PENDING_APPROVAL"
      : "APPROVED";
  const missingEvidence = order?.missingEvidence ?? [];
  const canFinalize =
    editable &&
    pending.length === 0 &&
    !unsubmittedSupplement &&
    !needsEscalation &&
    (!missingEvidence.length || suggested === "DECLINED");
  const selectedPending = selected?.status === "PENDING";
  const readOnlyReason = stale
    ? "工单已更新，请刷新后操作"
    : !eligible
      ? "当前账号无审核处理权限"
      : !owner
        ? order?.assignee
          ? `${order.assignee.name}正在处理，本单只读`
          : "首次操作时领取并继续"
        : order?.status !== "IN_PROGRESS"
          ? "当前状态不可修改检查项结论"
          : "";
  const selectItem = (id: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("item", id);
      return next;
    });
  useEffect(() => {
    if (selected && params.get("item") !== selected.id)
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("item", selected.id);
          return next;
        },
        { replace: true },
      );
  }, [selected?.id, params, setParams]);
  useEffect(() => {
    setNotesOpen(!!note);
    setFormError("");
    selectedElement.current?.scrollIntoView({ block: "nearest" });
    evidenceElement.current?.scrollTo({ top: 0 });
  }, [order?.id, selected?.id, selected?.status]);
  useEffect(() => {
    if (
      !selected?.hasNewEvidence ||
      !reviewer ||
      stale ||
      busy ||
      readInFlight.current === selected.id
    )
      return;
    readInFlight.current = selected.id;
    void act("read-evidence", { itemId: selected.id }).finally(() => {
      readInFlight.current = "";
    });
  }, [selected?.id, selected?.hasNewEvidence, reviewer, stale]);
  const updateDraft = (next: EvidenceDraft) => {
    const patch: Partial<ReviewDraft> = { draft: next };
    if (selected?.checkType === "SCREENING_MEDIA") {
      const articles: { id: string }[] = sourceEvidence.flatMap(
        (source) => source.fields.articles ?? [],
      );
      if (
        articles.length &&
        articles.every(
          (article) => next.articles[article.id]?.relevance === "UNRELATED",
        )
      ) {
        patch.conclusion = "UNRELATED";
        patch.reason = next.articles[articles[0].id]?.reason ?? "";
      } else if (conclusion === "UNRELATED") {
        patch.conclusion = "";
        patch.reason = "";
      }
    }
    if (selected?.checkType === "SCREENING_WATCHLIST") {
      const hits: { id: string }[] = sourceEvidence.flatMap(
        (source) => source.fields.hits ?? [],
      );
      const choices = hits.map((hit) => next.hitConclusions[hit.id]);
      const result = choices.find(
        (choice) => choice?.conclusion === "TRUE_POSITIVE",
      );
      const allFalse =
        hits.length > 0 &&
        choices.every((choice) => choice?.conclusion === "FALSE_POSITIVE");
      patch.conclusion = result
        ? "TRUE_POSITIVE"
        : allFalse
          ? "FALSE_POSITIVE"
          : "UNCERTAIN";
      patch.reason =
        result?.reason ??
        choices.find((choice) => choice?.conclusion === "UNCERTAIN")?.reason ??
        choices[0]?.reason ??
        "";
    }
    remember(patch);
  };
  const watchHits: { id: string }[] =
    selected?.checkType === "SCREENING_WATCHLIST"
      ? sourceEvidence.flatMap((source) => source.fields.hits ?? [])
      : [];
  const watchConclusion = watchHits.some(
    (hit) => draft.hitConclusions[hit.id]?.conclusion === "TRUE_POSITIVE",
  )
    ? "TRUE_POSITIVE"
    : watchHits.length > 0 &&
        watchHits.every(
          (hit) =>
            draft.hitConclusions[hit.id]?.conclusion === "FALSE_POSITIVE",
        )
      ? "FALSE_POSITIVE"
      : "UNCERTAIN";
  const watchComplete =
    watchHits.length > 0 &&
    watchHits.every(
      (hit) =>
        !!draft.hitConclusions[hit.id]?.conclusion &&
        !!draft.hitConclusions[hit.id]?.reason,
    );
  const claimAndContinue = async () => {
    const result = await act("claim");
    if (!result) throw new Error("领取未完成，请刷新工单后重试");
    const continuation = claimContinuation.current;
    claimContinuation.current = null;
    continuation?.();
  };
  const requestClaim = (continuation?: () => void) => {
    claimContinuation.current = continuation ?? null;
    claimTrigger.current?.querySelector<HTMLButtonElement>("button")?.click();
  };
  const nextCase = () => {
    if (dirty)
      setSessionLeave(() => () => {
        void queueFlow.next(order?.id).finally(() => {
          completedNavigation.current = false;
        });
      });
    else void queueFlow.next(order?.id);
  };
  const completeCase = async (result: OrderDetail | null) => {
    if (!result) return false;
    const remainingDrafts =
      !!comment.trim() ||
      result.workOrder.checkItems?.some(
        (item) => item.status === "PENDING" && !!draftBook[item.id],
      );
    if (remainingDrafts)
      setSessionLeave(() => () => {
        void queueFlow.next(result.workOrder.id).finally(() => {
          completedNavigation.current = false;
        });
      });
    else {
      completedNavigation.current = true;
      try {
        await queueFlow.next(result.workOrder.id);
      } finally {
        completedNavigation.current = false;
      }
    }
    return true;
  };
  const openPreview = (value: Preview) => {
    setPreviewReason("");
    setFormError("");
    setPreview(value);
  };
  const moveNextItem = (updated: OrderDetail) => {
    const next = updated.workOrder.checkItems?.find(
      (item) => item.status === "PENDING" && item.id !== selected?.id,
    );
    if (next) selectItem(next.id);
    else
      requestAnimationFrame(() =>
        finalAction.current
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus(),
      );
  };
  const escalationPreview = (payload?: Record<string, unknown>) =>
    openPreview({
      title: "转受限",
      description:
        "申请冻结并生成受限工单，由两位合规负责人确认处置；审核工单变为合规冻结。",
      merchant: "审核中，不披露内部审核原因。",
      sales: "审核中，不展示受限细节。",
      reversible:
        "仅合规负责人可完成受限处置；其他合规人员此后不能查看受限细节。",
      label: "确认转受限",
      danger: true,
      reason: !payload,
      execute: async (value) => {
        if (payload) {
          if (!(await act("conclusion", payload))) return false;
          if (selected) clearItemDraft(selected.id);
        }
        const result = await act("escalate", {
          reason: value || `${reason}；${note || "筛查结果需受限处置"}`,
        });
        return completeCase(result);
      },
    });
  const submitItem = () => {
    if (!selected || !editable || !selectedPending || needsEscalation) return;
    let finalConclusion = conclusion,
      finalReason = reason;
    const fail = (message: string, expand = false) => {
      setFormError(message);
      if (expand) setNotesOpen(true);
    };
    if (selected.checkType === "SCREENING_WATCHLIST") {
      const hits: { id: string; strength: string }[] = sourceEvidence.flatMap(
        (source) => source.fields.hits ?? [],
      );
      if (
        !hits.length ||
        hits.some(
          (hit) =>
            !draft.hitConclusions[hit.id]?.conclusion ||
            !draft.hitConclusions[hit.id]?.reason,
        )
      )
        return fail("请逐个完成所有名单命中的处置和原因。");
      if (
        !["COMPLIANCE_SENIOR", "COMPLIANCE_HEAD"].includes(session.role) &&
        hits.some(
          (hit) =>
            /strong|high|强/i.test(hit.strength) &&
            draft.hitConclusions[hit.id].conclusion === "FALSE_POSITIVE",
        )
      )
        return fail("强匹配误命中须由资深合规或合规负责人判断。");
      const choices = hits.map((hit) => draft.hitConclusions[hit.id]);
      const result =
        choices.find((choice) => choice.conclusion === "TRUE_POSITIVE") ??
        choices.find((choice) => choice.conclusion === "UNCERTAIN") ??
        choices[0];
      finalConclusion = result.conclusion;
      finalReason = result.reason;
    }
    if (!finalConclusion || !finalReason) return fail("请选择结论和对应原因。");
    if (
      finalReason === "其他" &&
      selected.checkType !== "SCREENING_WATCHLIST" &&
      !note.trim()
    )
      return fail("选择其他原因时须填写备注。", true);
    if (selected.checkType === "SCREENING_MEDIA") {
      const articles: { id: string }[] = sourceEvidence.flatMap(
        (source) => source.fields.articles ?? [],
      );
      if (
        !articles.length ||
        articles.some(
          (article) =>
            !draft.articles[article.id]?.relevance ||
            (draft.articles[article.id].relevance === "UNRELATED" &&
              !draft.articles[article.id].reason),
        )
      )
        return fail("请判断每篇文章的相关性，并选择不相关原因。");
      const related = articles.some(
        (article) => draft.articles[article.id].relevance === "RELATED",
      );
      if (
        (related && finalConclusion === "UNRELATED") ||
        (!related && finalConclusion !== "UNRELATED")
      )
        return fail("文章标记与本项结论不一致。");
    }
    if (finalConclusion === "CHANGE_MCC" && (!draft.mcc || !note.trim()))
      return fail("请选择 MCC，并填写改判依据。", true);
    if (
      finalConclusion === "ACCEPTABLE" &&
      selected.checkType === "SCHEME_LIST" &&
      !note.trim()
    )
      return fail("请填写对列入原因和时间的判断。", true);
    if (finalConclusion === "TRACED" && !draft.uboNames.trim())
      return fail("请录入最终受益所有人名单。");
    if (finalConclusion === "RECTIFY" && !draft.remediationItems.length)
      return fail("请至少选择一个整改事项。");
    if (
      finalConclusion === "MANUAL_PASS" &&
      (!draft.verificationFiles.length || !note.trim())
    )
      return fail("请上传核验材料并填写核验说明。", true);
    if (
      missingEvidence.length &&
      finalConclusion !== "MANUAL_PASS" &&
      !DECLINE_CONCLUSIONS[finalConclusion] &&
      !SUPPLEMENT_CONCLUSIONS[finalConclusion]
    )
      return fail("证据未齐，仅可拒绝或提补件需求。");
    const payload = {
      itemId: selected.id,
      conclusion: finalConclusion,
      conclusionReason: finalReason,
      note: note.trim(),
      ...draft,
      uboNames: draft.uboNames
        .split(/[\n,，、]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    };
    if (["TRUE_POSITIVE", "UNCERTAIN"].includes(finalConclusion)) {
      escalationPreview(payload);
      return;
    }
    const save = async () => {
      const result = await act("conclusion", payload);
      if (!result) return false;
      clearItemDraft(selected.id);
      setFormError("");
      moveNextItem(result);
      return true;
    };
    void save();
  };
  const finalize = () => {
    setOutcome(suggested);
    openPreview({
      title: suggested === "PENDING_APPROVAL" ? "提交审批" : "结案",
      description: `系统建议${resultNames[suggested]}。通过后进入渠道进件；拒绝后终止申请；提交审批后由审批人按授权处置。${checks.some((item) => item.conclusion === "FRAUD_DECLINE") ? "欺诈拒绝将写入内部黑名单。" : ""}`,
      merchant:
        suggested === "DECLINED" ? "未通过，使用通用文案。" : "审核中。",
      sales:
        suggested === "DECLINED"
          ? "未通过；不披露类原因不展示类别。"
          : "审核中，可查看当前环节。",
      reversible: "结案不可直接撤销；按权限发起复核，审计记录保留。",
      label: suggested === "PENDING_APPROVAL" ? "确认提交审批" : "确认结案",
      danger: suggested === "DECLINED",
      finalize: true,
      execute: async (value, result) =>
        completeCase(
          await act("finalize", {
            outcome: result,
            overrideReason: result !== suggested ? value : undefined,
          }),
        ),
    });
  };
  const navigateQueue = async (offset: number) => {
    const id = queueIds[queueIndex + offset];
    if (!id) return;
    try {
      const next = await api.getOrder(id, session);
      navigate(orderPath(next.workOrder));
    } catch (failure) {
      notice(failure instanceof Error ? failure.message : "无法打开工单");
    }
  };
  const media = async (evidenceId: string, mediaId: string) => {
    const result = await act("media", { evidenceId, mediaId });
    if (!result) throw new Error("原图访问未获授权，请刷新后重试");
  };
  const options = selected ? CHECK_OPTIONS[selected.checkType] : [];
  const reasons =
    options.find((option) => option.value === conclusion)?.reasons ?? [];
  const chooseConclusion = (value: string) => {
    if (
      !selectedPending ||
      needsEscalation ||
      selected?.checkType === "SCREENING_WATCHLIST"
    )
      return;
    if (
      missingEvidence.length &&
      value !== "MANUAL_PASS" &&
      !DECLINE_CONCLUSIONS[value] &&
      !SUPPLEMENT_CONCLUSIONS[value]
    )
      return;
    const choose = () => {
      remember({ conclusion: value, reason: "" });
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(".rv-reasons button")
          ?.focus(),
      );
    };
    if (canClaim) requestClaim(choose);
    else if (editable) choose();
  };
  const keyboardRef = useRef<(event: KeyboardEvent) => void>(() => {});
  keyboardRef.current = (event) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      busy ||
      queueFlow.busy ||
      preview ||
      supplementOpen ||
      snapshot ||
      helpOpen ||
      sessionLeave ||
      blocker.state === "blocked" ||
      Array.from(
        document.querySelectorAll(
          'dialog[open], [role="dialog"][aria-modal="true"], [role="listbox"], .inline-confirm',
        ),
      ).some((element) => element.getClientRects().length > 0)
    )
      return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]',
      )
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (canClaim) requestClaim();
      else if (pending.length === 0 && canFinalize) finalize();
      else submitItem();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "?") {
      event.preventDefault();
      setHelpOpen(true);
    } else if (event.key === "]") {
      event.preventDefault();
      nextCase();
    } else if (["j", "k"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const index = sortedChecks.findIndex((item) => item.id === selected?.id);
      const next =
        sortedChecks[index + (event.key.toLowerCase() === "j" ? 1 : -1)];
      if (next) selectItem(next.id);
    } else if (/^[123]$/.test(event.key) && options[Number(event.key) - 1]) {
      event.preventDefault();
      chooseConclusion(options[Number(event.key) - 1].value);
    }
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => keyboardRef.current(event);
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  if (loading || error || !data || !order)
    return (
      <LoadState loading={loading} error={error} retry={reload}>
        {null}
      </LoadState>
    );
  const personaSources = (data.evidence ?? []).filter(
    (source) =>
      typeof source.fields.sourceUrl === "string" &&
      /^https:\/\//i.test(source.fields.sourceUrl),
  );
  const moreItems = [
    ...(editable && hasScreening
      ? [
          {
            label: "转受限",
            variant: "destructive" as const,
            onClick: () => escalationPreview(),
          },
        ]
      : []),
  ];
  const referenceTabs = [
    { key: "application", label: "申请信息" },
    { key: "people", label: "人员" },
    { key: "supplements", label: "补件进度" },
    { key: "history", label: "历史" },
    { key: "logs", label: "日志" },
  ];
  const finalizeBlockReason = !canFinalize
    ? needsEscalation
      ? "请先转受限"
      : unsubmittedSupplement
        ? "请先提补件需求"
        : missingEvidence.length && suggested !== "DECLINED"
          ? "证据未齐，不能通过"
          : "请完成所有检查项"
    : undefined;
  return (
    <div className="review-workspace">
      <header className="rv-header">
        <OrderHeader
          data={data}
          actions={
            <div className="row rv-header-actions">
              {canClaim && (
                <InlineConfirm
                  title="领取此工单并开始审核？"
                  confirmLabel="领取并继续"
                  onConfirm={claimAndContinue}
                  busy={busy}
                  disabled={stale}
                >
                  <Button
                    label="领取"
                    variant="primary"
                    tooltip="领取后可提交审核结论"
                  />
                </InlineConfirm>
              )}
              {eligible && owner && order.status === "IN_PROGRESS" && (
                <>
                  <div ref={finalAction}>
                    <Button
                      label={
                        suggested === "PENDING_APPROVAL" ? "提交审批" : "结案"
                      }
                      variant={pending.length === 0 ? "primary" : "secondary"}
                      isDisabled={!canFinalize}
                      tooltip={
                        finalizeBlockReason || "打开后果预览 · Ctrl + Enter"
                      }
                      onClick={finalize}
                    />
                  </div>
                  <Button
                    label="提补件需求"
                    isDisabled={!editable || needsEscalation || !checks.length}
                    tooltip={
                      readOnlyReason ||
                      (needsEscalation
                        ? "请先转受限"
                        : !checks.length
                          ? "有待补充的检查项后可用"
                          : "向运营提交补件需求")
                    }
                    onClick={() => setSupplementOpen(true)}
                  />
                </>
              )}
              <Button
                label="上一单"
                icon={<ChevronLeft size={16} />}
                isDisabled={queueIndex <= 0 || busy}
                tooltip={
                  busy
                    ? "正在保存，请稍候"
                    : queueIndex <= 0
                      ? "已是当前队列第一张"
                      : "打开队列中的上一张"
                }
                onClick={() => void navigateQueue(-1)}
              />
              <Button
                label="下一单"
                icon={<ChevronRight size={16} />}
                tooltip="领取并处理下一张 · ]"
                isDisabled={busy || queueFlow.busy}
                onClick={nextCase}
              />
              <Button
                label="快捷键"
                variant="ghost"
                tooltip="快捷键表 · ?"
                onClick={() => setHelpOpen(true)}
              />
              {editable && (
                <InlineConfirm
                  title="释放后工单回到待领取队列"
                  confirmLabel="确认释放"
                  busy={busy}
                  disabled={stale}
                  confirmDisabled={!releaseReason.trim()}
                  content={
                    <TextArea
                      label="释放原因"
                      isRequired
                      value={releaseReason}
                      onChange={setReleaseReason}
                      rows={3}
                    />
                  }
                  onConfirm={async () => {
                    if (
                      !(await act("release", { reason: releaseReason.trim() }))
                    )
                      throw new Error("释放未完成，请刷新后重试");
                    setReleaseReason("");
                  }}
                >
                  <Button
                    label="释放"
                    size="sm"
                    tooltip="填写原因并就地确认，解除当前处理人"
                  />
                </InlineConfirm>
              )}
              {session.role === "COMPLIANCE_HEAD" &&
                ["QUEUED", "IN_PROGRESS"].includes(order.status) && (
                  <InlineConfirm
                    title="选择处理人并确认指派"
                    confirmLabel="确认指派"
                    busy={busy}
                    disabled={stale}
                    confirmDisabled={!assigneeId}
                    content={
                      <LoadState
                        loading={users.loading}
                        error={users.error}
                        retry={users.reload}
                      >
                        <Selector
                          label="处理人"
                          isRequired
                          value={assigneeId}
                          placeholder="选择合规处理人"
                          hasSearch
                          options={(users.data ?? [])
                            .filter(
                              (user) =>
                                user.roles.some((role) =>
                                  COMPLIANCE_ROLES.includes(role),
                                ) &&
                                user.id !== order.submittedBy?.id &&
                                user.id !== data.application.submittedBy?.id,
                            )
                            .map((user) => ({
                              value: user.id,
                              label: `${user.name} · ${user.team}`,
                            }))}
                          onChange={setAssigneeId}
                        />
                      </LoadState>
                    }
                    onConfirm={async () => {
                      if (!(await act("assign", { assigneeId })))
                        throw new Error("指派未完成，请刷新后重试");
                      setAssigneeId(undefined);
                    }}
                  >
                    <Button
                      label="指派"
                      size="sm"
                      tooltip={
                        stale ? "刷新工单后可用" : "选择合规处理人后就地确认"
                      }
                    />
                  </InlineConfirm>
                )}
              {moreItems.length > 0 && (
                <DropdownMenu
                  button={{ label: "更多", icon: <MoreHorizontal size={16} /> }}
                  items={moreItems}
                  alignment="end"
                />
              )}
            </div>
          }
        />
      </header>
      <div className="rv-banners">
        {draftStorageError && (
          <Banner status="warning" title={draftStorageError} />
        )}
        {stale && (
          <Banner
            status="warning"
            container="section"
            title="工单已更新，点击刷新"
            endContent={<Button label="刷新" size="sm" onClick={reload} />}
          />
        )}
        {order.lateHardReject &&
          !order.hardRejectDismissed &&
          order.status === "IN_PROGRESS" && (
            <Banner
              status="error"
              container="section"
              title={`建议拒绝：${reasonName(order.lateHardReject)}`}
              endContent={
                editable && (
                  <div className="row">
                    <Button
                      label="确认拒绝"
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        openPreview({
                          title: "确认拒绝",
                          description: `${reasonName(order.lateHardReject ?? "")}。审核工单结案为拒绝，申请停止进件。`,
                          merchant: "未通过，使用通用文案。",
                          sales: "未通过；仅展示允许披露的对外类别。",
                          reversible: "硬拒不可直接推翻，例外须走受限案件。",
                          label: "确认拒绝",
                          danger: true,
                          execute: async () =>
                            completeCase(
                              await act("late-decline", {
                                action: "confirm",
                              }),
                            ),
                        })
                      }
                    />
                    <Button
                      label="忽略并说明"
                      size="sm"
                      onClick={() =>
                        openPreview({
                          title: "忽略并说明",
                          description:
                            "记录忽略迟到硬拒的原因，收起建议拒绝提示，继续当前审核。",
                          merchant: "审核中。",
                          sales: "审核中。",
                          reversible:
                            "忽略原因保留在审计记录中，不影响已存在的证据。",
                          label: "确认忽略",
                          reason: true,
                          execute: async (value) =>
                            !!(await act("late-decline", {
                              action: "ignore",
                              reason: value,
                            })),
                        })
                      }
                    />
                  </div>
                )
              }
            />
          )}
        {!!order.approvalReasons?.length && (
          <Banner
            status="info"
            container="section"
            title={`需审批：${order.approvalReasons.map(reasonName).join("、")}`}
          />
        )}
        {missingEvidence.length > 0 && (
          <Banner
            status="warning"
            container="section"
            title={`证据未齐：${missingEvidence.map(reasonName).join("、")}。仅可拒绝或提补件需求。`}
          />
        )}
        {needsEscalation && order.status === "IN_PROGRESS" && (
          <Banner
            status="warning"
            container="section"
            title="筛查结论须转受限后才能继续"
            endContent={
              editable && (
                <Button
                  label="转受限"
                  variant="destructive"
                  size="sm"
                  onClick={() => escalationPreview()}
                />
              )
            }
          />
        )}
      </div>
      {data.restrictedLocked ? (
        <div className="rv-locked">
          <Empty title="已转受限" />
        </div>
      ) : (
        <div
          className={`rv-grid ${referenceOpen ? "" : "rv-reference-collapsed"}`}
        >
          <aside className="rv-checklist" aria-label="检查项清单">
            {[
              {
                label: "待处理",
                items: sortedChecks.filter((item) => item.status === "PENDING"),
              },
              {
                label: "已结论",
                items: sortedChecks.filter((item) => item.status !== "PENDING"),
              },
            ].map((group) => (
              <section key={group.label}>
                <h2 className="rv-group-title">
                  {group.label}
                  <Badge>{group.items.length}</Badge>
                </h2>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    ref={item.id === selected?.id ? selectedElement : undefined}
                  >
                    <Button
                      label={
                        item.reasonCodes.map(reasonName).join("、") ||
                        item.title
                      }
                      width="100%"
                      variant="ghost"
                      className={`rv-check-row ${item.id === selected?.id ? "is-selected" : ""}`}
                      tooltip="切换检查项 · J 下一项 / K 上一项"
                      onClick={() => selectItem(item.id)}
                      aria-pressed={item.id === selected?.id}
                    >
                      <span className="rv-check-copy">
                        <span className="rv-check-title">
                          <span>
                            {item.reasonCodes.map(reasonName).join("、") ||
                              item.title}
                          </span>
                          {item.status !== "PENDING" && (
                            <CheckCircle2 size={15} aria-label="已结论" />
                          )}
                        </span>
                        <span className="rv-check-meta">
                          {CHECK_LABELS[item.checkType]} ·{" "}
                          {item.reasonCodes.join("、")}
                        </span>
                        {item.hasNewEvidence && (
                          <Badge tone="info">新材料</Badge>
                        )}
                      </span>
                    </Button>
                  </div>
                ))}
              </section>
            ))}
          </aside>
          <section className="rv-center" aria-label="证据审核">
            <div className="rv-evidence" ref={evidenceElement}>
              <div className="rv-evidence-heading">
                <h2>
                  {selected
                    ? selected.reasonCodes.map(reasonName).join("、") ||
                      selected.title
                    : "证据审核"}
                </h2>
                <Button
                  label={referenceOpen ? "收起参考" : "展开参考"}
                  size="sm"
                  variant="ghost"
                  aria-expanded={referenceOpen}
                  aria-controls="review-reference"
                  onClick={() => setReferenceOpen(!referenceOpen)}
                />
              </div>
              {selected ? (
                <EvidencePanel
                  key={selected.id}
                  evidence={data.evidence ?? []}
                  item={selected}
                  draft={draft}
                  onDraft={updateDraft}
                  onMedia={reviewer ? media : undefined}
                  readOnly={!editable || !selectedPending || needsEscalation}
                />
              ) : (
                <Empty title="本单无需逐项审核" />
              )}
            </div>
            {selected && (
              <section
                className="rv-conclusion"
                aria-label="本项结论"
                onClickCapture={(event) => {
                  if (
                    canClaim &&
                    !(event.target as HTMLElement).closest(
                      "[data-claim-trigger], .inline-confirm",
                    )
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    const button = (
                      event.target as HTMLElement
                    ).closest<HTMLButtonElement>("button");
                    requestClaim(
                      button
                        ? () => requestAnimationFrame(() => button.click())
                        : undefined,
                    );
                  }
                }}
              >
                {canClaim && (
                  <div
                    ref={claimTrigger}
                    data-claim-trigger
                    className="rv-claim-prompt"
                  >
                    <span>
                      本单尚未领取，可浏览全部证据；开始判断前请领取。
                    </span>
                    <InlineConfirm
                      title="领取此工单并继续当前操作？"
                      confirmLabel="领取并继续"
                      onConfirm={claimAndContinue}
                      busy={busy}
                    >
                      <Button
                        label="领取并继续"
                        size="sm"
                        tooltip="领取后继续本项审核"
                      />
                    </InlineConfirm>
                  </div>
                )}
                {selectedPending ? (
                  <div className="rv-conclusion-content">
                    {selected.checkType === "SCREENING_WATCHLIST" ? (
                      <div className="rv-derived-conclusion" aria-live="polite">
                        <strong>
                          本项结论：
                          {
                            options.find(
                              (option) => option.value === watchConclusion,
                            )?.label
                          }
                        </strong>
                        <span className="secondary">
                          由各命中处置自动合成；
                          {watchComplete
                            ? "全部命中已处置"
                            : "请完成全部命中的结论和原因"}
                        </span>
                      </div>
                    ) : (
                      <div
                        className="rv-conclusion-choices"
                        role="group"
                        aria-label="本项结论"
                      >
                        <strong>本项结论</strong>
                        <div className="row">
                          {options.map((option, index) => {
                            const unavailable =
                              needsEscalation ||
                              (!editable && !canClaim) ||
                              (missingEvidence.length > 0 &&
                                option.value !== "MANUAL_PASS" &&
                                !DECLINE_CONCLUSIONS[option.value] &&
                                !SUPPLEMENT_CONCLUSIONS[option.value]);
                            return (
                              <Button
                                key={option.value}
                                label={option.label}
                                size="sm"
                                variant={
                                  conclusion === option.value
                                    ? "primary"
                                    : "secondary"
                                }
                                aria-pressed={conclusion === option.value}
                                isDisabled={unavailable}
                                tooltip={
                                  unavailable
                                    ? readOnlyReason ||
                                      "证据未齐或需转受限，当前结论不可用"
                                    : `${option.label}${index < 3 ? ` · ${index + 1}` : ""}`
                                }
                                onClick={() => chooseConclusion(option.value)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="rv-conclusion-row">
                      {selected.checkType !== "SCREENING_WATCHLIST" && (
                        <div className="rv-reasons">
                          {reasons.length < 5 ? (
                            <div role="group" aria-label="结论原因">
                              <div className="secondary">
                                结论原因{!conclusion && " · 请先选择结论"}
                              </div>
                              <div className="row">
                                {reasons.map((value) => (
                                  <Button
                                    key={value}
                                    label={value}
                                    size="sm"
                                    variant={
                                      reason === value ? "primary" : "secondary"
                                    }
                                    aria-pressed={reason === value}
                                    isDisabled={!editable || needsEscalation}
                                    tooltip={
                                      readOnlyReason ||
                                      "选择原因后按 Ctrl + Enter 提交本项"
                                    }
                                    onClick={() => remember({ reason: value })}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : (
                            <Selector
                              label="结论原因"
                              value={reason || undefined}
                              placeholder="选择原因"
                              isDisabled={!editable || needsEscalation}
                              options={reasons.map((value) => ({
                                value,
                                label: value,
                              }))}
                              onChange={(value) => remember({ reason: value })}
                            />
                          )}
                        </div>
                      )}
                      <Button
                        label="提交本项"
                        variant="primary"
                        tooltip={
                          readOnlyReason ||
                          (needsEscalation
                            ? "请先完成转受限"
                            : selected.checkType === "SCREENING_WATCHLIST" &&
                                !watchComplete
                              ? "请逐个完成命中结论与原因"
                              : !conclusion || !reason
                                ? "选择结论和原因后可用 · Ctrl + Enter"
                                : "提交本项 · Ctrl + Enter")
                        }
                        isDisabled={
                          !editable ||
                          needsEscalation ||
                          (selected.checkType === "SCREENING_WATCHLIST"
                            ? !watchComplete
                            : !conclusion || !reason)
                        }
                        isLoading={busy}
                        onClick={submitItem}
                      />
                    </div>
                    <div className="rv-note-toggle">
                      <Button
                        label={
                          selected.checkType === "MANUAL_VERIFY"
                            ? "核验说明"
                            : "备注"
                        }
                        variant="ghost"
                        size="sm"
                        aria-expanded={notesOpen}
                        aria-controls="review-item-note"
                        icon={
                          notesOpen ? (
                            <ChevronRight
                              size={14}
                              className="rv-expanded-icon"
                            />
                          ) : (
                            <ChevronRight size={14} />
                          )
                        }
                        onClick={() => setNotesOpen(!notesOpen)}
                      />
                      {readOnlyReason && (
                        <span className="secondary">{readOnlyReason}</span>
                      )}
                    </div>
                    {notesOpen && (
                      <div id="review-item-note">
                        <TextArea
                          label={
                            selected.checkType === "MANUAL_VERIFY"
                              ? "核验说明"
                              : "备注"
                          }
                          isLabelHidden
                          value={note}
                          onChange={(value) => remember({ note: value })}
                          rows={2}
                          maxLength={2000}
                          isDisabled={!editable || needsEscalation}
                        />
                      </div>
                    )}
                    {selected.checkType === "CLASSIFICATION" &&
                      conclusion === "CHANGE_MCC" && (
                        <Banner
                          status="info"
                          title={`MCC：${mccName(data.merchant.declaredMcc)} → ${mccName(draft.mcc)}；风险等级：${MCC_CHOICES.find((choice) => choice.value === draft.mcc)?.risk ?? "待核定"}。高风险类目将进入审批。`}
                        />
                      )}
                    {dirty && (
                      <span className="secondary" role="status">
                        {draftStorageError
                          ? "草稿仅保留在当前页面"
                          : "未提交内容已自动保存为本机草稿"}
                      </span>
                    )}
                    {formError && <Banner status="error" title={formError} />}
                  </div>
                ) : (
                  <div className="rv-conclusion-content">
                    <div className="row">
                      <Badge tone="success">
                        {options.find(
                          (option) => option.value === selected.conclusion,
                        )?.label ??
                          (selected.status === "AUTO_CLOSED"
                            ? "自动结论"
                            : selected.conclusion)}
                      </Badge>
                      <span>{selected.conclusionReason}</span>
                      <PersonName user={selected.decidedBy} />
                    </div>
                    {selected.note && (
                      <p className="rv-saved-note">{selected.note}</p>
                    )}
                    {editable && !needsEscalation && (
                      <Button
                        label="重新审核"
                        size="sm"
                        onClick={() =>
                          openPreview({
                            title: "重新审核本项",
                            description:
                              "当前检查项回到待处理，原结论和证据快照保留。",
                            merchant: "审核中。",
                            sales: "审核中。",
                            reversible: "重新提交后产生新的结论记录。",
                            label: "确认重新审核",
                            reason: true,
                            execute: async (value) =>
                              !!(await act("reopen-item", {
                                itemId: selected.id,
                                reason: value,
                              })),
                          })
                        }
                      />
                    )}
                  </div>
                )}
                {pending.length === 0 && (
                  <div className="rv-composed-result" aria-live="polite">
                    <strong>
                      合成结论：
                      {needsEscalation
                        ? "转受限"
                        : unsubmittedSupplement
                          ? "待提补件需求"
                          : resultNames[suggested]}
                    </strong>
                    <span>
                      商户看到：
                      {suggested === "DECLINED"
                        ? "未通过，使用通用文案，不披露内部原因。"
                        : "审核中。"}
                    </span>
                    <span className="secondary">
                      下一步：
                      {needsEscalation
                        ? "确认转受限后由合规负责人处置"
                        : unsubmittedSupplement
                          ? "向运营提交补件需求"
                          : suggested === "PENDING_APPROVAL"
                            ? "提交审批，按授权完成审批"
                            : suggested === "DECLINED"
                              ? "确认拒绝后终止申请"
                              : "确认通过后进入渠道进件"}
                    </span>
                  </div>
                )}
              </section>
            )}
          </section>
          {referenceOpen && (
            <aside
              className="rv-reference"
              id="review-reference"
              aria-label="参考信息"
            >
              <div className="rv-reference-close">
                <Button
                  label="收起参考"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReferenceOpen(false)}
                />
              </div>
              <TabList
                role="tablist"
                aria-label="参考信息分类"
                value={referenceTab}
                onChange={setReferenceTab}
                size="md"
                hasDivider
                overflow="auto"
              >
                {referenceTabs.map((tab) => (
                  <Tab
                    key={tab.key}
                    id={`review-tab-${tab.key}`}
                    value={tab.key}
                    label={tab.label}
                    panelId={`review-panel-${tab.key}`}
                  />
                ))}
              </TabList>
              <div
                className="rv-reference-content"
                id={`review-panel-${referenceTab}`}
                role="tabpanel"
                aria-labelledby={`review-tab-${referenceTab}`}
                tabIndex={0}
              >
                {referenceTab === "application" && (
                  <div className="stack">
                    <dl className="details-grid rv-details">
                      <div>
                        <dt>申请号</dt>
                        <dd>
                          <Link to={`/applications/${data.application.id}`}>
                            <IdText value={data.application.id} />
                          </Link>
                        </dd>
                      </div>
                      <div>
                        <dt>法定名称</dt>
                        <dd>{data.merchant.legalName}</dd>
                      </div>
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
                        <dt>登记机构</dt>
                        <dd>{data.merchant.registrationAuthority}</dd>
                      </div>
                      <div>
                        <dt>申报 MCC</dt>
                        <dd>{mccName(data.merchant.declaredMcc)}</dd>
                      </div>
                      <div>
                        <dt>月交易额</dt>
                        <dd>{money(data.merchant.expectedMonthlyVolume)}</dd>
                      </div>
                      <div>
                        <dt>业务模式</dt>
                        <dd>{data.merchant.businessModel}</dd>
                      </div>
                      <div>
                        <dt>网站</dt>
                        <dd>{data.merchant.website}</dd>
                      </div>
                      <div>
                        <dt>销售负责人</dt>
                        <dd>
                          <PersonName user={data.application.salesOwner} />
                        </dd>
                      </div>
                      <div>
                        <dt>提交时间</dt>
                        <dd>{dateTime(data.application.createdAt)}</dd>
                      </div>
                    </dl>
                    {personaSources.map((source) => (
                      <Button
                        key={source.id}
                        label="在 Persona 中打开"
                        width="100%"
                        isDisabled={busy || stale}
                        onClick={async () => {
                          const tab = window.open("", "_blank");
                          if (tab) tab.opener = null;
                          const result = await act("persona", {
                            evidenceId: source.id,
                          });
                          const url = result?.evidence?.find(
                            (value) => value.id === source.id,
                          )?.fields.sourceUrl;
                          if (
                            result &&
                            typeof url === "string" &&
                            /^https:\/\//i.test(url)
                          ) {
                            if (tab) tab.location.href = url;
                          } else tab?.close();
                        }}
                      />
                    ))}
                  </div>
                )}
                {referenceTab === "people" &&
                  (data.people?.length ? (
                    <ul className="rv-list">
                      {data.people.map((person, index) => (
                        <li key={index}>
                          <div className="row">
                            <strong>{person.name}</strong>
                            {!person.declared && (
                              <Badge tone="warning">未申报</Badge>
                            )}
                          </div>
                          <div>
                            {person.role} ·{" "}
                            {person.ownershipPct == null ||
                            person.ownershipPct === 0
                              ? "—"
                              : `${person.ownershipPct.toFixed(1)}%`}
                          </div>
                          <span className="secondary">
                            {person.needsReverify
                              ? "待重新验证"
                              : verificationStatus(person.kycStatus)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="暂无关联人员" />
                  ))}
                {referenceTab === "supplements" &&
                  (data.supplements?.length ? (
                    <div className="stack">
                      {data.supplements.map((supplement) => (
                        <Card
                          key={supplement.id}
                          padding={3}
                          className="rv-reference-card"
                        >
                          <div className="spread">
                            <IdText value={supplement.id} />
                            <StatusBadge status={supplement.status} />
                          </div>
                          <dl className="details-grid rv-details">
                            <div>
                              <dt>处理人</dt>
                              <dd>
                                <PersonName user={supplement.assignee} />
                              </dd>
                            </div>
                            <div>
                              <dt>发送时间</dt>
                              <dd>{dateTime(supplement.sentAt)}</dd>
                            </div>
                            <div>
                              <dt>截止时间</dt>
                              <dd>
                                {deadlineDate(
                                  supplement.dueAt,
                                  data.merchant.country,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>商户回复</dt>
                              <dd>
                                {supplement.items?.some(
                                  (item) => item.status === "PROVIDED",
                                )
                                  ? "已回复"
                                  : "未回复"}
                              </dd>
                            </div>
                          </dl>
                          <ul className="rv-list">
                            {(supplement.items ?? []).map((item, index) => (
                              <li key={index}>
                                <div>{item.externalText}</div>
                                <div className="row">
                                  <Badge>
                                    {
                                      (
                                        {
                                          PENDING: "待发送",
                                          SENT: "等待回复",
                                          PROVIDED: "已补交",
                                          REJECTED: "不合格",
                                          MISSING: "未提供",
                                        } as Record<string, string>
                                      )[item.status]
                                    }
                                  </Badge>
                                  {item.checked && (
                                    <Badge tone="success">齐套检查可用</Badge>
                                  )}
                                </div>
                                {item.rejectReason && (
                                  <span className="rv-danger">
                                    {item.rejectReason}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          <h3 className="section-title">沟通记录摘要</h3>
                          {supplement.contactLog?.length ? (
                            <ul className="rv-list">
                              {supplement.contactLog.map((log, index) => (
                                <li key={index}>
                                  {log.summary}
                                  <div className="secondary">
                                    <PersonName user={log.by} /> ·{" "}
                                    {dateTime(log.at)}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <Empty title="暂无沟通记录" />
                          )}
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Empty title="暂无补件需求" />
                  ))}
                {referenceTab === "history" && (
                  <LoadState
                    loading={history.loading}
                    error={history.error}
                    retry={history.reload}
                  >
                    {history.data?.workOrders?.length ? (
                      <ul className="rv-list">
                        {history.data.workOrders.map((other) => (
                          <li key={other.id}>
                            <Link to={orderPath(other)}>
                              <IdText value={other.id} />
                            </Link>
                            <div className="row">
                              <StatusBadge status={other.status} />
                              <PersonName user={other.assignee} />
                            </div>
                            <span className="secondary">
                              {dateTime(other.createdAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty title="暂无历史工单" />
                    )}
                  </LoadState>
                )}
                {referenceTab === "logs" && (
                  <div className="stack">
                    {reviewer && owner && (
                      <div className="rv-comment">
                        <TextArea
                          label="合规内部备注"
                          value={comment}
                          onChange={updateComment}
                          rows={3}
                          maxLength={2000}
                        />
                        <Button
                          label="添加备注"
                          isDisabled={!comment.trim() || busy || stale}
                          tooltip={
                            stale
                              ? "刷新工单后可用"
                              : busy
                                ? "正在保存，请稍候"
                                : !comment.trim()
                                  ? "填写备注后可用"
                                  : "保存内部备注，5 秒内可撤销"
                          }
                          onClick={async () => {
                            if (await act("note", { note: comment.trim() }))
                              updateComment("");
                          }}
                        />
                      </div>
                    )}
                    <Timeline audit={data.audit ?? []} />
                    <ul className="rv-list">
                      {(data.audit ?? [])
                        .filter((log) => log.snapshotId)
                        .map((log, index) => (
                          <li key={index}>
                            <Button
                              label={`查看证据快照 ${log.snapshotId}`}
                              variant="ghost"
                              size="sm"
                              isLoading={snapshotLoading}
                              onClick={async () => {
                                setSnapshotLoading(true);
                                try {
                                  setSnapshot(
                                    await api.snapshot(log.snapshotId, session),
                                  );
                                } catch (failure) {
                                  notice(
                                    failure instanceof Error
                                      ? failure.message
                                      : "证据快照加载失败",
                                  );
                                } finally {
                                  setSnapshotLoading(false);
                                }
                              }}
                            >
                              查看证据快照 <IdText value={log.snapshotId} />
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
      <SupplementNeedsDialog
        data={data}
        open={supplementOpen}
        busy={busy}
        onClose={() => setSupplementOpen(false)}
        onSubmit={async (payload) =>
          completeCase(await act("supplement-needs", payload))
        }
      />
      <Confirm
        open={!!preview}
        title={preview?.title ?? ""}
        description={preview?.description ?? ""}
        merchant={
          preview?.finalize
            ? outcome === "DECLINED"
              ? "未通过，使用通用文案。"
              : "审核中。"
            : preview?.merchant
        }
        sales={
          preview?.finalize
            ? outcome === "DECLINED"
              ? "未通过，仅展示允许披露的对外类别。"
              : "审核中。"
            : preview?.sales
        }
        reversible={preview?.reversible}
        confirmLabel={preview?.label ?? "确认"}
        danger={preview?.danger}
        busy={busy}
        confirmDisabled={
          (!!preview?.reason ||
            (!!preview?.finalize && outcome !== suggested)) &&
          !previewReason.trim()
        }
        onClose={() => setPreview(null)}
        onConfirm={async () => {
          if (preview && (await preview.execute(previewReason.trim(), outcome)))
            setPreview(null);
        }}
      >
        <div className="stack">
          {preview?.finalize && (
            <RadioList label="最终结果" value={outcome} onChange={setOutcome}>
              {Object.entries(resultNames).map(([value, label]) => (
                <RadioListItem
                  key={value}
                  value={value}
                  label={label}
                  isDisabled={
                    (value === "APPROVED" &&
                      (missingEvidence.length > 0 ||
                        !!order.approvalReasons?.length)) ||
                    (value === "PENDING_APPROVAL" && missingEvidence.length > 0)
                  }
                />
              ))}
            </RadioList>
          )}
          {(preview?.reason || (preview?.finalize && outcome !== suggested)) &&
            (preview?.finalize ? (
              <div role="group" aria-label="改判原因" className="rv-reasons">
                <strong>改判原因（必选）</strong>
                <div className="row">
                  {[
                    "补充证据推翻原判断",
                    "风险已缓释",
                    "证据支持拒绝",
                    "需上级授权评估",
                  ].map((value) => (
                    <Button
                      key={value}
                      label={value}
                      size="sm"
                      variant={
                        previewReason === value ? "primary" : "secondary"
                      }
                      aria-pressed={previewReason === value}
                      onClick={() => setPreviewReason(value)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <TextArea
                label="原因"
                isRequired
                value={previewReason}
                onChange={setPreviewReason}
                rows={3}
              />
            ))}
        </div>
      </Confirm>
      <Dialog isOpen={helpOpen} onOpenChange={setHelpOpen} width={480}>
        <div className="stack">
          <DialogHeader title="审核快捷键" onOpenChange={setHelpOpen} />
          <dl className="rv-shortcuts">
            <dt>
              <kbd>J</kbd> / <kbd>K</kbd>
            </dt>
            <dd>下一项 / 上一项检查</dd>
            <dt>
              <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd>
            </dt>
            <dd>选择对应结论，名单筛查由命中处置自动得出</dd>
            <dt>
              <kbd>Ctrl + Enter</kbd>
            </dt>
            <dd>提交本项；全部完成后打开结案或审批确认</dd>
            <dt>
              <kbd>]</kbd>
            </dt>
            <dd>领取并打开队列下一张</dd>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>打开本表</dd>
            <dt>
              <kbd>Tab</kbd> / <kbd>Enter</kbd>
            </dt>
            <dd>移动焦点 / 选择原因或确认当前按钮</dd>
          </dl>
          <p className="secondary">
            输入文字、展开选择器或确认弹窗时不触发全局快捷键。最终结案、拒绝和转受限始终需要确认。
          </p>
          <Button
            label="知道了"
            variant="primary"
            onClick={() => setHelpOpen(false)}
          />
        </div>
      </Dialog>
      <Dialog
        isOpen={blocker.state === "blocked" || !!sessionLeave}
        onOpenChange={(open) => {
          if (!open) {
            if (blocker.state === "blocked") blocker.reset();
            setSessionLeave(null);
          }
        }}
        width={460}
      >
        <div className="stack">
          <DialogHeader
            title="还有未提交的审核内容"
            onOpenChange={(open) => {
              if (!open) {
                if (blocker.state === "blocked") blocker.reset();
                setSessionLeave(null);
              }
            }}
          />
          <p>
            {draftStorageError
              ? "本机保存失败，离开可能丢失未提交内容。建议留在此页完成提交。"
              : "结论、原因、证据处置和备注已保存到当前账号的本机草稿。离开不会提交，返回同一工单可继续。"}{" "}
          </p>
          <div className="action-row">
            <Button
              label="留在此页"
              variant="primary"
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
                setSessionLeave(null);
              }}
            />
            <Button
              label="离开并保留草稿"
              onClick={() => {
                const proceed = sessionLeave;
                setSessionLeave(null);
                if (proceed) {
                  completedNavigation.current = true;
                  proceed();
                } else if (blocker.state === "blocked") blocker.proceed();
              }}
            />
          </div>
        </div>
      </Dialog>
      <Dialog
        isOpen={!!snapshot}
        onOpenChange={(open) => {
          if (!open) setSnapshot(null);
        }}
        width={900}
      >
        <div className="stack">
          <DialogHeader
            title="证据快照"
            onOpenChange={(open) => {
              if (!open) setSnapshot(null);
            }}
          />
          {snapshot && (
            <>
              <p>
                <IdText value={snapshot.id} /> · {dateTime(snapshot.at)}
              </p>
              {snapshot.checkItems.map((item) => (
                <Card key={item.id} padding={4}>
                  <h3 className="section-title">
                    {item.reasonCodes.map(reasonName).join("、")}
                  </h3>
                  <EvidencePanel
                    item={item}
                    evidence={snapshot.evidence}
                    draft={{
                      ...emptyEvidenceDraft(),
                      hitConclusions: item.hitConclusions ?? {},
                      articles: Object.fromEntries(
                        Object.entries(item.articles ?? {}).map(
                          ([id, value]) => [
                            id,
                            {
                              relevance: value.relevance,
                              reason: value.reason ?? "",
                            },
                          ],
                        ),
                      ),
                    }}
                    onDraft={() => {}}
                    readOnly
                  />
                </Card>
              ))}
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}
