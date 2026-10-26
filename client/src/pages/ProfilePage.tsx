import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, UserCircle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date } from "../lib/format";
import type { User } from "../lib/types";
import { useToast } from "../components/feedback";
import { Button, Card, Field, Input, PageHeader } from "../components/ui";

export function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile" subtitle="Your account details and password." />
      <div className="grid gap-6">
        <DetailsCard />
        <PasswordCard />
      </div>
    </div>
  );
}

function DetailsCard() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.author?.phone ?? "");
  const [city, setCity] = useState(user?.author?.city ?? "");
  const isAuthor = user?.role === "AUTHOR";

  const save = useMutation({
    mutationFn: () => api<{ user: User }>("/auth/me", { method: "PATCH", body: isAuthor ? { name, phone, city } : { name } }),
    onSuccess: ({ user }) => {
      updateUser(user);
      toast("Profile updated");
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {};

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
        <UserCircle className="size-5 text-slate-400" aria-hidden /> Account details
      </h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={errors.name}>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="email" hint="Contact BookLeaf support to change your email.">
            <Input id="email" value={user?.email ?? ""} disabled />
          </Field>
          {isAuthor && (
            <>
              <Field label="Phone" htmlFor="phone" error={errors.phone}>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91-98765-43210" />
              </Field>
              <Field label="City" htmlFor="city" error={errors.city}>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              </Field>
            </>
          )}
        </div>
        {isAuthor && user?.author && (
          <p className="text-sm text-slate-500">
            Author ID <strong className="text-slate-700">{user.author.code}</strong> · with BookLeaf since {date(user.author.joinedDate)}
          </p>
        )}
        {save.error && !Object.keys(errors).length && <p className="text-sm text-red-600">{save.error.message}</p>}
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending} disabled={name.trim().length < 2}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");

  const change = useMutation({
    mutationFn: () => api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setCurrent("");
      setNew("");
      setConfirm("");
      toast("Password changed");
    },
  });
  const errors = change.error instanceof ApiError ? change.error.fieldErrors() : {};
  const mismatch = confirm.length > 0 && confirm !== newPassword;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!mismatch) change.mutate();
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
        <KeyRound className="size-5 text-slate-400" aria-hidden /> Change password
      </h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Current password" htmlFor="current" error={errors.currentPassword}>
          <Input id="current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="new" error={errors.newPassword} hint="At least 8 characters, with a letter and a number.">
            <Input id="new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm" error={mismatch ? "Passwords don't match" : undefined}>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        {change.error && !Object.keys(errors).length && <p className="text-sm text-red-600">{change.error.message}</p>}
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending} disabled={!currentPassword || !newPassword || mismatch || !confirm}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
