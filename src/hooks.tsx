import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "@astryxdesign/core/Toast";
import { Button } from "@astryxdesign/core/Button";
import { DEFAULT_SESSION, USERS, homePath, orderPath } from "./access";
import { api } from "./api";
import type { Session, OrderDetail, MutationAction } from "./types";
const SessionContext = createContext<{
  session: Session;
  setSession: (s: Session) => void;
}>({
  session: DEFAULT_SESSION,
  setSession: () => {
    throw new Error("缺少 SessionProvider");
  },
});
const NoticeContext = createContext<(message: string) => void>(() => {});
export function Providers({ children }: { children: ReactNode }) {
  const [session, setValue] = useState<Session>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("intake-session-v06") || "null",
      );
      return stored &&
        USERS.some(
          (u) => u.id === stored.userId && u.roles.includes(stored.role),
        )
        ? stored
        : DEFAULT_SESSION;
    } catch {
      return DEFAULT_SESSION;
    }
  });
  const showToast = useToast();
  const notify = useCallback(
    (body: string) => {
      showToast({ body, autoHideDuration: 5000 });
    },
    [showToast],
  );
  const setSession = useCallback((s: Session) => {
    localStorage.setItem("intake-session-v06", JSON.stringify(s));
    setValue(s);
  }, []);
  return (
    <SessionContext.Provider value={{ session, setSession }}>
      <NoticeContext.Provider value={notify}>{children}</NoticeContext.Provider>
    </SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
export const useNotice = () => useContext(NoticeContext);

export interface QueueContext {
  url: string;
  ids: string[];
  scrollTop: number;
  scrollLeft?: number;
  sort?: unknown;
  page?: number;
  pageSize?: number;
}
export function getQueueContext(session: Session): QueueContext | null {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(`intake-queue-v06:${session.userId}`) ?? "null",
    );
    return saved &&
      typeof saved.url === "string" &&
      saved.url.startsWith("/queue/") &&
      Array.isArray(saved.ids) &&
      saved.ids.every((id: unknown) => typeof id === "string")
      ? saved
      : null;
  } catch {
    return null;
  }
}
export function saveQueueContext(session: Session, context: QueueContext) {
  sessionStorage.setItem(
    `intake-queue-v06:${session.userId}`,
    JSON.stringify(context),
  );
}
export function useQueueFlow() {
  const { session } = useSession();
  const navigate = useNavigate();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const queueUrl = getQueueContext(session)?.url ?? homePath(session.role);
  const next = async (excludeId?: string) => {
    if (active.current) return null;
    active.current = true;
    setBusy(true);
    try {
      const context = getQueueContext(session);
      const ids =
        context?.ids ??
        (await api.listOrders({}, session)).rows.map((row) => row.id);
      const result = await api.claimNext(ids, session, excludeId);
      if (result) navigate(orderPath(result.workOrder));
      else notice("当前队列没有可处理的工单");
      return result;
    } catch (failure) {
      notice(failure instanceof Error ? failure.message : "无法领取下一张工单");
      return null;
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return { queueUrl, next, busy };
}
export function useDetailView(
  defaultView: string,
  allowedViews: readonly string[],
  queryKey = "view",
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get(queryKey);
  const view =
    requested && allowedViews.includes(requested) ? requested : defaultView;
  const setView = (nextView: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextView === defaultView) next.delete(queryKey);
      else next.set(queryKey, nextView);
      return next;
    });
  };
  return [view, setView];
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    setData(null);
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(loader)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e : new Error("加载失败，请重试"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return { data, loading, error, reload };
}
export function useOrder() {
  const { id = "" } = useParams();
  const { session } = useSession();
  const resource = useAsync(
    () => api.getOrder(id, session),
    [id, session.role, session.userId],
  );
  const [local, setLocal] = useState<OrderDetail | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const notify = useNotice();
  const showToast = useToast();
  const revision = useRef(0);
  useEffect(() => {
    setLocal(null);
    setStale(false);
    setMutationError("");
    revision.current++;
  }, [id, session.role, session.userId, resource.data]);
  useEffect(() => {
    const changed = () => {
      if (acting.current) return;
      void api
        .getOrder(id, session)
        .then((latest) => {
          if (
            current.current &&
            latest.workOrder.version !== current.current.workOrder.version
          )
            setStale(true);
        })
        .catch(() => setStale(true));
    };
    window.addEventListener("storage", changed);
    window.addEventListener("workbench:updated", changed);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("workbench:updated", changed);
    };
  }, [id, session.role, session.userId]);
  const data = local || resource.data;
  const current = useRef(data);
  current.current = data;
  const acting = useRef(false);
  const act = async (
    action: MutationAction,
    payload: Record<string, any> = {},
  ) => {
    if (!current.current || acting.current) return null;
    acting.current = true;
    setBusy(true);
    setMutationError("");
    const rev = revision.current;
    try {
      const result = await api.mutate(
        id,
        action,
        payload,
        current.current.workOrder.version,
        session,
      );
      if (rev === revision.current) {
        current.current = result;
        setLocal(result);
        setStale(false);
      }
      if (result.undo) {
        const { token, expiresAt } = result.undo;
        const dismiss = showToast({
          body:
            action === "conclusion"
              ? "本项结论已保存"
              : action === "contact-logs"
                ? "沟通记录已保存"
                : "备注已保存",
          autoHideDuration: Math.max(1, Date.parse(expiresAt) - Date.now()),
          uniqueID: `undo:${session.userId}:${id}`,
          endContent: (
            <Button
              label="撤销"
              variant="ghost"
              size="sm"
              tooltip="提交后 5 秒内可撤销；后续操作后不可撤销"
              onClick={async () => {
                dismiss();
                try {
                  const restored = await api.undo(token, session);
                  if (rev === revision.current) {
                    current.current = restored;
                    setLocal(restored);
                    setStale(false);
                  }
                  notify("已撤销，操作记录已保留");
                } catch (failure) {
                  notify(
                    failure instanceof Error ? failure.message : "无法撤销",
                  );
                }
              }}
            />
          ),
        });
      }
      return result;
    } catch (e) {
      const err = e as Error & { status?: number };
      if (rev === revision.current) {
        if (err.status === 409) setStale(true);
        setMutationError(err.message || "操作失败，请重试");
      }
      notify(err.message || "操作失败，请重试");
      return null;
    } finally {
      acting.current = false;
      setBusy(false);
    }
  };
  return {
    ...resource,
    data,
    stale,
    busy,
    act,
    mutationError,
    reload: () => {
      setLocal(null);
      setStale(false);
      setMutationError("");
      resource.reload();
    },
  };
}
