import { Lock, Sparkles } from "lucide-react";
import { dateTime } from "../lib/format";
import type { Message } from "../lib/types";
import { cx } from "./ui";

interface Props {
  /** The original query, rendered as the first message. */
  original: { authorName: string; body: string; createdAt: string; attachmentName?: string | null };
  messages: Message[];
  /** Whose perspective: own messages align right. */
  viewer: "AUTHOR" | "ADMIN";
}

export function MessageThread({ original, messages, viewer }: Props) {
  const all = [
    { id: "original", kind: "REPLY" as const, body: original.body, createdAt: original.createdAt, fromAuthor: true, name: original.authorName, aiAssisted: false },
    ...messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      body: m.body,
      createdAt: m.createdAt,
      fromAuthor: m.sender.role === "AUTHOR",
      name: m.sender.role === "ADMIN" ? (viewer === "AUTHOR" ? `BookLeaf Support · ${m.sender.name.split(" ")[0]}` : m.sender.name) : m.sender.name,
      aiAssisted: Boolean(m.aiAssisted),
    })),
  ];

  return (
    <ol className="space-y-4">
      {all.map((m, i) => {
        const mine = viewer === "AUTHOR" ? m.fromAuthor : !m.fromAuthor;
        const note = m.kind === "INTERNAL_NOTE";
        return (
          <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                note
                  ? "border border-dashed border-amber-300 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/10 text-amber-950 dark:text-amber-100"
                  : mine
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-foreground",
              )}
            >
              <div className={cx("mb-1 flex flex-wrap items-center gap-x-2 text-xs", mine && !note ? "text-primary-foreground/80" : "text-muted-foreground")}>
                <span className="font-medium">{m.name}</span>
                <span>{dateTime(m.createdAt)}</span>
                {i === 0 && <span>· original query</span>}
                {note && (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                    <Lock className="size-3" aria-hidden /> Internal note — not visible to author
                  </span>
                )}
                {m.aiAssisted && viewer === "ADMIN" && (
                  <span className="inline-flex items-center gap-1" title="Started from the AI draft">
                    <Sparkles className="size-3" aria-hidden /> AI-assisted
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
              {i === 0 && original.attachmentName && (
                <p className={cx("mt-2 text-xs", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>📎 {original.attachmentName}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
