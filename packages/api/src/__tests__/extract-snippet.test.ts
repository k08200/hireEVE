import { describe, expect, it } from "vitest";
import { extractSnippet } from "../extract-snippet.js";

describe("extractSnippet", () => {
  it("returns original content when shorter than maxLength", () => {
    const result = extractSnippet("Hello world", "world", 200);
    expect(result.text).toBe("Hello world");
    expect(result.highlights).toEqual([{ start: 6, end: 11 }]);
  });

  it("returns centered snippet around first match when content is long", () => {
    const content = `${"a".repeat(300)} target word ${"b".repeat(300)}`;
    const result = extractSnippet(content, "target", 100);
    expect(result.text.length).toBeLessThanOrEqual(100 + 6); // +6 for ellipses
    expect(result.text).toContain("target");
    expect(result.text.startsWith("…")).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
  });

  it("case-insensitive match, preserves original casing in output", () => {
    const result = extractSnippet("Hello World", "WORLD", 200);
    expect(result.text).toBe("Hello World");
    expect(result.highlights).toEqual([{ start: 6, end: 11 }]);
  });

  it("returns all occurrences of the query in the snippet", () => {
    const content = "foo bar foo baz foo";
    const result = extractSnippet(content, "foo", 200);
    expect(result.highlights).toHaveLength(3);
    expect(result.highlights.map((h) => content.slice(h.start, h.end))).toEqual([
      "foo",
      "foo",
      "foo",
    ]);
  });

  it("leading ellipsis omitted when match is near start", () => {
    const content = `target ${"a".repeat(500)}`;
    const result = extractSnippet(content, "target", 100);
    expect(result.text.startsWith("…")).toBe(false);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text).toContain("target");
  });

  it("trailing ellipsis omitted when match is near end", () => {
    const content = `${"a".repeat(500)} target`;
    const result = extractSnippet(content, "target", 100);
    expect(result.text.endsWith("…")).toBe(false);
    expect(result.text.startsWith("…")).toBe(true);
    expect(result.text).toContain("target");
  });

  it("no match returns head of content with no highlights", () => {
    const content = "a".repeat(500);
    const result = extractSnippet(content, "missing", 100);
    expect(result.highlights).toEqual([]);
    expect(result.text.length).toBeLessThanOrEqual(100 + 1); // +1 for ellipsis
    expect(result.text.endsWith("…")).toBe(true);
  });

  it("empty query returns content head with no highlights", () => {
    const result = extractSnippet("Hello world", "", 200);
    expect(result.highlights).toEqual([]);
    expect(result.text).toBe("Hello world");
  });

  it("highlights within returned snippet are relative to the snippet text", () => {
    const content = `${"a".repeat(300)} findme ${"b".repeat(300)}`;
    const result = extractSnippet(content, "findme", 80);
    for (const h of result.highlights) {
      expect(result.text.slice(h.start, h.end).toLowerCase()).toBe("findme");
    }
  });

  it("handles regex special chars in query safely", () => {
    const content = "price is $100 (approx)";
    const result = extractSnippet(content, "$100", 200);
    expect(result.highlights).toHaveLength(1);
    expect(result.text.slice(result.highlights[0].start, result.highlights[0].end)).toBe("$100");
  });
});
