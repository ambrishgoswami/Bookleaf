import { describe, expect, it } from "vitest";
import { nextRoyaltyPayout, payoutLooksOverdue, productionStage } from "../src/domain/policy.js";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("nextRoyaltyPayout", () => {
  it("returns the previous quarter while its 45-day window is open", () => {
    const p = nextRoyaltyPayout(day("2026-10-26"));
    expect(p.quarter).toBe("Q3 2026");
    expect(iso(p.payoutBy)).toBe("2026-11-14");
  });

  it("moves to the current quarter once the previous window has closed", () => {
    const p = nextRoyaltyPayout(day("2026-11-20"));
    expect(p.quarter).toBe("Q4 2026");
    expect(iso(p.payoutBy)).toBe("2027-02-14");
  });

  it("handles the year boundary (Q4 payout lands in February)", () => {
    const p = nextRoyaltyPayout(day("2027-01-10"));
    expect(p.quarter).toBe("Q4 2026");
    expect(iso(p.payoutBy)).toBe("2027-02-14");
  });
});

describe("productionStage", () => {
  it("parses the stage from a production status", () => {
    expect(productionStage("In Production - Typesetting")).toMatchObject({ stage: "Typesetting", index: 3 });
    expect(productionStage("In Production - Cover Design")).toMatchObject({ stage: "Cover Design", index: 2 });
  });
});

describe("payoutLooksOverdue", () => {
  const today = day("2026-10-26"); // last passed payout deadline: 2026-08-14 (Q2)
  const book = (pending: number, lastPayout: string | null, published = "2023-06-20") => ({
    royaltyPending: pending,
    lastRoyaltyPayoutDate: lastPayout ? day(lastPayout) : null,
    publicationDate: day(published),
  });

  it("flags pending above threshold with no payout since before the last deadline", () => {
    expect(payoutLooksOverdue(book(3570, "2025-10-15"), today)).toBe(true);
    expect(payoutLooksOverdue(book(2464, null, "2024-09-10"), today)).toBe(true);
  });

  it("does not flag balances below the ₹1,000 threshold (they roll over)", () => {
    expect(payoutLooksOverdue(book(850, null, "2024-11-05"), today)).toBe(false);
  });

  it("does not flag a recent payout or a book too new to have been due", () => {
    expect(payoutLooksOverdue(book(3000, "2026-08-10"), today)).toBe(false);
    expect(payoutLooksOverdue(book(3000, null, "2026-09-01"), today)).toBe(false);
  });
});
