import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input } from "../components/ui";

/** One-click demo logins — this portal is a reviewed demo seeded with sample data. */
const DEMO_ACCOUNTS = [
  { label: "Author — Priya Sharma", email: "priya.sharma@email.com", password: "Author@123" },
  { label: "Author — Kavita (book in production)", email: "kavita.deshmukh@email.com", password: "Author@123" },
  { label: "Admin — Aisha Verma", email: "admin@bookleaf.com", password: "Admin@123" },
];

export const homeFor = (role: "AUTHOR" | "ADMIN") => (role === "ADMIN" ? "/admin" : "/books");

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 to-brand-800 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <img src="/favicon.svg" alt="" className="mx-auto size-12 rounded-xl ring-2 ring-white/30" />
          <h1 className="mt-3 text-2xl font-semibold">BookLeaf Publishing</h1>
          <p className="text-sm text-brand-100">Author support &amp; communication portal</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" loading={submitting} disabled={!email || !password}>
              Log in
            </Button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Demo accounts</p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <span>{a.label}</span>
                  <span className="text-xs text-slate-400">{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
