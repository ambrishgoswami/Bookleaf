/**
 * Deterministic, rule-based classifier used when the LLM is unavailable
 * (no API key, outage, rate limit, malformed output).
 *
 * It is intentionally simple and conservative: keyword scoring for category,
 * plus escalation rules for priority that mirror the Knowledge Base (ISBN
 * errors are high priority; long-missing royalties are critical). Tickets it
 * classifies are marked source=FALLBACK so admins know to double-check them.
 */
import type { TicketCategory, TicketPriority } from "@prisma/client";

export interface Classification {
  category: TicketCategory;
  priority: TicketPriority;
  reasoning: string;
}

const CATEGORY_KEYWORDS: Record<TicketCategory, RegExp[]> = {
  ROYALTY_PAYMENTS: [/royalt/, /payout/, /payment/, /\bpaid\b/, /\bpay\b/, /bank/, /earning/, /₹|\brs\.?\b|\binr\b/, /statement/],
  ISBN_METADATA: [/isbn/, /metadata/, /\bdescription\b/, /author bio/, /\bbio\b/, /wrong (title|author|book)/, /listing details/],
  PRINTING_QUALITY: [/print/, /blur/, /misalign/, /binding/, /defect/, /quality/, /torn|damaged/, /colou?r/, /pages? (missing|out of order)/, /author cop/],
  DISTRIBUTION_AVAILABILITY: [/unavailable/, /out of stock/, /not (available|listed|showing)/, /amazon/, /flipkart/, /listing/, /distribut/, /\bstock\b/],
  BOOK_STATUS_PRODUCTION: [/typeset/, /proof/, /cover design/, /\bcover\b/, /editing/, /production/, /status/, /\bstage\b/, /when will .* (be )?(done|published|ready|live)/, /delay/],
  GENERAL_INQUIRY: [],
};

// Royalties are quarterly with a 45-day payout window, so a gap of up to ~4.5
// months can be normal. Six months or more without payment is genuinely overdue.
const LONG_GAP = String.raw`(([6-9]|1\d|six|seven|eight|nine|ten|eleven|twelve|several|many)\s+months?|(a|one|over a)\s+year)`;

const CRITICAL_PATTERNS = [
  new RegExp(String.raw`${LONG_GAP}.*(no|not|never|haven'?t).*(royalt|pa(id|yment))`),
  new RegExp(String.raw`(no|not|never|haven'?t)\s+(received|got|been paid).*${LONG_GAP}`),
  /legal|lawyer|lawsuit|consumer court|fraud|scam/,
  /(someone else|another (author|book)).*(isbn|my book)/,
];

const HIGH_PATTERNS = [
  /isbn.*(wrong|different|duplicate|incorrect|mismatch)|(wrong|different|duplicate|incorrect).*isbn/,
  /(haven'?t|not|never)\s+(received|got).*(royalt|payment|payout)/,
  /blur|misalign|defect|binding|unreadable/,
  /urgent|asap|immediately/,
  /(never|not a single|haven'?t (got|received) any).*(royalt|payment|rupee)/,
];

const LOW_PATTERNS = [/can i (update|change)/, /how (do|can) i/, /\bbio\b/, /just (wanted|curious)/, /question about/];

export function classifyWithRules(subject: string, description: string): Classification {
  const text = `${subject}\n${description}`.toLowerCase();

  let category: TicketCategory = "GENERAL_INQUIRY";
  let bestScore = 0;
  for (const [cat, patterns] of Object.entries(CATEGORY_KEYWORDS) as [TicketCategory, RegExp[]][]) {
    const score = patterns.filter((p) => p.test(text)).length;
    if (score > bestScore) [category, bestScore] = [cat, score];
  }

  let priority: TicketPriority = "MEDIUM";
  if (CRITICAL_PATTERNS.some((p) => p.test(text))) priority = "CRITICAL";
  else if (HIGH_PATTERNS.some((p) => p.test(text))) priority = "HIGH";
  else if (category === "GENERAL_INQUIRY" || LOW_PATTERNS.some((p) => p.test(text))) priority = "LOW";

  return {
    category,
    priority,
    reasoning: "Classified by keyword rules (AI unavailable) — please verify.",
  };
}
