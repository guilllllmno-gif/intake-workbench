import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  createBrowserRouter,
  createHashRouter,
  RouterProvider,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useHref,
  useNavigate,
} from "react-router-dom";
import { LayerProvider } from "@astryxdesign/core";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav } from "@astryxdesign/core/TopNav";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuDivider,
} from "@astryxdesign/core/DropdownMenu";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Popover } from "@astryxdesign/core/Popover";
import { Theme } from "@astryxdesign/core/theme";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import zhCN from "@astryxdesign/core/locales/zh-CN.generated.js";
import {
  Bell,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileSearch,
  Inbox,
  ListChecks,
  LockKeyhole,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  CircleHelp,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { api } from "./api";
import { Providers, useAsync, useNotice, useSession } from "./hooks";
import {
  DEFAULT_SESSION,
  MENUS,
  ROLE_LABELS,
  SCENARIOS,
  USERS,
  homePath,
  menuPath,
  orderPath,
  sessionFor,
} from "./access";
import { Confirm, DialogHeader, Empty, LoadState } from "./ui";
import { dateTime, statusLabel } from "./format";
import { workbenchTheme } from "./theme";
import type { QueueView, SearchResult, Session } from "./types";
import QueuePage from "./pages/QueuePage";
import ReviewPage from "./pages/ReviewPage";
import ApprovalPage from "./pages/ApprovalPage";
import CompliancePage from "./pages/CompliancePage";
import QaPage from "./pages/QaPage";
import ChannelPage from "./pages/ChannelPage";
import SupplementPage from "./pages/SupplementPage";
import ApplicationsPage from "./pages/ApplicationsPage";
import ApplicationPage from "./pages/ApplicationPage";
import MetricsPage from "./pages/MetricsPage";
import MerchantPage from "./pages/MerchantPage";

const menuIcons: Record<string, LucideIcon> = {
  ops: Inbox,
  team: UsersRound,
  extensions: ClipboardCheck,
  channel: ListChecks,
  review: ClipboardCheck,
  qa: ShieldCheck,
  restricted: LockKeyhole,
  approval: ClipboardCheck,
  applications: FileSearch,
  metrics: ChartNoAxesCombined,
};

interface RecentView {
  id: string;
  path: string;
  label: string;
}
function recentViews(session: Session): RecentView[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(`intake-recent-v06:${session.userId}`) ?? "[]",
    );
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              typeof item.id === "string" &&
              typeof item.path === "string" &&
              typeof item.label === "string" &&
              item.path.startsWith("/"),
          )
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function Shell() {
  const { session, setSession } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const rootHref = useHref("/");
  const merchantRoute =
    location.pathname === "/merchant" ||
    location.pathname.startsWith("/merchant/");
  const notice = useNotice();
  const [collapsed, setCollapsed] = useState(false);
  const [guide, setGuide] = useState(false);
  const [reset, setReset] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchVersion = useRef(0);
  const [recent, setRecent] = useState<RecentView[]>(() =>
    recentViews(session),
  );
  const [revision, setRevision] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const menu = MENUS[session.role];
  const { data: counts } = useAsync<Partial<Record<QueueView, number>>>(
    () =>
      session.role === "MERCHANT" || merchantRoute
        ? Promise.resolve({})
        : api.actionCounts(session),
    [session.userId, session.role, merchantRoute, revision],
  );
  const notificationResource = useAsync(
    () =>
      session.role === "MERCHANT" || merchantRoute
        ? Promise.resolve([])
        : api.notifications(session),
    [session.userId, session.role, merchantRoute, revision],
  );
  const searchResource = useAsync<SearchResult[]>(
    () =>
      session.role === "MERCHANT" || merchantRoute || !search.trim()
        ? Promise.resolve([])
        : api.search(search.trim(), session),
    [search, session.userId, session.role, merchantRoute, revision],
  );
  useEffect(() => {
    searchVersion.current++;
  }, [search, session.userId, session.role]);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("workbench:updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("workbench:updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    setRecent(recentViews(session));
    setSearch("");
    setSearchOpen(false);
  }, [session.userId, session.role]);
  useEffect(() => {
    if (session.role === "MERCHANT") return;
    const match = location.pathname.match(
      /^\/(applications|orders|approvals|restricted|qa|channels|supplements)\/([^/]+)$/,
    );
    if (!match) return;
    let active = true;
    const [, group, id] = match;
    void (
      group === "applications"
        ? api.getApplication(id, session)
        : api.getOrder(id, session)
    )
      .then((detail) => {
        if (!active) return;
        const item = {
          id,
          path: location.pathname,
          label: detail.merchant.legalName,
        };
        const views = [
          item,
          ...recentViews(session).filter((view) => view.id !== id),
        ].slice(0, 5);
        localStorage.setItem(
          `intake-recent-v06:${session.userId}`,
          JSON.stringify(views),
        );
        setRecent(views);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname, session.userId, session.role]);
  useEffect(() => {
    const main = document.getElementById("astryx-app-shell-main");
    main?.focus({ preventScroll: true });
    if (!location.pathname.startsWith("/queue/")) main?.scrollTo(0, 0);
  }, [location.pathname]);
  const changeUser = (id: string) => {
    const user = USERS.find((u) => u.id === id);
    if (!user) return;
    const proceed = () => {
      const nextSession = sessionFor(user);
      setSession(nextSession);
      setLoggedOut(false);
      setNotificationsOpen(false);
      navigate(homePath(nextSession.role));
      notice(`已切换为${ROLE_LABELS[nextSession.role]} · ${nextSession.name}`);
    };
    const event = new CustomEvent("workbench:session-change", {
      cancelable: true,
      detail: { proceed },
    });
    if (window.dispatchEvent(event)) proceed();
  };
  const openSearchResult = (path: string) => {
    navigate(path);
    setSearchOpen(false);
    setSearch("");
  };
  const searchAll = async (value: string) => {
    const term = value.trim();
    if (!term) return;
    const version = searchVersion.current;
    try {
      const matches = await api.search(term, session);
      if (version !== searchVersion.current) return;
      if (matches[0]) openSearchResult(matches[0].path);
      else setSearchOpen(true);
    } catch (error) {
      if (version === searchVersion.current)
        notice(error instanceof Error ? error.message : "搜索失败，请重试");
    }
  };
  const navigateLink = (event: MouseEvent, path: string) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    navigate(path);
  };
  const unread = notificationResource.data?.filter((n) => !n.read).length ?? 0;
  const activeSection = location.pathname.startsWith("/orders/")
    ? "review"
    : location.pathname.startsWith("/supplements/")
      ? menu.some((m) => m.key === "ops")
        ? "ops"
        : "team"
      : location.pathname.startsWith("/channels/")
        ? "channel"
        : location.pathname.startsWith("/approvals/")
          ? "approval"
          : location.pathname.startsWith("/restricted/")
            ? "restricted"
            : location.pathname.startsWith("/qa/")
              ? "qa"
              : undefined;
  if (merchantRoute)
    return (
      <Routes>
        <Route path="/merchant" element={<MerchantPage />} />
        <Route path="/merchant/:id" element={<MerchantPage />} />
      </Routes>
    );
  const header = (
    <TopNav
      className="workspace-topnav"
      label="全局导航"
      heading={
        <div className="workspace-brand-group">
          {session.role !== "MERCHANT" && (
            <Button
              label={collapsed ? "展开菜单" : "收起菜单"}
              variant="ghost"
              size="sm"
              isIconOnly
              icon={
                collapsed ? (
                  <PanelLeftOpen size={17} />
                ) : (
                  <PanelLeftClose size={17} />
                )
              }
              onClick={() => setCollapsed(!collapsed)}
            />
          )}
          <Link to={homePath(session.role)} className="workspace-brand">
            <span className="workspace-brand-icon">
              <ShieldCheck size={19} strokeWidth={1.8} />
            </span>
            <span>进件工作台</span>
          </Link>
        </div>
      }
      startContent={
        session.role !== "MERCHANT" && (
          <div
            className="global-search-wrap"
            onFocus={() => setSearchOpen(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setSearchOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
            }}
          >
            <TextInput
              className="global-search"
              label="全局搜索"
              isLabelHidden
              size="md"
              startIcon={Search}
              placeholder="搜索商户、申请号或工单号"
              value={search}
              onChange={(value) => {
                setSearch(value);
                setSearchOpen(true);
              }}
              onEnter={() => void searchAll(search)}
              hasClear
            />
            {searchOpen && (
              <div
                className="recent-search"
                role="region"
                aria-label={search.trim() ? "搜索结果" : "最近浏览"}
              >
                <h3>
                  {search.trim()
                    ? `匹配结果${searchResource.data ? ` · ${searchResource.data.length}` : ""}`
                    : "最近浏览"}
                </h3>
                {search.trim() ? (
                  searchResource.loading ? (
                    <p className="secondary" role="status">
                      正在搜索
                    </p>
                  ) : searchResource.error ? (
                    <p className="search-error" role="alert">
                      {searchResource.error.message}
                    </p>
                  ) : searchResource.data?.length ? (
                    searchResource.data.map((item) => (
                      <Button
                        key={`${item.kind}:${item.id}`}
                        label={`${item.id} · ${item.label} · ${statusLabel(item.status)}`}
                        variant="ghost"
                        width="100%"
                        className="recent-search-item search-result"
                        onClick={() => openSearchResult(item.path)}
                      >
                        <span className="search-result-copy">
                          <strong>{item.id}</strong>
                          <span>{item.label}</span>
                        </span>
                        <span className="search-result-status">
                          {statusLabel(item.status)}
                        </span>
                      </Button>
                    ))
                  ) : (
                    <p className="secondary" role="status">
                      没有匹配的工单或申请
                    </p>
                  )
                ) : recent.length ? (
                  recent.map((item) => (
                    <Button
                      key={item.id}
                      label={`${item.id} · ${item.label}`}
                      variant="ghost"
                      size="sm"
                      width="100%"
                      className="recent-search-item"
                      onClick={() => openSearchResult(item.path)}
                    />
                  ))
                ) : (
                  <p className="secondary">暂无浏览记录</p>
                )}
              </div>
            )}
          </div>
        )
      }
      endContent={
        <div className="workspace-header-actions">
          <span className="environment-tag">
            <span className="environment-dot" />
            测试环境
          </span>
          <span className="header-timezone">
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
          <Popover
            label="通知"
            alignment="end"
            width={360}
            isOpen={notificationsOpen}
            onOpenChange={setNotificationsOpen}
            content={
              <div className="notification-list">
                <div className="spread notification-heading">
                  <h3>通知</h3>
                  <div className="row">
                    <span className="secondary small">{unread} 条未读</span>
                    <Button
                      label="全部已读"
                      variant="ghost"
                      size="sm"
                      isDisabled={!unread}
                      tooltip={!unread ? "没有未读通知" : "将所有通知标为已读"}
                      onClick={async () => {
                        try {
                          await api.markNotificationsRead("all", session);
                          notificationResource.reload();
                        } catch (failure) {
                          notice(
                            failure instanceof Error
                              ? failure.message
                              : "无法更新通知",
                          );
                        }
                      }}
                    />
                  </div>
                </div>
                <LoadState
                  loading={notificationResource.loading}
                  error={notificationResource.error}
                  retry={notificationResource.reload}
                >
                  {notificationResource.data?.length ? (
                    <ul>
                      {notificationResource.data.map((n) => (
                        <li key={n.id} data-unread={!n.read}>
                          <Button
                            label={n.title}
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                let target = homePath(session.role);
                                if (n.workOrderId) {
                                  const detail = await api.getOrder(
                                    n.workOrderId,
                                    session,
                                  );
                                  target = orderPath(detail.workOrder);
                                } else if (n.type === "SLA") {
                                  target = [
                                    "COMPLIANCE_REVIEWER",
                                    "COMPLIANCE_SENIOR",
                                  ].includes(session.role)
                                    ? "/queue/review?tab=mine"
                                    : session.role === "COMPLIANCE_HEAD"
                                      ? "/queue/restricted"
                                      : session.role === "OPS_LEAD"
                                        ? "/queue/team"
                                        : homePath(session.role);
                                }
                                await api.markNotificationsRead(
                                  [n.id],
                                  session,
                                );
                                setNotificationsOpen(false);
                                navigate(target);
                              } catch (failure) {
                                notice(
                                  failure instanceof Error
                                    ? failure.message
                                    : "无法打开通知",
                                );
                              }
                            }}
                          />
                          <time className="secondary small">
                            {dateTime(n.at, true)}
                          </time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty title="暂无通知" />
                  )}
                </LoadState>
              </div>
            }
          >
            <span className="notification-trigger">
              <Button
                label={`通知${unread ? `，${unread} 条未读` : ""}`}
                variant="ghost"
                isIconOnly
                size="sm"
                icon={<Bell size={17} />}
              />
              {unread > 0 && <span className="notification-dot" />}
            </span>
          </Popover>
          <span className="header-divider" />
          <DropdownMenu
            alignment="end"
            menuWidth={340}
            button={{
              label: `${ROLE_LABELS[session.role]} · ${session.name}`,
              variant: "ghost",
              size: "md",
              icon: <UserRound size={16} />,
            }}
          >
            <div className="user-menu-identity">
              <strong>{session.name}</strong>
              <span>
                {ROLE_LABELS[session.role]} · {session.account} · {session.team}
              </span>
            </div>
            <DropdownMenuDivider />
            {USERS.filter((u) => u.id !== session.userId).map((u) => (
              <DropdownMenuItem
                key={u.id}
                icon={UserRound}
                label={`${ROLE_LABELS[u.roles[0]]} · ${u.name}`}
                description={u.account}
                onClick={() => changeUser(u.id)}
              />
            ))}
            <DropdownMenuItem
              icon={CircleHelp}
              label="原型说明"
              onClick={() => setGuide(true)}
            />
            <DropdownMenuDivider />
            <DropdownMenuItem
              icon={LogOut}
              label="退出"
              onClick={() => {
                localStorage.removeItem("intake-session-v06");
                setLoggedOut(true);
              }}
            />
          </DropdownMenu>
        </div>
      }
    />
  );
  const pages = (
    <div className="workspace-content" key={session.userId}>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={homePath(session.role)} replace />}
        />
        <Route
          path="/queue"
          element={<Navigate to={homePath(session.role)} replace />}
        />
        <Route path="/queue/:view" element={<QueuePage />} />
        <Route path="/orders/:id" element={<ReviewPage />} />
        <Route path="/approvals/:id" element={<ApprovalPage />} />
        <Route path="/restricted/:id" element={<CompliancePage />} />
        <Route path="/qa/:id" element={<QaPage />} />
        <Route path="/channels/:id" element={<ChannelPage />} />
        <Route path="/supplements/:id" element={<SupplementPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/:id" element={<ApplicationPage />} />
        <Route path="/metrics" element={<MetricsPage />} />
        <Route
          path="*"
          element={
            <Empty
              title="页面不存在"
              description={<Link to={homePath(session.role)}>返回首页</Link>}
            />
          }
        />
      </Routes>
    </div>
  );
  if (loggedOut)
    return (
      <div className="login-screen">
        <section className="login-panel">
          <span className="workspace-brand-icon">
            <ShieldCheck size={22} />
          </span>
          <h1>进件工作台</h1>
          <Selector
            label="登录账号"
            value={session.userId}
            options={USERS.map((u) => ({
              value: u.id,
              label: `${u.name} · ${ROLE_LABELS[u.roles[0]]}`,
            }))}
            onChange={(id) =>
              setSession(sessionFor(USERS.find((u) => u.id === id)!))
            }
          />
          <Button
            label="登录"
            variant="primary"
            width="100%"
            onClick={() => changeUser(session.userId)}
          />
        </section>
      </div>
    );
  return (
    <>
      <AppShell
        className={`workbench-layout${session.role === "MERCHANT" ? " merchant-shell" : ""}`}
        variant="section"
        height="fill"
        contentPadding={0}
        onClickCapture={(event) => {
          if (
            (event.target as Element).closest(
              'a[href="#astryx-app-shell-main"]',
            )
          ) {
            // Astryx focuses the content; keep its fragment out of the router.
            event.preventDefault();
          }
        }}
        topNav={header}
        sideNav={
          session.role !== "MERCHANT" ? (
            <SideNav
              className="workspace-sidenav"
              style={{ width: collapsed ? 56 : 208 }}
              collapsible={{
                isCollapsed: collapsed,
                onCollapsedChange: setCollapsed,
                hasButton: false,
              }}
            >
              <SideNavSection title={session.team}>
                {menu.map((m) => (
                  <SideNavItem
                    key={m.key}
                    label={m.label}
                    icon={menuIcons[m.key]}
                    href={`${rootHref}${menuPath(m.key).slice(1)}`}
                    onClick={(event) => navigateLink(event, menuPath(m.key))}
                    isSelected={
                      activeSection === m.key ||
                      location.pathname === menuPath(m.key) ||
                      (m.key === "applications" &&
                        location.pathname.startsWith("/applications/"))
                    }
                    endContent={
                      !collapsed &&
                      m.key !== "applications" &&
                      m.key !== "metrics" &&
                      counts?.[m.key] !== undefined ? (
                        <span className="menu-count">{counts[m.key]}</span>
                      ) : undefined
                    }
                  />
                ))}
              </SideNavSection>
            </SideNav>
          ) : undefined
        }
      >
        {session.role !== "MERCHANT" ||
        location.pathname.startsWith("/merchant/") ? (
          pages
        ) : (
          <Navigate to={homePath("MERCHANT")} replace />
        )}
      </AppShell>
      <Dialog isOpen={guide} onOpenChange={setGuide} width={680} padding={0}>
        <DialogHeader title="原型说明" onOpenChange={setGuide} />
        <div className="guide-content">
          <p className="secondary">
            当前为 v0.6
            可交互原型，使用浏览器本地数据和模拟接口，不连接生产系统。可切换角色和登录用户；双人确认必须使用两个不同账号。
          </p>
          <div className="scenario-list">
            {SCENARIOS.map((s) => (
              <Button
                key={s.key}
                label={`${s.key} · ${s.name}`}
                variant="secondary"
                onClick={() => {
                  setSession(
                    sessionFor(USERS.find((u) => u.roles.includes(s.role))!),
                  );
                  setGuide(false);
                  navigate(s.path);
                }}
              />
            ))}
          </div>
        </div>
        <div className="dialog-actions">
          <Button
            label="重置数据"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              setGuide(false);
              setReset(true);
            }}
          />
        </div>
      </Dialog>
      <Confirm
        open={reset}
        title="重置数据"
        description="清除本版本操作记录，恢复全部初始业务场景。"
        merchant="不影响生产数据"
        sales="不影响生产数据"
        reversible="本版本修改不可恢复"
        confirmLabel="确认重置"
        danger
        onClose={() => setReset(false)}
        onConfirm={() => {
          api.reset();
          setSession(DEFAULT_SESSION);
          setReset(false);
          navigate(homePath(DEFAULT_SESSION.role));
          window.location.reload();
        }}
      />
    </>
  );
}

const createRouter =
  import.meta.env.VITE_GITHUB_PAGES === "true"
    ? createHashRouter
    : createBrowserRouter;
const router = createRouter([{ path: "*", element: <Shell /> }]);

export default function App() {
  return (
    <Theme theme={workbenchTheme} mode="light">
      <InternationalizationProvider locale="zh-CN" messages={{ "zh-CN": zhCN }}>
        <LayerProvider toast={{ position: "bottomEnd", maxVisible: 3 }}>
          <Providers>
            <RouterProvider router={router} />
          </Providers>
        </LayerProvider>
      </InternationalizationProvider>
    </Theme>
  );
}
