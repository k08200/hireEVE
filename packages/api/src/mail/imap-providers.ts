/**
 * Per-provider config for the generalized IMAP path (Phase 2 of
 * docs/providers/multi-provider-plan.md). One registry entry per
 * app-password IMAP provider; OAuth providers (Google, Outlook) never
 * appear here — their credential shape is different (inboxAuthKind()).
 *
 * `idPrefix` namespaces the synthesized EmailMessage.gmailId
 * (`<idPrefix>:<mailbox email>:<imap uid>`). It is PERSISTED in dedup keys —
 * an existing prefix must never change, or every already-ingested message
 * re-ingests as new.
 */

import { icloudInboxEnabled } from "../config.js";

export type ImapProviderKey = "NAVER" | "ICLOUD";

export interface ImapProviderConfig {
  provider: ImapProviderKey;
  /** User-facing name for error copy ("Naver", "iCloud"). */
  label: string;
  /** The only host the SSRF allowlist accepts for this provider. */
  defaultHost: string;
  /** Persisted dedup-key namespace — never change an existing value. */
  idPrefix: string;
  /** Log + Sentry scope prefix (also effectively persisted: ops dashboards). */
  logScope: string;
  /** Shown in the settings UI when the IMAP LOGIN itself is rejected. */
  authFailureHint: string;
  /** Same ceiling rationale as routes/auth.ts MAX_LINKED_INBOXES: one user
   * must not turn the serial IMAP poll into a multi-minute tick. */
  maxAccounts: number;
}

export const IMAP_PROVIDERS: Record<ImapProviderKey, ImapProviderConfig> = {
  NAVER: {
    provider: "NAVER",
    label: "Naver",
    defaultHost: "imap.naver.com:993",
    idPrefix: "naver-imap",
    logScope: "naver-imap",
    authFailureHint:
      "Naver IMAP login failed. Generate a separate '외부 메일 비밀번호' in Naver security settings and paste that — not your account password.",
    maxAccounts: 10,
  },
  ICLOUD: {
    provider: "ICLOUD",
    label: "iCloud",
    defaultHost: "imap.mail.me.com:993",
    idPrefix: "icloud-imap",
    logScope: "icloud-imap",
    authFailureHint:
      "iCloud IMAP login failed. Generate an app-specific password at account.apple.com (requires two-factor authentication on your Apple ID) and paste that — not your Apple ID password.",
    maxAccounts: 10,
  },
};

/**
 * Host↔provider pin: the shared SSRF allowlist alone would let a NAVER row
 * point at the iCloud host (and vice versa). Compares the host part only —
 * the port-less form was always accepted, and port validity is the
 * allowlist's job. Enforced at the /connect write AND re-checked at poll
 * time (imap-accounts.ts), same belt-and-braces as the allowlist itself.
 */
export function hostMatchesProvider(host: string, provider: ImapProviderConfig): boolean {
  const hostPart = host.trim().toLowerCase().split(":")[0];
  return hostPart === provider.defaultHost.split(":")[0];
}

/**
 * Providers the poll scheduler may select rows for. NAVER predates the flag
 * doctrine and is always on; ICLOUD stays dark until ICLOUD_INBOX_ENABLED
 * (CASA surface freeze — see the flag comment in config.ts). Evaluated per
 * tick so the flag is togglable without a restart.
 */
export function enabledImapProviderKeys(): ImapProviderKey[] {
  return icloudInboxEnabled() ? ["NAVER", "ICLOUD"] : ["NAVER"];
}
