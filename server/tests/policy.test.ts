import { describe, expect, it } from "vitest";
import { nextRoyaltyPayout, productionStage } from "../src/domain/policy.js";

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
