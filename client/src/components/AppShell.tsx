import { NavLink, Outlet } from "react-router";
import { BookOpen, Inbox, LayoutDashboard, LogOut, PlusCircle, Ticket, type LucideIcon } from "lucide-react";
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
];

const LIVE_STYLES: Record<ConnectionState, { dot: string; label: string }> = {
  live: { dot: "bg-emerald-500", label: "Live" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting" },
  offline: { dot: "bg-slate-400", label: "Reconnecting" },
};

export function AppShell() {
  const { user, logout } = useAuth();
  const connection = useTicketEvents(Boolean(user));
  const nav = user?.role === "ADMIN" ? ADMIN_NAV : AUTHOR_NAV;
  const live = LIVE_STYLES[connection];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-semibold text-slate-900">BookLeaf</span>
            <span className="hidden rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700 sm:inline">
              {user?.role === "ADMIN" ? "Support Ops" : "Author Portal"}
            </span>
          </div>

          <nav className="ml-2 flex gap-1 overflow-x-auto">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap",
                    isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500" title="Real-time updates">
              <span className={cx("size-2 rounded-full", live.dot)} aria-hidden />
              <span className="hidden md:inline">{live.label}</span>
            </span>
            <span className="hidden text-sm text-slate-700 sm:inline">{user?.name}</span>
            <button onClick={logout} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Log out">
              <LogOut className="size-4" aria-label="Log out" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
