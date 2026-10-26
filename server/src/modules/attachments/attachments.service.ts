/**
 * Ticket attachments: screenshots, photos of print defects, PDFs.
 *
 * Uploads are checked three ways: size (enforced by multer), declared type,
 * and the file's actual leading bytes ("magic numbers"), so a renamed
 * executable can't be stored as a ".png". Access follows the ticket's own
 * rules: the owning author or any admin.
 */
import { prisma } from "../../lib/prisma.js";
import { publish } from "../../lib/events.js";
import { Conflict, NotFound, ValidationFailed } from "../../lib/errors.js";
import type { AuthUser } from "../auth/auth.tokens.js";
import { findAccessibleTicket } from "../tickets/tickets.service.js";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 5;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

/** Allowed types and how to recognise each from its first bytes. */
const ALLOWED: Record<string, { label: string; matches: (buf: Buffer) => boolean }> = {
  "application/pdf": { label: "PDF", matches: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) }, // %PDF
  "image/png": { label: "PNG", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  "image/jpeg": { label: "JPEG", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  "image/webp": {
    label: "WEBP",
    matches: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8), // RIFF....WEBP
  },
  // .docx is a ZIP container.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "Word",
    matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
};

export const ACCEPTED_TYPES_LABEL = Object.values(ALLOWED)
  .map((t) => t.label)
  .join(", ");

/** Keeps names readable but safe for headers and file systems. */
const safeFilename = (name: string) =>
  name
    .normalize("NFKC")
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120) || "attachment";

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export async function addAttachment(user: AuthUser, ticketId: string, file: UploadedFile | undefined) {
  const ticket = await findAccessibleTicket(user, ticketId);
  if (!file) throw ValidationFailed([{ field: "file", message: "Choose a file to upload" }]);

  const type = ALLOWED[file.mimetype];
  if (!type) throw ValidationFailed([{ field: "file", message: `Unsupported file type. Allowed: ${ACCEPTED_TYPES_LABEL}` }]);
  if (!type.matches(file.buffer)) {
    throw ValidationFailed([{ field: "file", message: `This file doesn't look like a valid ${type.label} file` }]);
  }
  if (user.role === "AUTHOR" && ticket.status === "CLOSED") {
    throw Conflict("This ticket is closed. Please raise a new query to share more files.");
  }
  if (ticket.attachments.length >= MAX_ATTACHMENTS_PER_TICKET) {
    throw Conflict(`A ticket can have at most ${MAX_ATTACHMENTS_PER_TICKET} attachments`);
  }

  const filename = safeFilename(file.originalname);
  const attachment = await prisma.attachment.create({
    data: { ticketId, uploadedById: user.id, filename, mimeType: file.mimetype, sizeBytes: file.size, data: new Uint8Array(file.buffer) },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
  });
  await prisma.ticketActivity.create({ data: { ticketId, actorId: user.id, action: "attachment_added", toValue: filename } });

  publish({ type: "ticket.updated", ticketId, authorId: ticket.authorId, internal: false });
  return { ...attachment, createdAt: attachment.createdAt.toISOString() };
}

export async function getAttachment(user: AuthUser, ticketId: string, attachmentId: string) {
  await findAccessibleTicket(user, ticketId); // same visibility rules as the ticket
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, ticketId } });
  if (!attachment) throw NotFound("Attachment");
  return attachment;
}
