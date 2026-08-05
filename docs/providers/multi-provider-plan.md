# Multi-provider mail plan (Gmail · Naver · iCloud · Outlook · generic IMAP)

Decided 2026-08-05. Goal: 3–4 mail accounts per user, any mix of providers,
managed in one firewall across web/mobile/desktop. This file is the sequenced
plan; each phase is a separate PR train and each later phase depends on the
earlier ones.

## Where the code actually is (audited 2026-08-05)

- No provider interface. The sync/action pipeline is hard-wired to Gmail
  (`mail/email-sync.ts` imports googleapis directly; `source: "gmail"` is a
  fixed literal). Naver is a parallel, hand-rolled ingestion path
  (`mail/naver-imap.ts`) that co-opts `gmailId` as `naver-imap:<email>:<uid>`
  and reuses only the judge core.
- Naver is **read-only** (zero send/archive/mark-read functions) and
  **single-account by schema** (four flat columns on `User`; a second connect
  overwrites the first).
- `LinkedInboxAccount` was Google-OAuth-shaped with no provider column
  (fixed in Phase 0a).
- The action surface has no interface boundary: 8+ mutation functions live in
  `mail/gmail.ts` and every caller imports them by name
  (`agentcore/tool-executor.ts`, routes/email-*.ts).
- Auto-reply is primary-Gmail-only even for linked Gmail accounts
  (`automation-scheduler.ts` filters `linkedInboxAccountId: null` on purpose —
  per-account send routing does not exist yet).
- The wire contract has no provider concept: `EmailListResponse.source` is
  `"gmail" | "demo"`, and Naver rows are reported as `"gmail"`.
- The IMAP SSRF allowlist is deliberately a single exact host
  (`mail/is-allowed-imap-host.ts`). iCloud is a one-line addition; generic
  IMAP is a different security design, not an extension.

Blast radius of the full effort: ~60 API files reference Gmail, 24 thread
`linkedInboxAccountId`, ~18 web files, plus one load-bearing contract type.

## External constraints (verified 2026-08-05)

| Provider | Reality |
|---|---|
| Outlook | Basic-auth IMAP retired for outlook.com (Mar–Apr 2026). OAuth only, via Microsoft Graph (`Mail.Read/ReadWrite/Send`, delta queries, change-notification webhooks). Azure app registration required; the verified-publisher badge requires an **organizational tenant** (personal-account registrations cannot get it). From 2026-12-31, editing a delivered message's subject/body/recipients needs `Mail-Advanced.ReadWrite` — Klorn only flags/moves/marks, so standard scopes should suffice; re-verify at implementation. |
| iCloud | No OAuth. IMAP `imap.mail.me.com:993` / SMTP `smtp.mail.me.com:587` with an **app-specific password** (requires 2FA on the Apple ID). UX must walk the user through generating one. |
| Generic IMAP | Technically easy, security-hard: accepting arbitrary hosts is exactly what the allowlist exists to prevent. Needs DNS-resolution-time private-IP blocking (rebinding-safe) before it can ship. |

## Phases

**Phase 0a — provider-aware schema (this PR).** `InboxProvider` enum +
`provider` column (default GOOGLE backfills), `accessToken` nullable,
`imapHost`/`imapPasswordCipher` columns, dedup key gains provider.
`mail/inbox-credentials.ts:inboxAuthKind()` is the single provider→credential
mapping. No behavior change.

**Phase 0b — Naver moves into LinkedInboxAccount.** Data migration from the
four `User` columns to a `provider: NAVER` row; `naver-imap.ts`/scheduler/
routes read the table. Side effect: Naver becomes multi-account. The `User`
columns are dropped one release later (expand/contract).

0b's provider-filter audit list (from the 0a security review — every
`linkedInboxAccount` call site that reads without a provider filter today;
safe while all rows are GOOGLE, each must be scoped or generalized the moment
NAVER rows exist): `mail/gmail.ts:742,786,821,1629,1684,1725`,
`mail/email-sync.ts:122,144,343`, `automation-scheduler.ts:1054`,
`routes/email.ts:1151,1181`, `scripts/reencrypt-tokens.ts:143,147`.
(`routes/gmail-push.ts` was already scoped to GOOGLE in 0a.)

Two more 0b must-fixes beyond the filter list:
- `notify/reconnect-notification.ts:22,27,47` — the reconnect alert's copy is
  hardcoded "Gmail disconnected" and its dedupe key is `reconnect:google:…`;
  reached from `markLinkedInboxForReconnect` for ANY row, so a broken
  Naver/iCloud row would surface Gmail-branded copy. Needs provider-aware
  copy + dedupe key.
- `scripts/reencrypt-tokens.ts:140-148` — the key-rotation sweep covers only
  accessToken/refreshToken; it must also sweep `imapPasswordCipher` once 0b
  populates it, or rotated keys silently strand IMAP credentials.

**Phase 1 — MailProvider interface.** Extract ingestion
(fetch→normalize→upsert→judge, the shape `naver-imap.ts` already proves) and
actions (send/archive/markRead/trash/star) behind one interface;
`tool-executor` dispatches by provider; per-account send routing lands here
(also unlocks auto-reply for linked Gmail accounts). Contract gains a real
`provider` field on `InboxOption`/list responses.

**Phase 2 — iCloud.** Allowlist + app-specific-password connect UX on the
generalized IMAP path. Smallest new provider; validates Phase 1.

**Phase 3 — Outlook.** Azure app registration (founder action), Graph OAuth
connect, delta-query sync, Graph-API actions, change-notification webhook (or
poll first, webhook later).

**Phase 4 — generic IMAP.** Only after the SSRF design (resolve-then-pin,
private-range rejection) passes security review. OFF flag until then.

## Cross-cutting rules

- Every phase ships **OFF by default** (repo doctrine) and stays off until the
  CASA Letter of Assessment is issued — the TAC DAST scans production before
  2026-10-05, and new auth/IMAP endpoints must not widen that surface mid-scan.
- The 100-user cohort does not wait for any of this: it runs on Gmail today.
- No new Google scopes at any phase — nothing here reopens Google verification.
