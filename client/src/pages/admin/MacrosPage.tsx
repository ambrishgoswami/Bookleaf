import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import type { Macro, TicketCategory } from "../../lib/types";
import { ConfirmDialog, Modal, useToast } from "../../components/feedback";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea } from "../../components/ui";
import { CATEGORIES, CATEGORY_LABELS } from "./shared";

export const PLACEHOLDERS = ["{{authorFirstName}}", "{{ticketRef}}", "{{bookTitle}}"];

export function useMacros() {
  return useQuery({ queryKey: ["macros"], queryFn: () => api<{ data: Macro[] }>("/macros"), staleTime: 60_000 });
}

export function MacrosPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const macros = useMacros();
  const [editing, setEditing] = useState<{ open: boolean; macro?: Macro }>({ open: false });
  const [deleting, setDeleting] = useState<Macro | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/macros/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Saved reply deleted");
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["macros"] });
    },
    onError: (err) => toast(err.message, "error"),
  });

  return (
    <>
      <PageHeader
        title="Saved replies"
        subtitle="Reusable answers for common questions. Insert them from any ticket — placeholders fill in automatically."
        action={
          <Button onClick={() => setEditing({ open: true })}>
            <Plus className="size-4" aria-hidden /> New saved reply
          </Button>
        }
      />

      {macros.isPending ? (
        <Spinner />
      ) : macros.error ? (
        <ErrorState error={macros.error} onRetry={macros.refetch} />
      ) : macros.data.data.length === 0 ? (
        <EmptyState title="No saved replies yet" body="Create replies for the questions your team answers most often." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {macros.data.data.map((m) => (
            <Card key={m.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{m.title}</span>
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Used {m.usageCount} {m.usageCount === 1 ? "time" : "times"} · updated {timeAgo(m.updatedAt)}
                    {m.createdBy && ` · by ${m.createdBy.name}`}
                  </p>
                </div>
                {m.categoryLabel && <Badge className="bg-muted text-muted-foreground">{m.categoryLabel}</Badge>}
              </div>
              <p className="mt-3 line-clamp-5 flex-1 text-sm whitespace-pre-wrap text-muted-foreground">{m.body}</p>
              <div className="mt-4 flex gap-1 border-t border-border pt-3">
                <Button variant="ghost" onClick={() => setEditing({ open: true, macro: m })}>
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
                <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleting(m)}>
                  <Trash2 className="size-4" aria-hidden /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <MacroFormModal
        open={editing.open}
        macro={editing.macro}
        onClose={() => setEditing({ open: false })}
        onSaved={(m) => {
          toast(editing.macro ? `"${m.title}" updated` : `"${m.title}" created`);
          setEditing({ open: false });
          queryClient.invalidateQueries({ queryKey: ["macros"] });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        danger
        title="Delete saved reply?"
        body={
          <>
            <strong>{deleting?.title}</strong> will be removed for the whole team.
          </>
        }
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function MacroFormModal({ open, macro, onClose, onSaved }: { open: boolean; macro?: Macro; onClose: () => void; onSaved: (m: Macro) => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [body, setBody] = useState("");
  useEffect(() => {
    if (open) {
      setTitle(macro?.title ?? "");
      setCategory(macro?.category ?? "");
      setBody(macro?.body ?? "Hi {{authorFirstName}},\n\n\n\nWarm regards,\nBookLeaf Author Support");
    }
  }, [open, macro]);

  const save = useMutation({
    mutationFn: () => {
      const payload = { title, body, category: category || null };
      return macro ? api<{ data: Macro }>(`/macros/${macro.id}`, { method: "PATCH", body: payload }) : api<{ data: Macro }>("/macros", { method: "POST", body: payload });
    },
    onSuccess: ({ data }) => {
      save.reset();
      onSaved(data);
    },
  });
  const errors = save.error instanceof ApiError ? save.error.fieldErrors() : {};

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={macro ? "Edit saved reply" : "New saved reply"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="macro-form" loading={save.isPending} disabled={title.trim().length < 3 || body.trim().length < 10}>
            {macro ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <form id="macro-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Title" htmlFor="m-title" error={errors.title}>
            <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Royalty schedule explained" autoFocus />
          </Field>
          <Field label="Category (optional)" htmlFor="m-cat" error={errors.category}>
            <Select id="m-cat" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory | "")}>
              <option value="">Any</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Reply" htmlFor="m-body" error={errors.body} hint={<>Placeholders: {PLACEHOLDERS.join(", ")}</>}>
          <Textarea id="m-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {save.error && !Object.keys(errors).length && <p className="text-sm text-destructive">{save.error.message}</p>}
      </form>
    </Modal>
  );
}
