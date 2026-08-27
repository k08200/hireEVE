/**
 * API keys — the machine credential for the MCP endpoint, and nothing else:
 * requireAuth/getUserId never accept one, and authenticateApiKey is called
 * only by the MCP route, so a leaked key's blast radius is the MCP toolset,
 * not the account. Only the SHA-256 hash is stored (Device.tokenHash /
 * one-time-token standard); the raw key is shown once at creation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const keyFindUnique = vi.hoisted(() => vi.fn(async () => null as unknown));
const keyUpdate = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("../db.js", () => {
  const prisma = { apiKey: { findUnique: keyFindUnique, update: keyUpdate } };
  return { prisma, db: prisma };
});
vi.mock("../sentry.js", () => ({ captureError: vi.fn() }));

import { authenticateApiKey, hashApiKey, mintApiKey } from "../mcp/api-keys.js";

beforeEach(() => {
  keyFindUnique.mockReset();
  keyFindUnique.mockResolvedValue(null);
  keyUpdate.mockClear();
});

describe("mintApiKey", () => {
  it("mints a prefixed secret, stores only its hash, and keeps a display prefix", () => {
    const minted = mintApiKey();
    expect(minted.token).toMatch(/^klorn_sk_[0-9a-f]{64}$/);
    expect(minted.tokenHash).toBe(hashApiKey(minted.token));
    expect(minted.tokenHash).not.toContain(minted.token.slice(9));
    expect(minted.prefix).toBe(minted.token.slice(0, 15));
  });

  it("mints unique secrets", () => {
    expect(mintApiKey().token).not.toBe(mintApiKey().token);
  });
});

describe("authenticateApiKey", () => {
  it("resolves a live key to its user and bumps lastUsedAt", async () => {
    const minted = mintApiKey();
    keyFindUnique.mockResolvedValue({
      id: "k1",
      userId: "u1",
      revokedAt: null,
    });
    const out = await authenticateApiKey(`Bearer ${minted.token}`);
    expect(out).toEqual({ userId: "u1", keyId: "k1" });
    expect(keyFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hashApiKey(minted.token) } }),
    );
    await vi.waitFor(() => expect(keyUpdate).toHaveBeenCalled());
  });

  it("rejects a revoked key", async () => {
    keyFindUnique.mockResolvedValue({
      id: "k1",
      userId: "u1",
      revokedAt: new Date("2026-08-01T00:00:00Z"),
    });
    expect(await authenticateApiKey(`Bearer ${mintApiKey().token}`)).toBeNull();
  });

  it("rejects unknown, malformed, or non-key bearers without a DB hit", async () => {
    expect(await authenticateApiKey(undefined)).toBeNull();
    expect(await authenticateApiKey("Bearer eyJhbGciOi.jwt.token")).toBeNull();
    expect(await authenticateApiKey("Basic abc")).toBeNull();
    expect(keyFindUnique).not.toHaveBeenCalled();
    expect(await authenticateApiKey(`Bearer ${mintApiKey().token}`)).toBeNull();
  });
});
