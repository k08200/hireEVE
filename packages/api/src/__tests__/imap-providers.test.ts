/**
 * Pins the per-provider IMAP registry (Phase 2). Two invariants matter:
 * idPrefix values are PERSISTED dedup-key namespaces (changing one re-ingests
 * every already-seen message as new), and ICLOUD only becomes schedulable
 * when ICLOUD_INBOX_ENABLED is on (CASA surface freeze).
 */

import { afterEach, describe, expect, it } from "vitest";
import { enabledImapProviderKeys, IMAP_PROVIDERS } from "../mail/imap-providers.js";

const ORIGINAL = process.env.ICLOUD_INBOX_ENABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ICLOUD_INBOX_ENABLED;
  else process.env.ICLOUD_INBOX_ENABLED = ORIGINAL;
});

describe("IMAP_PROVIDERS registry", () => {
  it("pins the persisted dedup-key prefixes — these must NEVER change", () => {
    expect(IMAP_PROVIDERS.NAVER.idPrefix).toBe("naver-imap");
    expect(IMAP_PROVIDERS.ICLOUD.idPrefix).toBe("icloud-imap");
  });

  it("pins each provider to its exact allowlisted host", () => {
    expect(IMAP_PROVIDERS.NAVER.defaultHost).toBe("imap.naver.com:993");
    expect(IMAP_PROVIDERS.ICLOUD.defaultHost).toBe("imap.mail.me.com:993");
  });
});

describe("enabledImapProviderKeys — ICLOUD_INBOX_ENABLED gate", () => {
  it("is NAVER-only while the flag is off (default)", () => {
    delete process.env.ICLOUD_INBOX_ENABLED;
    expect(enabledImapProviderKeys()).toEqual(["NAVER"]);
    process.env.ICLOUD_INBOX_ENABLED = "false";
    expect(enabledImapProviderKeys()).toEqual(["NAVER"]);
  });

  it("includes ICLOUD when the flag is on (re-read per call, no restart)", () => {
    process.env.ICLOUD_INBOX_ENABLED = "true";
    expect(enabledImapProviderKeys()).toEqual(["NAVER", "ICLOUD"]);
    // Lenient truthy parse — the operator-footgun spellings count as on.
    process.env.ICLOUD_INBOX_ENABLED = " 1 ";
    expect(enabledImapProviderKeys()).toEqual(["NAVER", "ICLOUD"]);
  });
});
