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
import { AdminPlaceholder } from "./pages/admin/AdminPlaceholder";

/** Client-side route guard. The API enforces the same rules — this is UX, not security. */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
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
      </Route>

      <Route element={<RequireRole role="ADMIN"><AppShell /></RequireRole>}>
        <Route path="/admin/*" element={<AdminPlaceholder />} />
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
