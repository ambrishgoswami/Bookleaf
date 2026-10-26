/**
 * Application chrome. Each role gets its own layout:
 *  - AdminShell: light console with a collapsible sidebar (desktop) / drawer (phones).
 *  - AuthorShell: dark, glassy top bar with icon-over-label navigation.
 * `AppShell` picks one from the signed-in user's role, so shared routes
 * (e.g. /profile) render inside the right chrome automatically.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  BookOpen,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  PlusCircle,
  Ticket,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTicketEvents, type ConnectionState } from "../lib/realtime";
import { Button, cx } from "./ui";
import { ThemeScope } from "./feedback";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (otherwise child routes also highlight it). */
  end?: boolean;
}

const AUTHOR_NAV: NavItem[] = [
  { to: "/books", label: "My Books", icon: BookOpen },
  { to: "/tickets", label: "My Tickets", icon: Ticket },
  { to: "/new-ticket", label: "New Query", icon: PlusCircle },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/tickets", label: "Ticket Queue", icon: Inbox },
  { to: "/admin/authors", label: "Authors", icon: Users },
];

const LIVE: Record<ConnectionState, { dot: string; label: string }> = {
  live: { dot: "bg-brand", label: "Live" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting" },
  offline: { dot: "bg-muted-foreground", label: "Reconnecting" },
};

export const initials = (name = "") =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-semibold tracking-tight">BookLeaf</span>
        {subtitle && <span className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
}

function LiveIndicator({ state, showLabel = true }: { state: ConnectionState; showLabel?: boolean }) {
  const live = LIVE[state];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Real-time updates">
      <span className={cx("size-2 rounded-full", live.dot)} aria-hidden />
      {showLabel && <span className="hidden sm:inline">{live.label}</span>}
    </span>
  );
}

/** Closes on outside click / Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Slide-in panel used for navigation on phones. */
function Drawer({ open, onClose, side = "left", children }: { open: boolean; onClose: () => void; side?: "left" | "right"; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className={cx(
          "absolute inset-y-0 flex w-72 max-w-[85vw] flex-col border-border bg-background text-foreground shadow-2xl",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
        )}
      >
        {children}
      </aside>
    </div>
  );
}

export function AppShell() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? <AdminShell /> : <AuthorShell />;
}

// ---------------------------------------------------------------------------
// Admin: light console with sidebar
// ---------------------------------------------------------------------------

const SIDEBAR_KEY = "bookleaf.sidebar";

function AdminShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const connection = useTicketEvents(Boolean(user));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "collapsed");

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open"), [collapsed]);

  const current = ADMIN_NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ?? "Profile";

  const sidebar = (onNavigate?: () => void) => (
    <>
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link to="/admin" onClick={onNavigate}>
          <Logo subtitle="Support Ops" />
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
        <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">Workspace</p>
        {ADMIN_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors [&_svg]:size-4",
                isActive ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )
            }
          >
            <Icon aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <Link to="/profile" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md p-2 hover:bg-sidebar-accent">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(user?.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user?.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
          </span>
        </Link>
        <Button variant="ghost" className="mt-1 w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={logout}>
          <LogOut className="size-4" aria-hidden /> Log out
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cx(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-0 overflow-hidden border-r-0" : "w-64",
        )}
      >
        {sidebar()}
      </aside>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <button onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close menu">
          <X className="size-5" />
        </button>
        {sidebar(() => setMobileOpen(false))}
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
          <button
            onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setCollapsed((c) => !c) : setMobileOpen(true))}
            className="-ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="size-4 max-lg:hidden" />
            <Menu className="size-5 lg:hidden" />
          </button>
          <span className="h-4 w-px bg-border" aria-hidden />
          <span className="text-sm font-medium">{current}</span>
          <div className="ml-auto">
            <LiveIndicator state={connection} />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Author: dark, glassy top navigation
// ---------------------------------------------------------------------------

function AuthorShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const connection = useTicketEvents(Boolean(user));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useDismiss(profileOpen, () => setProfileOpen(false));

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-white/5 bg-gradient-to-t from-white/[0.08] to-white/[0.04] backdrop-blur-2xl">
        <div className="relative mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-[30px]">
          <button onClick={() => setMobileOpen(true)} className="-ml-1 rounded-md p-2 text-muted-foreground hover:text-foreground sm:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>

          <nav className="hidden items-center gap-6 sm:flex" aria-label="Main">
            {AUTHOR_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx(
                    "flex flex-col items-center gap-0.5 font-display text-xs font-semibold transition-colors",
                    isActive ? "text-brand" : "text-[#d2d2d2] hover:text-brand",
                  )
                }
              >
                <Icon className="size-[1.3rem]" aria-hidden />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <Link to="/books" className="absolute left-1/2 -translate-x-1/2" aria-label="BookLeaf home">
            <Logo />
          </Link>

          <div className="flex items-center gap-3">
            <LiveIndicator state={connection} />
            <Link to="/new-ticket" className="hidden md:block">
              <Button variant="brand" className="h-8 rounded-[7px]">
                <PlusCircle className="size-4" aria-hidden /> Raise a query
              </Button>
            </Link>
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((o) => !o)}
                className="flex size-9 items-center justify-center rounded-full bg-brand-soft font-display text-sm font-semibold text-[#1f4b00] ring-2 ring-transparent transition hover:ring-brand"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label="Account"
              >
                {initials(user?.name)}
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-[14px] border border-white/10 bg-[#1e1e1e]/95 p-2 shadow-2xl backdrop-blur-md" role="menu">
                  <div className="flex items-center gap-3 px-2 py-2">
                    <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft font-display font-semibold text-[#1f4b00]">{initials(user?.name)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-display font-semibold">{user?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user?.author?.code} · {user?.email}
                      </p>
                    </div>
                  </div>
                  <div className="my-1 border-t border-white/10" />
                  <Link to="/profile" role="menuitem" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-white/5">
                    <UserCircle className="size-4" aria-hidden /> Profile &amp; password
                  </Link>
                  <button onClick={logout} role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10">
                    <LogOut className="size-4" aria-hidden /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <div className="dark flex h-full flex-col bg-[#1e1e1e] text-foreground">
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <Logo />
            <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 p-3" aria-label="Main">
            {[...AUTHOR_NAV, { to: "/profile", label: "Profile & password", icon: UserCircle }].map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-3 rounded-[7px] px-3 py-2.5 font-display text-[15px] font-semibold",
                    isActive ? "bg-brand/10 text-brand" : "text-[#d2d2d2] hover:bg-white/5",
                  )
                }
              >
                <Icon className="size-5" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10">
              <LogOut className="size-5" aria-hidden /> Log out
            </button>
          </div>
        </div>
      </Drawer>

      <main className="mx-auto max-w-7xl px-4 pt-[calc(56px+1.5rem)] pb-10 sm:px-[30px]">
        <ThemeScope.Provider value="dark">
          <Outlet />
        </ThemeScope.Provider>
      </main>
    </div>
  );
}
