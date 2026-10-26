/** Modal forms for admin author & book management. */
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { inr } from "../../lib/format";
import type { AuthorDetail, Book } from "../../lib/types";
import { Modal, useToast } from "../../components/feedback";
import { Button, Field, Input, Select } from "../../components/ui";

const PLATFORMS = ["Amazon India", "Flipkart", "Amazon US", "Amazon UK", "BookLeaf Store"];
const today = () => new Date().toISOString().slice(0, 10);

/** "" → null for optional numbers; anything else → integer. */
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

function useFieldErrors(error: Error | null) {
  return error instanceof ApiError ? error.fieldErrors() : {};
}

function FormError({ error, fieldErrors }: { error: Error | null; fieldErrors: Record<string, string> }) {
  if (!error || Object.keys(fieldErrors).length) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {error.message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Author create / edit
// ---------------------------------------------------------------------------

interface AuthorFormProps {
  open: boolean;
  onClose: () => void;
  /** Present → edit mode. */
  author?: AuthorDetail;
  onSaved: (result: { author: AuthorDetail; temporaryPassword?: string | null }) => void;
}

export function AuthorFormModal({ open, onClose, author, onSaved }: AuthorFormProps) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", city: "" });
  useEffect(() => {
    if (open) setForm({ name: author?.name ?? "", email: author?.email ?? "", phone: author?.phone ?? "", city: author?.city ?? "" });
  }, [open, author]);

  const save = useMutation({
    mutationFn: async () => {
      if (author) {
        const res = await api<{ data: AuthorDetail }>(`/authors/${author.id}`, { method: "PATCH", body: form });
        return { author: res.data };
      }
      const res = await api<{ data: AuthorDetail; temporaryPassword: string | null }>("/authors", { method: "POST", body: form });
      return { author: res.data, temporaryPassword: res.temporaryPassword };
    },
    onSuccess: (result) => {
      save.reset();
      onSaved(result);
    },
  });
  const errors = useFieldErrors(save.error);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={author ? `Edit ${author.name}` : "Add author"}
      description={author ? author.code : "A login is created with a one-time password you can share with the author."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="author-form" loading={save.isPending} disabled={!form.name.trim() || !form.email.trim()}>
            {author ? "Save changes" : "Create author"}
          </Button>
        </>
      }
    >
      <form id="author-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="a-name" error={errors.name}>
          <Input id="a-name" value={form.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Email" htmlFor="a-email" error={errors.email}>
          <Input id="a-email" type="email" value={form.email} onChange={set("email")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="a-phone" error={errors.phone}>
            <Input id="a-phone" type="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="City" htmlFor="a-city" error={errors.city}>
            <Input id="a-city" value={form.city} onChange={set("city")} />
          </Field>
        </div>
        <FormError error={save.error} fieldErrors={errors} />
      </form>
    </Modal>
  );
}

/** Shows a one-time password once, with a copy button. */
export function PasswordRevealModal({ password, email, onClose }: { password: string | null; email?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      open={Boolean(password)}
      onClose={onClose}
      title="One-time password"
      description="Share this with the author securely. It won't be shown again — they can change it from their profile."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {email && <p className="mb-2 text-sm text-slate-600">Login email: <strong>{email}</strong></p>}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <code className="flex-1 font-mono text-lg tracking-wide text-slate-900">{password}</code>
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(password ?? "");
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Book create / edit
// ---------------------------------------------------------------------------

interface BookFormProps {
  open: boolean;
  onClose: () => void;
  authorId: string;
  /** Present → edit mode. */
  book?: Book;
  onSaved: (book: Book) => void;
}

type BookForm = {
  title: string;
  isbn: string;
  genre: string;
  status: string;
  publicationDate: string;
  mrp: string;
  royaltyPerCopy: string;
  copiesSold: string;
  royaltyEarned: string;
  royaltyPaid: string;
  printPartner: string;
  availableOn: string[];
};

const emptyBook = (): BookForm => ({
  title: "",
  isbn: "",
  genre: "",
  status: "In Production - Manuscript Received",
  publicationDate: "",
  mrp: "",
  royaltyPerCopy: "",
  copiesSold: "0",
  royaltyEarned: "0",
  royaltyPaid: "0",
  printPartner: "",
  availableOn: [],
});

const fromBook = (b: Book): BookForm => ({
  title: b.title,
  isbn: b.isbn,
  genre: b.genre,
  status: b.status,
  publicationDate: b.publicationDate ?? "",
  mrp: b.mrp?.toString() ?? "",
  royaltyPerCopy: b.royaltyPerCopy?.toString() ?? "",
  copiesSold: String(b.copiesSold),
  royaltyEarned: String(b.royaltyEarned),
  royaltyPaid: String(b.royaltyPaid),
  printPartner: b.printPartner ?? "",
  availableOn: b.availableOn,
});

export function BookFormModal({ open, onClose, authorId, book, onSaved }: BookFormProps) {
  const [form, setForm] = useState<BookForm>(emptyBook);
  useEffect(() => {
    if (open) setForm(book ? fromBook(book) : emptyBook());
  }, [open, book]);

  const statuses = useQuery({ queryKey: ["book-statuses"], queryFn: () => api<{ data: string[] }>("/books/statuses"), staleTime: Infinity });
  const published = form.status === "Published & Live";
  const pending = (Number(form.royaltyEarned) || 0) - (Number(form.royaltyPaid) || 0);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        isbn: form.isbn,
        genre: form.genre,
        status: form.status,
        publicationDate: form.publicationDate || null,
        mrp: numOrNull(form.mrp),
        royaltyPerCopy: numOrNull(form.royaltyPerCopy),
        copiesSold: numOrNull(form.copiesSold) ?? 0,
        royaltyEarned: numOrNull(form.royaltyEarned) ?? 0,
        royaltyPaid: numOrNull(form.royaltyPaid) ?? 0,
        printPartner: form.printPartner || null,
        availableOn: form.availableOn,
      };
      return book
        ? api<{ data: Book }>(`/books/${book.id}`, { method: "PATCH", body })
        : api<{ data: Book }>("/books", { method: "POST", body: { ...body, authorId } });
    },
    onSuccess: ({ data }) => {
      save.reset();
      onSaved(data);
    },
  });
  const errors = useFieldErrors(save.error);
  const set = (k: keyof BookForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const togglePlatform = (p: string) =>
    setForm((f) => ({ ...f, availableOn: f.availableOn.includes(p) ? f.availableOn.filter((x) => x !== p) : [...f.availableOn, p] }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const statusLabel = (s: string) => s.replace(/^In Production - /, "In production: ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={book ? `Edit "${book.title}"` : "Add book"}
      description={book ? book.code : "Pending royalty is calculated automatically (earned − paid)."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="book-form" loading={save.isPending} disabled={!form.title.trim() || !form.isbn.trim() || !form.genre.trim()}>
            {book ? "Save changes" : "Add book"}
          </Button>
        </>
      }
    >
      <form id="book-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" htmlFor="b-title" error={errors.title}>
              <Input id="b-title" value={form.title} onChange={set("title")} autoFocus />
            </Field>
          </div>
          <Field label="ISBN" htmlFor="b-isbn" error={errors.isbn}>
            <Input id="b-isbn" value={form.isbn} onChange={set("isbn")} placeholder="978-93-…" />
          </Field>
          <Field label="Genre" htmlFor="b-genre" error={errors.genre}>
            <Input id="b-genre" value={form.genre} onChange={set("genre")} />
          </Field>
          <Field label="Status" htmlFor="b-status" error={errors.status}>
            <Select id="b-status" value={form.status} onChange={set("status")}>
              {(statuses.data?.data ?? [form.status]).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Publication date${published ? "" : " (optional)"}`} htmlFor="b-date" error={errors.publicationDate}>
            <Input id="b-date" type="date" value={form.publicationDate} onChange={set("publicationDate")} />
          </Field>
          <Field label={`MRP (₹)${published ? "" : " (optional)"}`} htmlFor="b-mrp" error={errors.mrp}>
            <Input id="b-mrp" type="number" min={0} inputMode="numeric" value={form.mrp} onChange={set("mrp")} />
          </Field>
          <Field label={`Royalty per copy (₹)${published ? "" : " (optional)"}`} htmlFor="b-rpc" error={errors.royaltyPerCopy}>
            <Input id="b-rpc" type="number" min={0} inputMode="numeric" value={form.royaltyPerCopy} onChange={set("royaltyPerCopy")} />
          </Field>
        </div>

        {published && (
          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Sales &amp; royalty</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Copies sold" htmlFor="b-sold" error={errors.copiesSold}>
                <Input id="b-sold" type="number" min={0} inputMode="numeric" value={form.copiesSold} onChange={set("copiesSold")} />
              </Field>
              <Field label="Royalty earned (₹)" htmlFor="b-earned" error={errors.royaltyEarned}>
                <Input id="b-earned" type="number" min={0} inputMode="numeric" value={form.royaltyEarned} onChange={set("royaltyEarned")} />
              </Field>
              <Field label="Royalty paid (₹)" htmlFor="b-paid" error={errors.royaltyPaid}>
                <Input id="b-paid" type="number" min={0} inputMode="numeric" value={form.royaltyPaid} onChange={set("royaltyPaid")} />
              </Field>
            </div>
            <p className={pending < 0 ? "mt-2 text-sm text-red-600" : "mt-2 text-sm text-slate-500"}>Pending royalty: {inr(pending)}</p>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Print partner" htmlFor="b-print" error={errors.printPartner}>
            <Select id="b-print" value={form.printPartner} onChange={set("printPartner")}>
              <option value="">Not assigned</option>
              <option>In-House</option>
              <option>Repro India</option>
              <option>Epitome Books</option>
            </Select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Available on</span>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <label
                  key={p}
                  className={
                    form.availableOn.includes(p)
                      ? "cursor-pointer rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-white"
                      : "cursor-pointer rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-slate-300"
                  }
                >
                  <input type="checkbox" className="sr-only" checked={form.availableOn.includes(p)} onChange={() => togglePlatform(p)} />
                  {p}
                </label>
              ))}
            </div>
          </div>
        </div>
        <FormError error={save.error} fieldErrors={errors} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

export function PayoutModal({ book, onClose, onSaved }: { book: Book | null; onClose: () => void; onSaved: (book: Book) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  useEffect(() => {
    if (book) {
      setAmount(String(book.royaltyPending));
      setPaidOn(today());
    }
  }, [book]);

  const save = useMutation({
    mutationFn: () => api<{ data: Book }>(`/books/${book!.id}/payouts`, { method: "POST", body: { amount: Number(amount), date: paidOn } }),
    onSuccess: ({ data }) => {
      save.reset();
      toast(`Payout of ${inr(Number(amount))} recorded`);
      onSaved(data);
    },
  });
  const errors = useFieldErrors(save.error);

  return (
    <Modal
      open={Boolean(book)}
      onClose={onClose}
      title="Record royalty payout"
      description={book ? `${book.title} · ${inr(book.royaltyPending)} pending` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!Number(amount)}>
            Record payout
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₹)" htmlFor="p-amount" error={errors.amount}>
          <Input id="p-amount" type="number" min={1} max={book?.royaltyPending} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid on" htmlFor="p-date" error={errors.date}>
          <Input id="p-date" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <FormError error={save.error} fieldErrors={errors} />
    </Modal>
  );
}
