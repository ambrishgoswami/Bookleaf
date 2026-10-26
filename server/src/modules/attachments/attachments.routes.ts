import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { parse } from "../../lib/validation.js";
import { currentUser } from "../../middleware/auth.js";
import { MAX_ATTACHMENT_BYTES, addAttachment, getAttachment } from "./attachments.service.js";

// In-memory: files are small and go straight to the database.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });

const Params = z.object({ id: z.string().min(1) });
const DownloadParams = Params.extend({ attachmentId: z.string().min(1) });

/** Mounted at /tickets. */
export const attachmentsRouter = Router();

attachmentsRouter.post("/:id/attachments", upload.single("file"), async (req, res) => {
  const { id } = parse(Params, req.params);
  res.status(201).json({ data: await addAttachment(currentUser(req), id, req.file) });
});

attachmentsRouter.get("/:id/attachments/:attachmentId", async (req, res) => {
  const { id, attachmentId } = parse(DownloadParams, req.params);
  const file = await getAttachment(currentUser(req), id, attachmentId);
  res
    .status(200)
    .set({
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      // Always download, never render inline, and never cache private files.
      "Content-Disposition": `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
    })
    .send(Buffer.from(file.data));
});
