/**
 * Deterministic reply templates — the draft shown when the LLM is unavailable.
 * Built from the Knowledge Base and filled with the facts the system already
 * knows (pending royalty, payout date, production stage), so the admin starts
 * from an accurate, mostly complete reply. Only what the system can't know is
 * left in [brackets]. Marked source=TEMPLATE in the UI.
 */
import type { TicketCategory } from "@prisma/client";
import { PAYOUT_THRESHOLD_INR } from "../../domain/policy.js";
import type { TemplateFacts } from "./context.js";

const SIGN_OFF = "Warm regards,\nBookLeaf Author Support";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function royaltyPosition(f: TemplateFacts): string {
  const missed = f.book ? f.book.possibleMissedPayout : f.anyPossibleMissedPayout;
  if (missed) {
    return `Looking at your account, you have ${inr(f.totalPending)} pending and a scheduled payout appears not to have reached you. That shouldn't happen, and we're sorry. We've escalated this to our finance team, who will investigate and get back to you within 48 hours.`;
  }
  if (f.totalPending === 0) return "Looking at your account, all royalties earned so far have been paid out.";
  if (!f.meetsThreshold) {
    return `You currently have ${inr(f.totalPending)} pending. As this is below the ${inr(PAYOUT_THRESHOLD_INR)} minimum, it rolls over to the next quarter and will be paid once your total crosses ${inr(PAYOUT_THRESHOLD_INR)}.`;
  }
  return `You currently have ${inr(f.totalPending)} pending, which is above the ${inr(PAYOUT_THRESHOLD_INR)} minimum, so it is due in the next payout: earnings for ${f.nextPayoutQuarter} are paid by ${longDate(f.nextPayoutBy)}.`;
}

function productionPosition(f: TemplateFacts): string {
  if (f.book?.productionStage) {
    return `"${f.book.title}" is currently at the ${f.book.productionStage} stage (step ${f.book.stageNumber} of ${f.book.totalStages}). [Add an updated timeline for this stage here.]`;
  }
  return "[Add the book's current production stage and an updated timeline here.]";
}

const BODIES: Record<TicketCategory, (f: TemplateFacts) => string> = {
  ROYALTY_PAYMENTS: (f) => `Thank you for flagging this — we understand how important it is to see your royalties arrive on time.

Royalties at BookLeaf are calculated quarterly and paid within 45 days of the quarter ending, by bank transfer to the account linked in your dashboard. Your royalty is 80% of the net profit per copy (MRP minus printing cost, platform commission and shipping).

${royaltyPosition(f)}

Could you please confirm that your bank details are linked in your dashboard? That way nothing holds up the transfer.`,
  ISBN_METADATA: () => `Thank you for letting us know — an ISBN or metadata error is a serious issue and we're treating it as a priority.

We have escalated this to our production team, who will correct the record and update the affected platforms. We'll get back to you with an update within 48 hours.

If you have a screenshot of the incorrect listing, please share it here — it will help the team resolve this faster.`,
  PRINTING_QUALITY: () => `We're truly sorry that your copies didn't meet the standard you should expect from us.

Could you please share a few photos of the defective copies (for example the blurry images or misaligned pages)? Once our team verifies the issue, BookLeaf will arrange a free reprint, which typically takes 5–7 business days from confirmation.`,
  DISTRIBUTION_AVAILABILITY: () => `Thank you for flagging this. When a published book shows as unavailable on a platform, it is usually a stock sync issue between our systems and the retailer.

We are triggering a re-sync with our distribution team now. Your book should be available again within 24–48 hours; we'll check back and confirm once it's live.`,
  BOOK_STATUS_PRODUCTION: (f) => `Thank you for checking in — we know how eagerly you're waiting to see your book in print.

${productionPosition(f)}

Our team will share the next update as soon as this stage is complete, and you'll also receive an email at each stage.`,
  GENERAL_INQUIRY: () => `Thank you for your message.

[Answer the author's question here.]

Please let us know if there's anything else we can help with.`,
};

export function templateDraft(category: TicketCategory, authorFirstName: string, facts: TemplateFacts) {
  return {
    reply: `Hi ${authorFirstName},\n\n${BODIES[category](facts)}\n\n${SIGN_OFF}`,
    suggestedActions: [
      "AI draft unavailable — review the template and complete any [bracketed] parts before sending.",
      ...(category === "ROYALTY_PAYMENTS" && (facts.book?.possibleMissedPayout ?? facts.anyPossibleMissedPayout)
        ? ["Check the payout file for a missed payout and escalate to finance."]
        : []),
    ],
  };
}
