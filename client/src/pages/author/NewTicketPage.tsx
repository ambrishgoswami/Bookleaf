import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, X } from "lucide-react";
import { api, ApiError, apiUpload } from "../../lib/api";
import type { AuthorTicket, BooksResponse } from "../../lib/types";
import { ACCEPTED_FILES, MAX_ATTACHMENTS, MAX_ATTACHMENT_MB, attachmentProblem, formatSize } from "../../components/Attachments";
import { useToast } from "../../components/feedback";
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from "../../components/ui";

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 5000;

export function NewTicketPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const books = useQuery({ queryKey: ["books"], queryFn: () => api<BooksResponse>("/books") });

  const [bookId, setBookId] = useState(params.get("book") ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string>();

  // Create the ticket first, then upload files to it. If an upload fails, the
  // ticket still exists — the author is told and can re-attach from the ticket.
  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api<{ data: AuthorTicket }>("/tickets", {
        method: "POST",
        body: { bookId: bookId || null, subject, description },
      });
      const failed: string[] = [];
      for (const file of files) {
        try {
          await apiUpload(`/tickets/${data.id}/attachments`, file);
        } catch {
          failed.push(file.name);
        }
      }
      return { ticket: data, failed };
    },
    onSuccess: ({ ticket, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      if (failed.length) toast(`Ticket created, but ${failed.join(", ")} couldn't be uploaded. You can attach it from the ticket.`, "error");
      navigate(`/tickets/${ticket.id}`, { state: { created: ticket.reference } });
    },
  });

  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors() : {};
  const selectedBook = books.data?.data.find((b) => b.id === bookId);

  function pickFiles(list: FileList | null) {
    setAttachmentError(undefined);
    if (!list?.length) return;
    const picked = Array.from(list);
    const problem = picked.map(attachmentProblem).find(Boolean);
    if (problem) return setAttachmentError(problem);
    if (files.length + picked.length > MAX_ATTACHMENTS) return setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    setFiles((f) => [...f, ...picked]);
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
                <span className={description.trim().length < DESCRIPTION_MIN ? "text-muted-foreground/70" : "text-muted-foreground"}>
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

          <Field
            label="Attachments (optional)"
            htmlFor="attachment"
            error={attachmentError}
            hint={`Screenshots, photos of print defects or PDFs — up to ${MAX_ATTACHMENTS} files, ${MAX_ATTACHMENT_MB} MB each.`}
          >
            {files.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                      <span className="truncate">{file.name}</span> <span className="shrink-0 text-muted-foreground/70">({formatSize(file.size)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {files.length < MAX_ATTACHMENTS && (
              <label
                htmlFor="attachment"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Paperclip className="size-4" aria-hidden /> {files.length ? "Add another file" : "Choose files"}
                <input
                  id="attachment"
                  type="file"
                  multiple
                  accept={ACCEPTED_FILES}
                  className="sr-only"
                  onChange={(e) => {
                    pickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </Field>

          {create.error && !Object.keys(fieldErrors).length && (
            <p className="rounded-lg bg-red-50 dark:bg-red-400/10 px-3 py-2 text-sm text-red-700 dark:text-red-300" role="alert">
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
