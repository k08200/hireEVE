import { describe, expect, it, vi } from "vitest";

// Mock db before importing
vi.mock("../db.js", () => ({
  db: {
    conversationSummary: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
    },
  },
  prisma: {},
}));
vi.mock("../openai.js", () => ({
  MODEL: "gpt-4o-mini",
  openai: {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "Summary of conversation" } }],
        })),
      },
    },
  },
}));

import { compactHistory, forceCompact, isTokenLimitError } from "../context-compressor.js";

function makeMessages(
  count: number,
  contentSize = 100,
): { id: string; role: string; content: string; createdAt: Date }[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? "USER" : "ASSISTANT",
    content: "A".repeat(contentSize),
    createdAt: new Date(Date.now() + i * 1000),
  }));
}

describe("isTokenLimitError", () => {
  it("detects context_length_exceeded code", () => {
    expect(isTokenLimitError({ code: "context_length_exceeded" })).toBe(true);
  });

  it("detects error message with 'context length'", () => {
    expect(isTokenLimitError({ message: "Maximum context length exceeded" })).toBe(true);
  });

  it("detects nested error object", () => {
    expect(isTokenLimitError({ error: { code: "context_length_exceeded" } })).toBe(true);
  });

  it("detects 'too many tokens' message", () => {
    expect(isTokenLimitError(new Error("too many tokens for this model"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isTokenLimitError(new Error("network timeout"))).toBe(false);
    expect(isTokenLimitError({ code: "rate_limit" })).toBe(false);
    expect(isTokenLimitError(null)).toBe(false);
  });
});

describe("compactHistory", () => {
  it("returns messages as-is when count is below threshold", async () => {
    const msgs = makeMessages(5);
    const result = await compactHistory("conv-1", msgs);
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe("user");
  });

  it("returns messages as-is when token count is within limit", async () => {
    const msgs = makeMessages(14, 50);
    const result = await compactHistory("conv-1", msgs);
    expect(result).toHaveLength(14);
  });

  it("compacts old messages when over token limit", async () => {
    // 20 messages × 3000 chars each → way over 12k token limit
    const msgs = makeMessages(20, 3000);
    const result = await compactHistory("conv-2", msgs);
    // Should have: 1 summary + 10 recent messages
    expect(result.length).toBeLessThanOrEqual(11);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("summary");
  });
});

describe("forceCompact", () => {
  it("returns only recent messages when no summary exists", async () => {
    const msgs = makeMessages(20);
    const result = await forceCompact("conv-3", msgs, 3);
    expect(result).toHaveLength(3);
  });

  it("respects keepRecent parameter", async () => {
    const msgs = makeMessages(10);
    const result = await forceCompact("conv-4", msgs, 5);
    expect(result).toHaveLength(5);
  });
});
