/**
 * Deterministic reply templates — the draft shown when the LLM is unavailable.
 * Built from the Knowledge Base so the admin starts from accurate policy text
 * instead of a blank box. Marked source=TEMPLATE in the UI.
 */
import type { TicketCategory } from "@prisma/client";

const SIGN_OFF = "Warm regards,\nBookLeaf Author Support";

const BODIES: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: `Thank you for flagging this — we understand how important it is to see your royalties arrive on time.

Royalties at BookLeaf are calculated quarterly and paid within 45 days of the quarter ending, by bank transfer to the account linked in your dashboard. If your accumulated royalty is below ₹1,000, it rolls over to the next quarter. Your royalty is 80% of the net profit per copy (MRP minus printing cost, platform commission and shipping).

[Add the author's pending amount and next payout date here.]

Could you please confirm that your bank details are linked in your dashboard? Our team will review your account and get back to you within 48 hours.`,
  ISBN_METADATA: `Thank you for letting us know — an ISBN or metadata error is a serious issue and we're treating it as a priority.

We have escalated this to our production team, who will correct the record and update the affected platforms. We'll get back to you with an update within 48 hours.

If you have a screenshot of the incorrect listing, please share it here — it will help the team resolve this faster.`,
  PRINTING_QUALITY: `We're truly sorry that your copies didn't meet the standard you should expect from us.

Could you please share a few photos of the defective copies (for example the blurry images or misaligned pages)? Once our team verifies the issue, BookLeaf will arrange a free reprint, which typically takes 5–7 business days from confirmation.`,
  DISTRIBUTION_AVAILABILITY: `Thank you for flagging this. When a published book shows as unavailable on a platform, it is usually a stock sync issue between our systems and the retailer.

We are triggering a re-sync with our distribution team now. Your book should be available again within 24–48 hours; we'll check back and confirm once it's live.`,
  BOOK_STATUS_PRODUCTION: `Thank you for checking in — we know how eagerly you're waiting to see your book in print.

[Add the book's current production stage and an updated timeline here.]

Our team will share the next update as soon as this stage is complete, and you'll also receive an email at each stage.`,
  GENERAL_INQUIRY: `Thank you for your message.

[Answer the author's question here.]

Please let us know if there's anything else we can help with.`,
};

export function templateDraft(category: TicketCategory, authorFirstName: string) {
  return {
    reply: `Hi ${authorFirstName},\n\n${BODIES[category]}\n\n${SIGN_OFF}`,
    suggestedActions: ["AI draft unavailable — review and complete the template before sending."],
  };
}
