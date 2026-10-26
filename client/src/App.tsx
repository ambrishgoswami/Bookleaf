import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { LoginPage, homeFor } from "./pages/LoginPage";
import { BooksPage } from "./pages/author/BooksPage";
import { NewTicketPage } from "./pages/author/NewTicketPage";
import { TicketsPage } from "./pages/author/TicketsPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { QueuePage } from "./pages/admin/QueuePage";
import { TicketWorkspace } from "./pages/admin/TicketWorkspace";
import { AuthorsPage } from "./pages/admin/AuthorsPage";
import { AuthorDetailPage } from "./pages/admin/AuthorDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { MacrosPage } from "./pages/admin/MacrosPage";
import { HelpPage } from "./pages/author/HelpPage";

/** Client-side route guard. The API enforces the same rules — this is UX, not security. */
function RequireRole({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireRole role="AUTHOR"><AppShell /></RequireRole>}>
        <Route path="/books" element={<BooksPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketsPage />} />
        <Route path="/new-ticket" element={<NewTicketPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Route>

      <Route element={<RequireRole role="ADMIN"><AppShell /></RequireRole>}>
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/tickets" element={<QueuePage />} />
        <Route path="/admin/tickets/:id" element={<TicketWorkspace />} />
        <Route path="/admin/authors" element={<AuthorsPage />} />
        <Route path="/admin/authors/:id" element={<AuthorDetailPage />} />
        <Route path="/admin/macros" element={<MacrosPage />} />
      </Route>

      <Route element={<RequireRole><AppShell /></RequireRole>}>
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
