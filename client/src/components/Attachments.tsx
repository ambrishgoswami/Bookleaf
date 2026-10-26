import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileImage, FileText, Loader2, Paperclip, Upload } from "lucide-react";
import { apiDownload, apiUpload } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { Attachment } from "../lib/types";
import { useToast } from "./feedback";
import { cx } from "./ui";

export const MAX_ATTACHMENT_MB = 5;
export const MAX_ATTACHMENTS = 5;
export const ACCEPTED_FILES = ".pdf,.png,.jpg,.jpeg,.webp,.docx";

export const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Client-side check before upload (the server re-validates, including file contents). */
export function attachmentProblem(file: File) {
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) return `"${file.name}" is larger than ${MAX_ATTACHMENT_MB} MB.`;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_FILES.split(",").includes(`.${ext}`)) return `"${file.name}" isn't a supported type (PDF, image or Word document).`;
  return null;
}

interface Props {
  ticketId: string;
  attachments: Attachment[];
  /** Hide the upload button (e.g. closed tickets for authors). */
  canUpload: boolean;
}

export function Attachments({ ticketId, attachments, canUpload }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (file: File) => apiUpload(`/tickets/${ticketId}/attachments`, file),
    onSuccess: () => {
      toast("File attached");
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
    onError: (err) => toast(err.message, "error"),
  });

  function pick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    const problem = attachmentProblem(file);
    if (problem) return toast(problem, "error");
    upload.mutate(file);
  }

  async function download(a: Attachment) {
    setDownloading(a.id);
    try {
      await apiDownload(`/tickets/${ticketId}/attachments/${a.id}`, a.filename);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      setDownloading(null);
    }
  }

  if (!attachments.length && !canUpload) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Paperclip className="size-4" aria-hidden /> Attachments {attachments.length > 0 && <span className="text-slate-400">({attachments.length})</span>}
        </h3>
        {canUpload && attachments.length < MAX_ATTACHMENTS && (
          <>
            <button
              onClick={() => input.current?.click()}
              disabled={upload.isPending}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {upload.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              {upload.isPending ? "Uploading…" : "Add file"}
            </button>
            <input ref={input} type="file" accept={ACCEPTED_FILES} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Attach a file" />
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-slate-400">No files yet. Photos or PDFs (up to {MAX_ATTACHMENT_MB} MB) help us resolve issues faster.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((a) => {
            const Icon = a.mimeType.startsWith("image/") ? FileImage : FileText;
            return (
              <li key={a.id}>
                <button
                  onClick={() => download(a)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-brand-500",
                    downloading === a.id && "opacity-60",
                  )}
                  title={`Download ${a.filename}`}
                >
                  <Icon className="size-5 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{a.filename}</span>
                    <span className="block text-xs text-slate-500">
                      {formatSize(a.sizeBytes)} · {a.uploadedBy.role === "ADMIN" ? "BookLeaf" : a.uploadedBy.name.split(" ")[0]} · {timeAgo(a.createdAt)}
                    </span>
                  </span>
                  {downloading === a.id ? <Loader2 className="size-4 animate-spin text-slate-400" /> : <Download className="size-4 text-slate-400" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
