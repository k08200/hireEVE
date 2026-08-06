# Launch plan (drafted 2026-08-07)

Founder-stated goals: demo video first; Google OAuth verification so anyone
can log in and use it; multi-account (2–3 inboxes) with 2+ accounts paid;
pricing $7.99 or $8.99; more providers (iCloud, Naver, …); mobile "coming
soon"; then promotion. This file sequences that against the actual state of
the repo and adds the missing pieces. Decisions marked LOCKED are the
founder's; PENDING ones block only their own step, nothing upstream.

## P0 — Sync integrity (this week; blocks everything user-facing)

The founder's own primary Gmail stopped ingesting ~2026-07-21 (Testing-mode
refresh token death). Diagnosis (2026-08-07, file:line evidence in session):
ingestion retries and fails every tick with only a console.warn; the desktop
app surfaces nothing (no /google/status call, no notification rendering, and
`routes/email.ts` hardcodes `needsReconnect: false` for the primary entry so
the desktop's reconnect UI can never fire for it); desktop re-login is pure
JWT and does not touch the Google token.

- [ ] Founder: web Settings → Connections → Google → Connect (full re-consent;
      Production audience since 2026-08-04, so the new token is long-lived).
- [ ] fix(api): primary inbox entry in `/api/email/inboxes` reports real
      `needsReconnect` (UserToken.refreshToken null) instead of `false`.
- [ ] fix(desktop): primary reconnect action must open the primary connect
      flow (today the TopBar button calls link-inbox and would create a
      duplicate Pro-gated secondary).
- [ ] Backfill: after reconnect, history is expired (>7d) and snapshot sync
      only pulls the most-recent ~20–30 — run a manual deep sync (larger
      maxResults) so 07-21→now mail actually lands; consider a one-shot
      "catch-up" path for any user returning from a dead token.
- [ ] Alerting: "Email sync skipped … Gmail not connected" repeated per tick
      should reach Sentry/ops, not only stdout.

## P1 — Login-for-everyone gate (deadline-driven)

- [ ] CASA: the 4 outstanding founder actions (docs/launch — see CASA prescan
      notes, 2026-08-04), then TAC DAST (scans prod BEFORE 2026-10-05), then
      Letter of Assessment. Until LoA: provider flags stay OFF (frozen).
- [ ] Azure app registration (personal + work/school), redirect
      `https://klorn-api.onrender.com/api/auth/outlook/callback`, delegated
      Mail.Read/ReadWrite/Send + offline_access; put MS_CLIENT_ID/SECRET/
      REDIRECT_URI in Render. (Parallel to CASA; Outlook flag flip still
      waits for LoA.)
- [ ] Beta gate policy: BETA_GATE_ENABLED is the only line between "verified
      app" and "anyone logs in" — decide open criteria (cohort size, waitlist).

## P2 — Monetization

- Multi-account = paid is ALREADY the shipped shape (link/connect routes are
  requireEntitled; entitlement inert while PAYWALL_ENABLED=false). LOCKED.
- [ ] PENDING founder decision: price $7.99 vs $8.99 /mo. Recommendation:
      $8.99/mo + ~$79/yr (2 months free) — mid-point between SaneBox ($7–12)
      and Superhuman ($25–30), and the 4-tier firewall + multi-provider story
      supports the higher anchor; drop to $7.99 only if beta conversion says so.
- [ ] Create Stripe (web) + RevenueCat (mobile) price objects; verify webhook
      plan sync end-to-end in test mode.
- [ ] PAYWALL flip per docs/launch/paywall-flip-runbook.md (trial stays 7d
      card-required). Flip AFTER beta cohort feedback, not with it.

## P3 — Product surface for launch

- [ ] Demo video: script around the 4-tier firewall + Decision queue +
      multi-inbox; record on web (desktop app b-roll optional).
- [ ] Landing (EN/KO lockstep + parity CI): providers row (Gmail live,
      Naver live, iCloud/Outlook "coming soon"), mobile "coming soon",
      pricing section once P2 lands. Measured claims only.
- [ ] Legal before paywall: privacy policy + terms + refund policy pages
      current; support contact (hello@klorn.ai) surfaced in-app.

## P4 — Flag flips (each a separate deliberate decision, post-LoA)

Order: MULTI_INBOX_SYNC_ENABLED → PROVIDER_INBOX_SELECTOR_ENABLED →
ICLOUD_INBOX_ENABLED → OUTLOOK_INBOX_ENABLED (needs Azure creds; without
them link-start 503s by design) → AUTO_REPLY_LINKED_INBOX_ENABLED last.
Each flip: real-account connect + sync + action verification same day.
Known follow-ups riding the flips: Outlook true reply threading
(/messages/{id}/reply), Graph 3MB inline attachment pre-check.

## P5 — Distribution

- [ ] Mobile: Capacitor shell exists; TestFlight/internal track first,
      store listing with "multi-inbox firewall" positioning; RevenueCat IAP.
- [ ] Promotion after P0–P3 are true: Product Hunt, HN/Show HN, Korean dev
      communities; the demo video is the anchor asset.
- [ ] Ops for real users: manual DB backup drill on schedule (free tier has
      no automated backups — docs/launch/db-credential-runbook.md), Sentry
      alert rules, uptime monitor on /api/health.

## Non-goals for launch

Generic IMAP (Phase 4 of the provider plan) stays unbuilt until its SSRF
design passes review. No new Google scopes anywhere.
