/**
 * Demo tickets so the admin queue isn't empty on first login. Seeded only when
 * there are no tickets yet. Covers every status, an overdue critical ticket, an
 * internal note, and leaves some authors without tickets (empty states).
 *
 * Classification goes through the real triage pipeline: the LLM when an API
 * key is configured, the rule-based fallback otherwise.
 */
import type { PrismaClient, TicketStatus } from "@prisma/client";
import { aiEnabled } from "../src/modules/ai/llm.js";
import { classifyTicketWithAi } from "../src/modules/ai/classifier.js";
import { setAiClassifier, triageTicket } from "../src/modules/tickets/triage.js";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

interface DemoTicket {
  author: string;
  book: string | null;
  subject: string;
  description: string;
  ageHours: number;
  status: TicketStatus;
  /** Admin replies (by admin index), oldest first. */
  replies?: { admin: 0 | 1; body: string; ageHours: number }[];
  note?: { admin: 0 | 1; body: string };
  assignee?: 0 | 1;
}

const DEMO: DemoTicket[] = [
  {
    author: "AUTH006", book: "BK010", ageHours: 52, status: "OPEN",
    subject: "Not a single royalty payment since publication",
    description:
      "Turban Tales has been live since September 2024 and has sold 88 copies, but I have never received any royalty. My dashboard shows ₹2,464 pending. I have emailed twice already. Please tell me what is happening with my money.",
  },
  {
    author: "AUTH005", book: "BK008", ageHours: 30, status: "OPEN",
    subject: "ISBN on Amazon doesn't match my printed book",
    description:
      "The ISBN listed on my Amazon India page is different from the one printed on the back cover of my copies. A reader pointed it out. I'm worried sales are going to the wrong record.",
  },
  {
    author: "AUTH004", book: "BK006", ageHours: 70, status: "IN_PROGRESS", assignee: 0,
    subject: "Blurry images in my author copies",
    description:
      "I received 20 author copies last week. The photographs inside are blurry and on several copies pages 40–56 are misaligned. I need good copies for a book reading event next month.",
    replies: [
      {
        admin: 0, ageHours: 48,
        body: "Hi Vikram,\n\nWe're truly sorry — that's not the quality you should receive from us, especially with your reading event coming up.\n\nCould you share a few photos of the affected pages (the blurry images and pages 40–56)? Once our team verifies them, we'll arrange a free reprint of your copies, which takes 5–7 business days from confirmation.\n\nWarm regards,\nBookLeaf Author Support",
      },
    ],
    note: { admin: 0, body: "Batch printed in-house on the old press. Checking with print floor whether other orders from that run are affected." },
  },
  {
    author: "AUTH007", book: "BK011", ageHours: 120, status: "RESOLVED", assignee: 1,
    subject: "Book unavailable on Flipkart",
    description: "Chai & Chapters is showing 'Currently unavailable' on Flipkart since Monday. It's my best-selling book, please check.",
    replies: [
      {
        admin: 1, ageHours: 110,
        body: "Hi Sneha,\n\nThanks for flagging this quickly. When a live book shows as unavailable it's usually a stock sync issue with the retailer, and we've triggered a re-sync with our distribution team. It should be back within 24–48 hours — we'll confirm once it is.\n\nWarm regards,\nBookLeaf Author Support",
      },
      { admin: 1, ageHours: 80, body: "Hi Sneha,\n\nGood news — your book is available on Flipkart again. Sorry for the interruption.\n\nWarm regards,\nBookLeaf Author Support" },
    ],
  },
  {
    author: "AUTH009", book: "BK015", ageHours: 3, status: "OPEN",
    subject: "How long will typesetting take?",
    description: "It's been 3 weeks and Raising Roots is still showing 'Typesetting'. When will it move to proofreading? I'd like to plan a launch.",
  },
  {
    author: "AUTH010", book: "BK018", ageHours: 6, status: "OPEN",
    subject: "When will I get my first royalty?",
    description: "Howrah Nights came out in January and the dashboard shows ₹1,575 pending, but I haven't been paid yet. When is the first payout?",
  },
  {
    author: "AUTH002", book: null, ageHours: 20, status: "OPEN",
    subject: "Upgrading to Bestseller Breakthrough",
    description: "I'm interested in the Bestseller Breakthrough package for my next book. What does it include compared to Standard Free, and can I upgrade an existing book?",
  },
  {
    author: "AUTH001", book: "BK002", ageHours: 400, status: "CLOSED", assignee: 0,
    subject: "Royalty statement breakdown",
    description: "Could you explain how the royalty for The Saffron Diaries was calculated? I'd like to see the per-platform breakdown.",
    replies: [
      {
        admin: 0, ageHours: 390,
        body: "Hi Priya,\n\nHappy to walk you through it. Your royalty is 80% of the net profit per copy — the MRP of ₹450 minus printing, platform commission and shipping — which works out to ₹42 per copy. For 189 copies that's ₹7,938, all of which has been paid.\n\nYou can see the per-platform breakdown under Royalties in your dashboard. Let us know if anything doesn't match.\n\nWarm regards,\nBookLeaf Author Support",
      },
    ],
  },
];

export async function seedDemoTickets(prisma: PrismaClient, adminEmails: string[]) {
  if ((await prisma.ticket.count()) > 0) {
    console.log("Tickets already exist — skipping demo tickets.");
    return;
  }
  if (aiEnabled()) setAiClassifier(classifyTicketWithAi);

  const admins = await Promise.all(adminEmails.map((email) => prisma.user.findUniqueOrThrow({ where: { email } })));

  for (const d of DEMO) {
    const author = await prisma.author.findUniqueOrThrow({ where: { code: d.author }, include: { user: true } });
    const book = d.book ? await prisma.book.findUniqueOrThrow({ where: { code: d.book } }) : null;
    const replies = d.replies ?? [];
    const resolved = d.status === "RESOLVED" || d.status === "CLOSED";

    const ticket = await prisma.ticket.create({
      data: {
        authorId: author.id,
        bookId: book?.id ?? null,
        subject: d.subject,
        description: d.description,
        status: d.status,
        assigneeId: d.assignee === undefined ? null : admins[d.assignee]!.id,
        createdAt: hoursAgo(d.ageHours),
        firstResponseAt: replies[0] ? hoursAgo(replies[0].ageHours) : null,
        resolvedAt: resolved && replies.length ? hoursAgo(replies.at(-1)!.ageHours) : null,
        activities: { create: { actorId: author.userId, action: "created", createdAt: hoursAgo(d.ageHours) } },
        messages: {
          create: [
            ...replies.map((r) => ({ senderId: admins[r.admin]!.id, body: r.body, createdAt: hoursAgo(r.ageHours) })),
            ...(d.note ? [{ senderId: admins[d.note.admin]!.id, kind: "INTERNAL_NOTE" as const, body: d.note.body, createdAt: hoursAgo(d.ageHours - 1) }] : []),
          ],
        },
      },
    });
    await triageTicket(ticket.id);
  }
  console.log(`Seeded ${DEMO.length} demo tickets (classified via ${aiEnabled() ? "AI with rule fallback" : "rule-based fallback"}).`);
}
