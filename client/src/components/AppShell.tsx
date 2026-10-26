import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { BookOpen, ChevronDown, Inbox, LayoutDashboard, LogOut, Menu, PlusCircle, Ticket, UserCircle, Users, X, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useTicketEvents, type ConnectionState } from "../lib/realtime";
import { cx } from "./ui";

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
  live: { dot: "bg-emerald-500", label: "Live" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting" },
  offline: { dot: "bg-slate-400", label: "Reconnecting" },
};

const initials = (name = "") =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const connection = useTicketEvents(Boolean(user));
  const nav = user?.role === "ADMIN" ? ADMIN_NAV : AUTHOR_NAV;
  const live = LIVE[connection];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menus on navigation.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  // Close the user menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
      isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Menu className="size-5" />
          </button>

          <Link to={user?.role === "ADMIN" ? "/admin" : "/books"} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-semibold text-slate-900">BookLeaf</span>
            <span className="hidden rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 lg:inline">
              {user?.role === "ADMIN" ? "Support Ops" : "Author Portal"}
            </span>
          </Link>

          <nav className="ml-4 hidden gap-1 md:flex" aria-label="Main">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={linkClass}>
                <Icon className="size-4" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500" title="Real-time updates">
              <span className={cx("size-2 rounded-full", live.dot)} aria-hidden />
              <span className="hidden sm:inline">{live.label}</span>
            </span>

            <div className="relative hidden md:block" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">{initials(user?.name)}</span>
                <span className="max-w-32 truncate text-sm text-slate-700">{user?.name}</span>
                <ChevronDown className="size-4 text-slate-400" aria-hidden />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" role="menu">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <div className="my-1 border-t border-slate-100" />
                  <Link to="/profile" role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
                    <UserCircle className="size-4" aria-hidden /> Profile &amp; password
                  </Link>
                  <button onClick={logout} role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                    <LogOut className="size-4" aria-hidden /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
              <span className="flex items-center gap-2 font-semibold text-slate-900">
                <img src="/favicon.svg" alt="" className="size-7" /> BookLeaf
              </span>
              <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{initials(user?.name)}</span>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.role === "ADMIN" ? "BookLeaf Support Ops" : user?.author?.code}</p>
              </div>
            </div>
            <nav className="flex-1 space-y-1 p-3" aria-label="Main">
              {nav.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={linkClass}>
                  <Icon className="size-5" aria-hidden /> {label}
                </NavLink>
              ))}
              <NavLink to="/profile" className={linkClass}>
                <UserCircle className="size-5" aria-hidden /> Profile &amp; password
              </NavLink>
            </nav>
            <div className="border-t border-slate-100 p-3">
              <p className="mb-2 flex items-center gap-2 px-3 text-xs text-slate-500">
                <span className={cx("size-2 rounded-full", live.dot)} aria-hidden /> Real-time updates: {live.label.toLowerCase()}
              </p>
              <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                <LogOut className="size-5" aria-hidden /> Log out
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
