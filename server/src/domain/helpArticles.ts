/**
 * Self-service help articles, written from the BookLeaf Knowledge Base.
 *
 * Shown in the author Help Center and suggested live while an author types a
 * new query — answering common questions before a ticket is raised
 * ("deflection"). Matching is keyword-based: instant, free, and good enough
 * for a dozen well-tagged articles.
 */
import type { TicketCategory } from "@prisma/client";

export interface HelpArticle {
  slug: string;
  title: string;
  category: TicketCategory;
  summary: string;
  body: string[];
  keywords: string[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "when-are-royalties-paid",
    title: "When will I receive my royalty payment?",
    category: "ROYALTY_PAYMENTS",
    summary: "Royalties are calculated quarterly and paid within 45 days of each quarter ending.",
    body: [
      "Royalties are calculated at the end of every quarter (March, June, September and December).",
      "Payment is made within 45 days of the quarter ending, by bank transfer to the account linked in your dashboard.",
      "Your My Books page shows your pending royalty and the date the next payout is due.",
    ],
    keywords: ["royalty", "royalties", "payment", "paid", "payout", "when", "received", "money", "quarter", "late"],
  },
  {
    slug: "how-royalty-is-calculated",
    title: "How is my royalty calculated?",
    category: "ROYALTY_PAYMENTS",
    summary: "You receive 80% of the net profit on every copy sold.",
    body: [
      "BookLeaf follows an 80/20 split: 80% of the net profit per book goes to you, 20% to BookLeaf.",
      "Net profit = MRP minus the printing cost, the platform commission (Amazon, Flipkart) and shipping charges.",
      "Your per-copy royalty is shown on each book. You can view a detailed breakdown with sales per platform in your dashboard.",
    ],
    keywords: ["royalty", "calculated", "calculation", "low", "less", "amount", "net", "profit", "split", "80", "commission", "per copy"],
  },
  {
    slug: "minimum-payout-threshold",
    title: "Why haven't I been paid? (₹1,000 minimum payout)",
    category: "ROYALTY_PAYMENTS",
    summary: "If your accumulated royalty is below ₹1,000, it rolls over to the next quarter.",
    body: [
      "Payouts are made once your accumulated royalty reaches ₹1,000.",
      "If it is below ₹1,000 at the end of a quarter, nothing is lost — it rolls over and is paid once your total crosses ₹1,000.",
      "My Books tells you whether your current balance is above the threshold.",
    ],
    keywords: ["threshold", "minimum", "1000", "1,000", "rollover", "roll", "not paid", "haven't", "small"],
  },
  {
    slug: "bank-details",
    title: "Where do royalty payments go?",
    category: "ROYALTY_PAYMENTS",
    summary: "Payouts go by bank transfer to the account linked in your dashboard.",
    body: [
      "All royalty payouts are made by bank transfer to the bank account linked in your BookLeaf dashboard.",
      "If a payout seems to be missing, check that your bank details are linked and up to date, then raise a query and our team will check within 48 hours.",
    ],
    keywords: ["bank", "account", "transfer", "ifsc", "details", "change", "update"],
  },
  {
    slug: "isbn-ownership",
    title: "Who owns my book's ISBN?",
    category: "ISBN_METADATA",
    summary: "BookLeaf assigns a unique ISBN registered under the BookLeaf imprint.",
    body: [
      "Every book published through BookLeaf gets a unique ISBN, registered under BookLeaf's publisher imprint.",
      "If you want your book under your own imprint, you'll need to obtain an ISBN independently.",
    ],
    keywords: ["isbn", "own", "imprint", "publisher", "register"],
  },
  {
    slug: "isbn-error",
    title: "My book shows a wrong or different ISBN",
    category: "ISBN_METADATA",
    summary: "ISBN errors are treated as high priority and fixed by our production team.",
    body: [
      "An ISBN that is duplicated or linked to the wrong book is a serious data issue, and we treat it as high priority.",
      "Raise a query with a screenshot of the listing — it is escalated to our production team, and we aim to resolve it within 48 hours.",
    ],
    keywords: ["isbn", "wrong", "different", "mismatch", "duplicate", "incorrect", "amazon", "listing"],
  },
  {
    slug: "update-description",
    title: "Can I update my book description or details after it's live?",
    category: "GENERAL_INQUIRY",
    summary: "Yes — metadata changes reflect on platforms within 3–5 business days.",
    body: [
      "You can update your book's description and other metadata after it's live, through your dashboard or by emailing the BookLeaf team.",
      "Changes typically reflect on Amazon, Flipkart and other platforms within 3–5 business days.",
    ],
    keywords: ["update", "change", "description", "metadata", "bio", "author bio", "edit", "blurb", "details"],
  },
  {
    slug: "print-quality",
    title: "My printed copies have a defect",
    category: "PRINTING_QUALITY",
    summary: "BookLeaf arranges a free reprint after verifying the defect.",
    body: [
      "If your copies have misprints, binding defects, blurry images or colour inconsistency, we'll arrange a free reprint once the issue is verified.",
      "Raise a query and attach photos of the defective pages. Reprints take 5–7 business days from confirmation.",
    ],
    keywords: ["print", "quality", "defect", "blurry", "misaligned", "binding", "torn", "reprint", "copies", "colour", "color", "damaged"],
  },
  {
    slug: "print-turnaround",
    title: "How long does printing take?",
    category: "PRINTING_QUALITY",
    summary: "Standard print turnaround is 5–7 business days from order confirmation.",
    body: [
      "Most orders are printed at our in-house facility in Delhi; overflow and special formats go to our partners Repro India and Epitome Books.",
      "Standard turnaround is 5–7 business days from order confirmation.",
    ],
    keywords: ["print", "printing", "how long", "turnaround", "order", "author copies", "delivery", "days"],
  },
  {
    slug: "book-unavailable",
    title: "My book shows 'Currently Unavailable' on Amazon or Flipkart",
    category: "DISTRIBUTION_AVAILABILITY",
    summary: "Usually a stock sync issue — our team can re-sync it within 24–48 hours.",
    body: [
      "If a live book shows as unavailable on a platform, it's usually a stock sync issue between our systems and the retailer.",
      "Raise a query naming the platform; our distribution team triggers a re-sync and it's typically back within 24–48 hours.",
    ],
    keywords: ["unavailable", "out of stock", "stock", "amazon", "flipkart", "not showing", "listing", "missing", "sync", "buy"],
  },
  {
    slug: "when-will-book-go-live",
    title: "When will my book be available to buy?",
    category: "DISTRIBUTION_AVAILABILITY",
    summary: "New listings go live within 7–10 business days after publication.",
    body: [
      "Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.",
      "New listings typically go live within 7–10 business days after publication is complete.",
    ],
    keywords: ["live", "available", "listing", "platforms", "amazon", "flipkart", "store", "when", "new"],
  },
  {
    slug: "production-stages",
    title: "What are the production stages, and how long do they take?",
    category: "BOOK_STATUS_PRODUCTION",
    summary: "Manuscript → Editing → Cover → Typesetting → Proofreading → ISBN → Printing → Distribution → Live.",
    body: [
      "Every book moves through: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.",
      "You're emailed at each stage, and My Books shows where your book is right now.",
      "The most common delays are at Cover Design (waiting for your approval) and Proofreading (revision rounds) — replying quickly keeps things moving.",
    ],
    keywords: ["production", "stage", "status", "typesetting", "proofreading", "cover", "design", "editing", "delay", "how long", "when"],
  },
  {
    slug: "publishing-packages",
    title: "What publishing packages does BookLeaf offer?",
    category: "GENERAL_INQUIRY",
    summary: "Standard Free (no upfront cost) and Bestseller Breakthrough (premium, with marketing add-ons).",
    body: [
      "Standard Free: publish with no upfront cost — BookLeaf handles cover design, typesetting, ISBN, printing, distribution and royalty management.",
      "Bestseller Breakthrough: a premium paid package with additional marketing and distribution add-ons.",
    ],
    keywords: ["package", "packages", "plan", "bestseller", "breakthrough", "free", "standard", "marketing", "upgrade", "cost"],
  },
];

const tokenize = (text: string) => text.toLowerCase().match(/[a-z0-9₹,']+/g) ?? [];

/** Ranks articles against free text. Empty query → all articles. */
export function searchArticles(query: string, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_ARTICLES.slice(0, limit);
  const words = new Set(tokenize(q).filter((w) => w.length > 2));

  return HELP_ARTICLES.map((a) => {
    let score = 0;
    for (const k of a.keywords) if (k.includes(" ") ? q.includes(k) : words.has(k)) score += 3;
    for (const w of tokenize(a.title)) if (words.has(w)) score += 2;
    for (const w of tokenize(a.summary)) if (words.has(w)) score += 1;
    return { article: a, score };
  })
    .filter((r) => r.score >= 3)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((r) => r.article);
}
