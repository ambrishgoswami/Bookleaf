import { describe, expect, it } from "vitest";
import { classifyWithRules } from "../src/modules/ai/fallbackClassifier.js";

// Sample queries straight from the BookLeaf Knowledge Base.
const cases = [
  ["Royalty not received", "I published my book 4 months ago and still haven't received any royalty. What's going on?", "ROYALTY_PAYMENTS", "HIGH"],
  ["No royalty for 6 months", "I haven't received any royalty for 6 months now.", "ROYALTY_PAYMENTS", "CRITICAL"],
  ["Royalty seems low", "My royalty amount seems too low. I sold 200 copies but only received ₹3,000.", "ROYALTY_PAYMENTS", "MEDIUM"],
  ["ISBN mismatch", "My book is showing a different ISBN on Amazon than what's on the physical copy.", "ISBN_METADATA", "HIGH"],
  ["Bad print quality", "I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.", "PRINTING_QUALITY", "HIGH"],
  ["Book unavailable", "My book is published but it's showing as Currently Unavailable on Amazon.", "DISTRIBUTION_AVAILABILITY", "MEDIUM"],
  ["Typesetting delay", "It's been 3 weeks and my book is still in typesetting. When will it be done?", "BOOK_STATUS_PRODUCTION", "MEDIUM"],
  ["Update author bio", "Can I update my author bio on the website?", "ISBN_METADATA", "LOW"],
] as const;

describe("classifyWithRules (AI fallback)", () => {
  it.each(cases)("%s → %s / %s", (subject, description, category, priority) => {
    const result = classifyWithRules(subject, description);
    expect(result.category).toBe(category);
    expect(result.priority).toBe(priority);
  });

  it("defaults unknown queries to General Inquiry / Low", () => {
    expect(classifyWithRules("Hello", "Just saying thanks to the team for the help!")).toMatchObject({
      category: "GENERAL_INQUIRY",
      priority: "LOW",
    });
  });
});
