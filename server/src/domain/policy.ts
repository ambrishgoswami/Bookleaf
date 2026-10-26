/**
 * BookLeaf business rules from the Knowledge Base, encoded once and shared by
 * the API (author dashboard) and the AI layer (so drafts quote real dates).
 */

/** Minimum accumulated royalty before a payout is made; below this it rolls over. */
export const PAYOUT_THRESHOLD_INR = 1000;

/** Royalties are paid within this many days after a quarter ends. */
export const PAYOUT_WINDOW_DAYS = 45;

export const PUBLISHED_STATUS = "Published & Live";

/** Production pipeline, in order (KB → "Production Stages"). */
export const PRODUCTION_STAGES = [
  "Manuscript Received",
  "Editing",
  "Cover Design",
  "Typesetting",
  "Proofreading",
  "ISBN Assignment",
  "Printing",
  "Distribution Setup",
  "Published & Live",
] as const;

/** "In Production - Typesetting" → { stage: "Typesetting", index: 3 } */
export function productionStage(status: string) {
  const stage = status.replace(/^In Production\s*-\s*/i, "").trim();
  const index = PRODUCTION_STAGES.findIndex((s) => s.toLowerCase() === stage.toLowerCase());
  return { stage, index, totalStages: PRODUCTION_STAGES.length };
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Last day (UTC) of the calendar quarter containing `date`. */
function quarterEnd(date: Date): Date {
  const lastMonthOfQuarter = Math.floor(date.getUTCMonth() / 3) * 3 + 2;
  return new Date(Date.UTC(date.getUTCFullYear(), lastMonthOfQuarter + 1, 0));
}

/**
 * The next royalty payout deadline as of `today`, and which quarter it covers.
 * If the previous quarter's 45-day window is still open, that's the next payout;
 * otherwise it's the current quarter's.
 */
export function nextRoyaltyPayout(today: Date = new Date()) {
  const currentQuarterEnd = quarterEnd(today);
  const previousQuarterEnd = quarterEnd(addDays(currentQuarterEnd, -100));
  const previousDeadline = addDays(previousQuarterEnd, PAYOUT_WINDOW_DAYS);

  const [periodEnd, payoutBy] =
    today <= previousDeadline
      ? [previousQuarterEnd, previousDeadline]
      : [currentQuarterEnd, addDays(currentQuarterEnd, PAYOUT_WINDOW_DAYS)];

  const q = Math.floor(periodEnd.getUTCMonth() / 3) + 1;
  return { quarter: `Q${q} ${periodEnd.getUTCFullYear()}`, quarterEnd: periodEnd, payoutBy };
}

/** The most recent payout deadline that has already passed as of `today`. */
export function lastScheduledPayout(today: Date = new Date()) {
  const upcoming = nextRoyaltyPayout(today);
  const previousQuarterEnd = quarterEnd(addDays(upcoming.quarterEnd, -100));
  return addDays(previousQuarterEnd, PAYOUT_WINDOW_DAYS);
}

/**
 * Whether a book looks like it missed a scheduled payout: its pending royalty is
 * above the threshold, yet its last payout (if any) predates the most recent
 * payout deadline. This is a signal for the support team to check, not proof —
 * some of the pending amount may have accrued after that deadline.
 */
export function payoutLooksOverdue(
  book: { royaltyPending: number; lastRoyaltyPayoutDate: Date | null; publicationDate: Date | null },
  today: Date = new Date(),
) {
  if (book.royaltyPending < PAYOUT_THRESHOLD_INR || !book.publicationDate) return false;
  // The last payout window ran from that quarter's end to its deadline; a payout
  // made anywhere inside it counts.
  const windowOpened = addDays(lastScheduledPayout(today), -PAYOUT_WINDOW_DAYS);
  if (book.publicationDate > windowOpened) return false; // too new to have been due
  return !book.lastRoyaltyPayoutDate || book.lastRoyaltyPayoutDate < windowOpened;
}

/** Formats a DB date as YYYY-MM-DD (dates are calendar days, not instants). */
export const toISODate = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : null);
