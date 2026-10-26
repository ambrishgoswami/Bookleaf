import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { BookOpen, Headset, ShieldCheck, Sparkles } from "lucide-react";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input, PasswordInput } from "../components/ui";

/** One-click demo logins — this portal is a reviewed demo seeded with sample data. */
const DEMO_ACCOUNTS = [
  { label: "Author", name: "Priya Sharma", email: "priya.sharma@email.com", password: "Author@123" },
  { label: "Author · book in production", name: "Kavita Deshmukh", email: "kavita.deshmukh@email.com", password: "Author@123" },
  { label: "Support admin", name: "Aisha Verma", email: "admin@bookleaf.com", password: "Admin@123" },
];

const HIGHLIGHTS = [
  { icon: BookOpen, text: "Books, sales and royalty payouts in one place" },
  { icon: Headset, text: "Raise a query and see replies live" },
  { icon: Sparkles, text: "AI-assisted support team, human-reviewed answers" },
];

export const homeFor = (role: "AUTHOR" | "ADMIN") => (role === "ADMIN" ? "/admin" : "/books");

/** Shared frame for login and sign-up: dark glass panel with a brand side. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-brand/15 blur-[140px]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-48 -left-24 size-[420px] rounded-full bg-[#1f4b00]/40 blur-[120px]" aria-hidden />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[25px] border border-white/15 bg-white/[0.04] backdrop-blur-md md:grid-cols-2">
        <section className="hidden flex-col justify-between border-r border-white/10 p-10 md:flex">
          <Link to="/login" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-10 rounded-xl" />
            <span className="font-display text-2xl font-semibold">BookLeaf</span>
          </Link>
          <div>
            <h1 className="font-display text-4xl leading-tight font-semibold">
              Author support,
              <br />
              <span className="text-brand">without the wait.</span>
            </h1>
            <ul className="mt-6 space-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[15px] text-[#d2d2d2]">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden /> Your data is private to your account.
          </p>
        </section>

        <section className="p-4 sm:p-8">
          <div className="mb-6 text-center md:hidden">
            <img src="/favicon.svg" alt="" className="mx-auto size-12 rounded-xl" />
            <p className="mt-3 font-display text-2xl font-semibold">BookLeaf Publishing</p>
            <p className="text-sm text-muted-foreground">Author support &amp; communication portal</p>
          </div>
          <div className="rounded-[14px] bg-background px-6 pt-5 pb-6">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="mb-5 text-sm text-muted-foreground">{subtitle}</p>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

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
    <AuthLayout title="Log in" subtitle="Use your BookLeaf account email.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="brand" className="h-10 w-full rounded-[7px]" loading={submitting} disabled={!email || !password}>
          Log in
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        New to BookLeaf?{" "}
        <Link to="/signup" className="font-medium text-brand hover:underline">
          Create an author account
        </Link>
      </p>

      <div className="mt-6 border-t border-white/10 pt-5">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Try a demo account</p>
        <div className="space-y-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => {
                setEmail(a.email);
                setPassword(a.password);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-[7px] border border-white/10 px-3 py-2 text-left transition hover:border-brand hover:bg-brand/5"
            >
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] font-semibold">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
              </span>
              <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-[#d2d2d2]">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
