/** Starter saved replies for the support team, from the Knowledge Base. Seeded once. */
import type { PrismaClient, TicketCategory } from "@prisma/client";

const MACROS: { title: string; category: TicketCategory | null; body: string }[] = [
  {
    title: "Royalty schedule explained",
    category: "ROYALTY_PAYMENTS",
    body: "Hi {{authorFirstName}},\n\nThanks for checking in about your royalties. At BookLeaf, royalties are calculated quarterly and paid within 45 days of each quarter ending, by bank transfer to the account linked in your dashboard. If your accumulated royalty is below ₹1,000, it rolls over to the next quarter.\n\nCould you confirm your bank details are linked in your dashboard? We'll make sure nothing holds up your next payout.\n\nWarm regards,\nBookLeaf Author Support",
  },
  {
    title: "ISBN error — escalated",
    category: "ISBN_METADATA",
    body: "Hi {{authorFirstName}},\n\nThank you for flagging this — an ISBN mismatch is a serious data issue and we're treating it as high priority. We've escalated {{ticketRef}} to our production team, who will correct the record and update the affected platforms. We'll get back to you within 48 hours.\n\nWarm regards,\nBookLeaf Author Support",
  },
  {
    title: "Print defect — free reprint",
    category: "PRINTING_QUALITY",
    body: "Hi {{authorFirstName}},\n\nWe're truly sorry your copies didn't meet the standard you should expect from us. Could you share a few photos of the affected pages here? Once our team verifies the issue, we'll arrange a free reprint — typically 5–7 business days from confirmation.\n\nWarm regards,\nBookLeaf Author Support",
  },
  {
    title: "Unavailable listing — re-sync triggered",
    category: "DISTRIBUTION_AVAILABILITY",
    body: "Hi {{authorFirstName}},\n\nThanks for letting us know. When a live book shows as unavailable, it's usually a stock sync issue with the retailer. We've triggered a re-sync with our distribution team for {{bookTitle}}; it should be back within 24–48 hours, and we'll confirm once it's live.\n\nWarm regards,\nBookLeaf Author Support",
  },
  {
    title: "Metadata update timeline",
    category: "GENERAL_INQUIRY",
    body: "Hi {{authorFirstName}},\n\nYes — you can update your book's description and other details after it's live, through your dashboard or by emailing the BookLeaf team. Changes typically reflect on all platforms within 3–5 business days.\n\nWarm regards,\nBookLeaf Author Support",
  },
];

export async function seedMacros(prisma: PrismaClient) {
  if ((await prisma.macro.count()) > 0) return;
  await prisma.macro.createMany({ data: MACROS });
  console.log(`Seeded ${MACROS.length} saved replies.`);
}
