import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, X } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { AuthorTicket, BooksResponse } from "../../lib/types";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "../../components/ui";

const MAX_ATTACHMENT_MB = 10;
const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.docx";
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 5000;

export function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const books = useQuery({ queryKey: ["books"], queryFn: () => api<BooksResponse>("/books") });

  const [bookId, setBookId] = useState(params.get("book") ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string>();

  const create = useMutation({
    mutationFn: () =>
      api<{ data: AuthorTicket }>("/tickets", {
        method: "POST",
        body: { bookId: bookId || null, subject, description, attachmentName: attachment?.name ?? null },
      }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      navigate(`/tickets/${data.id}`, { state: { created: data.reference } });
    },
  });

  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors() : {};
  const selectedBook = books.data?.data.find((b) => b.id === bookId);

  function pickFile(file: File | undefined) {
    setAttachmentError(undefined);
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setAttachmentError(`Files must be under ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }
    setAttachment(file);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Raise a support query" subtitle="Our team typically replies within one business day — urgent issues much sooner." />

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Field
            label="Which book is this about?"
            htmlFor="book"
            error={fieldErrors.bookId}
            hint={
              selectedBook && !selectedBook.isPublished
                ? `"${selectedBook.title}" is currently in ${selectedBook.production?.stage ?? "production"}.`
                : undefined
            }
          >
            <Select id="book" value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={books.isPending}>
              <option value="">General / Account Level</option>
              {books.data?.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} {b.isPublished ? "" : `(in production)`}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" htmlFor="subject" error={fieldErrors.subject}>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Royalty for Q2 not received"
              maxLength={150}
              required
            />
          </Field>

          <Field
            label="Describe your query"
            htmlFor="description"
            error={fieldErrors.description}
            hint={
              <span className="flex justify-between">
                <span>Include dates, platforms or amounts if relevant — it helps us resolve this faster.</span>
                <span className={description.trim().length < DESCRIPTION_MIN ? "text-slate-400" : "text-slate-500"}>
                  {description.length}/{DESCRIPTION_MAX}
                </span>
              </span>
            }
          >
            <Textarea
              id="description"
              rows={7}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              required
            />
          </Field>

          <Field label="Attachment (optional)" htmlFor="attachment" error={attachmentError} hint={`PDF, image or Word document, up to ${MAX_ATTACHMENT_MB} MB.`}>
            {attachment ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <Paperclip className="size-4 text-slate-400" aria-hidden />
                  {attachment.name} <span className="text-slate-400">({(attachment.size / 1024).toFixed(0)} KB)</span>
                </span>
                <button type="button" onClick={() => setAttachment(null)} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Remove attachment">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="attachment"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:border-brand-500 hover:text-brand-700"
              >
                <Paperclip className="size-4" aria-hidden /> Choose a file
                <input id="attachment" type="file" accept={ACCEPTED} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
              </label>
            )}
          </Field>

          {create.error && !Object.keys(fieldErrors).length && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {create.error.message}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!subject.trim() || !description.trim()}>
              Submit query
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
