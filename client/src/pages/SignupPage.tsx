import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Check, X } from "lucide-react";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { BackButton, Button, Field, Input, PasswordInput, cx } from "../components/ui";
import { AuthLayout, homeFor } from "./LoginPage";

/** Same rules as the API, shown live so authors aren't surprised on submit. */
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Contains a letter", test: (p: string) => /[A-Za-z]/.test(p) },
  { label: "Contains a number", test: (p: string) => /\d/.test(p) },
];

export function SignupPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const passwordOk = PASSWORD_RULES.every((r) => r.test(form.password));
  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;
  const canSubmit = form.name.trim().length >= 2 && form.email.trim() && passwordOk && form.confirm === form.password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, phone: form.phone || undefined, city: form.city || undefined });
      navigate("/books", { replace: true, state: { welcome: true } });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setErrors(err.fieldErrors());
      else setFormError(err instanceof Error ? err.message : "Couldn't create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create your author account" subtitle="Track your books and royalties, and reach our support team.">
      <BackButton fallback="/login" label="Back to log in" className="-mt-2" />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone (optional)" htmlFor="phone" error={errors.phone}>
            <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="+91-98765-43210" />
          </Field>
          <Field label="City (optional)" htmlFor="city" error={errors.city}>
            <Input id="city" autoComplete="address-level2" value={form.city} onChange={set("city")} />
          </Field>
        </div>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        {form.password && (
          <ul className="-mt-2 grid gap-1 text-xs sm:grid-cols-3" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(form.password);
              return (
                <li key={r.label} className={cx("flex items-center gap-1", ok ? "text-brand" : "text-muted-foreground")}>
                  {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />} {r.label}
                </li>
              );
            })}
          </ul>
        )}
        <Field label="Confirm password" htmlFor="confirm" error={mismatch ? "Passwords don't match" : undefined}>
          <PasswordInput id="confirm" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        </Field>

        {formError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}
        <Button type="submit" variant="brand" className="h-10 w-full rounded-[7px]" loading={submitting} disabled={!canSubmit}>
          Create account
        </Button>
        <p className="text-xs text-muted-foreground">
          Your books appear here once BookLeaf receives your manuscript. You can raise a support query straight away.
        </p>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-brand hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
