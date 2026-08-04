# Row-Level Security rollout

Tenant isolation is enforced in application code today (`where: { userId }`).
A single missing filter is a cross-tenant leak with no database backstop — a
class of bug that has shipped here before (the `20260625000000_scope_unique_
constraints_by_user` migration fixed three tables that had global unique
constraints). Postgres RLS makes isolation an invariant the database enforces,
not one every query author must remember.

This is a **staged** rollout, and the staging is gated on a tested restore
path (done, 2026-08-04) *and* on the app connecting as a role that RLS can
actually constrain (not yet true — see below).

## The blocker: the app's role bypasses RLS unconditionally

Measured against production on 2026-08-04:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
-- rolsuper = false, rolbypassrls = TRUE
```

The app connects as `postgres` (the pooler username `postgres.<ref>` maps to
that role), and that role bypasses RLS for **two independent reasons**:

| Reason | Fixed by `FORCE`? |
| --- | --- |
| It **owns** the tables — Prisma migrations run as it | yes |
| It has the **`BYPASSRLS`** attribute | **no** |

`BYPASSRLS` outranks `FORCE`. So the original plan below — "FORCE each table
once its call sites are routed" — **would have done nothing**, silently: no
error, no denied row, just policies that never evaluate. Any canary written
against that state would have been measuring a no-op.

Do **not** try to fix this with `ALTER ROLE postgres NOBYPASSRLS`. On Supabase
`postgres` is not a superuser (so it likely cannot alter its own attribute),
and Supabase's own internals — dashboard, PostgREST, extensions — run as that
role.

### Verified end to end on production, 2026-08-05

`klorn_app` now exists (`NOBYPASSRLS`, owns nothing) and the whole mechanism
was proven against the real database before any application code depends on
it. Nothing was switched over — `DATABASE_URL` still points at `postgres`, so
this was observation only.

Connecting through the session pooler as `klorn_app.<ref>` works, which was the
open question that would have invalidated the approach: Supavisor accepts a
non-`postgres` username.

| Probe (as `klorn_app`, on `EmailMessage`) | Result |
| --- | --- |
| no GUC set | **0 rows** — fails closed |
| `app.current_user_id` = each of the 10 users | rows visible, and **every visible row belonged to that user** |
| `app.bypass_rls = 'on'` | **1020 rows** (the whole table) |
| sum of the 10 per-user counts | **1020** |

The last two lines are the proof, and they are worth more than the first two.
"Fails closed" and "opens for a tenant" are both satisfied by a broken policy —
one that denies everything scores the first, one that ignores the GUC scores
the second. Only an exact partition satisfies both at once: the per-user counts
summing to precisely the unrestricted total means no row is hidden from its
owner **and** no row is visible to anyone else. A leak or a loss would show up
as a mismatch here and nowhere else.

This also confirms `set_config(..., is_local => true)` survives the pooler,
which is the assumption `withTenant` is built on.

**Known gap: `User` itself has no RLS.** 43 tables are enabled and all 43 have
policies (no orphan with RLS on and no policy — that combination would deny
everything once RLS binds). `User` is not among them: it has no `userId`
column, so the `"userId" = current_setting(...)` shape does not fit — it needs
`id = current_setting(...)`. Until that lands, a missed filter on the table
holding every account's email address is exactly the class of bug this whole
effort exists to backstop. It should be its own slice, and it is not optional.

### What actually unlocks isolation

Connect the app as a **dedicated least-privilege role** that owns nothing and
has no `BYPASSRLS`. RLS constrains non-owner roles under plain `ENABLE`, so
once the app runs as that role the existing migration is sufficient and
**`FORCE` is never needed**. That is also the right answer independent of RLS:
an application has no business connecting as the schema owner.

This changes the shape of the work. `FORCE` was per-table and reversible;
switching the connection role activates RLS on **all 43 policied tables at
once**, and an unrouted query does not error — it returns **zero rows**. Keep
the rollout incremental by disabling RLS on the tables that are not routed yet
(a no-op in practice: the app bypasses every one of them today) and re-enabling
per table as its call sites land.

## Why the groundwork is still safe (inert) today

The `20260714140000_enable_rls_permissive` migration only runs `ENABLE ROW
LEVEL SECURITY` (never `FORCE`) and installs policies, so it is a **no-op for
the running app**: every query still sees every row it did before. It cannot
deny-all. (Its header comment explains the inertness by ownership alone; that
was incomplete — `BYPASSRLS` is the binding reason. The migration has been
applied and is left as-is; this document is the current truth.)

Two permissive policies are installed per table (they OR together):

- `*_tenant_isolation`: `"userId" = current_setting('app.current_user_id', true)`
- `*_system_bypass`: `current_setting('app.bypass_rls', true) = 'on'`

Neither carries a `TO <role>` clause, so both apply to every role — including a
future dedicated app role. `current_setting(name, true)` returns NULL when the
GUC is unset, so once RLS binds and neither GUC is set, a table fails closed
(zero rows) — the safe default. `WITH CHECK` defaults to `USING`, so writes are
tenant-scoped too.

## The request-context helpers (`src/db-tenant.ts`)

- `withTenant(userId, tx => …)` — runs in an interactive transaction that sets
  `app.current_user_id` (transaction-local, pooler-safe). Every query inside
  must use the `tx` handle.
- `withSystem(tx => …)` — sets `app.bypass_rls = 'on'` for paths with no single
  owning user (schedulers, webhook ingest, admin fleet queries).

These are wired but inert until the app stops bypassing RLS — setting a GUC
that no policy is consulted for does nothing.

## Remaining steps (each its own PR)

1. **Prereq (founder)**: ✅ **Done — drill run 2026-08-04.** A restore drill you
   have actually run, not just a backup that exists. Production runs on
   **Supabase** (`ap-northeast-2`), whose free tier has no automated backups,
   so the dump and the drill are both manual:
   `docs/launch/db-credential-runbook.md` has the exact commands.

   | 2026-08-04 drill | Result |
   | --- | --- |
   | `pg_dump -Fc` via session pooler | 82 MB, ~2 min |
   | `pg_restore` into a local postgres:17 | 3 ignorable `supabase_vault` errors, application tables intact (`User` = 10 rows) |
   | `prisma migrate status` against the restored DB | `Database schema is up to date!` (110 migrations) |

   The third row is what licenses the rest. A dump that restores but that the
   app then rejects is not a recovery path, and that gap only shows up under
   the pressure of a real incident. Re-run the drill whenever the Postgres
   major version or the connection topology changes.

2. **Route query sites through the helpers**, one domain at a time: replace
   `prisma.*` calls in a domain's handlers with `withTenant`/`withSystem`.
   Still inert, so each PR is behaviour-preserving and reviewable on its own.
   Started: `LearnedRule` (#1012). Remaining: 43 policied tables, several
   hundred call sites — this is the bulk of the work and it is unglamorous.

   ⚠️ **Blocked on a latency decision** — see "Measured cost" below. Per-query
   wrapping adds ~190 ms per query from Singapore, so the shape of this step is
   not settled and routing at scale would bake in the wrong one.

3. **Create the dedicated app role.** ✅ **Done 2026-08-05** — `klorn_app`
   exists and was verified against production (see the probe table above). It
   is not wired into anything yet; `DATABASE_URL` still points at `postgres`,
   so creating it changed no behaviour.

   Recorded for reproduction (e.g. rebuilding from a restored dump):

   ```sql
   CREATE ROLE klorn_app LOGIN PASSWORD '<generated>'
     NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
   GRANT USAGE ON SCHEMA public TO klorn_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO klorn_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO klorn_app;
   -- future tables created by migrations must be reachable too
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO klorn_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO klorn_app;
   ```

   Re-verify after any rebuild — a role that still bypasses RLS buys nothing,
   and it fails silently rather than loudly:

   ```sql
   SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'klorn_app';
   -- both must be false
   ```

   Generate the password so it never passes through a clipboard or a chat
   window; two of them leaked that way while setting this up.

   ```bash
   PW=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
   printf '%s' "$PW" | pbcopy   # straight to the Render field, never to stdout
   ```

   Alphanumeric only, deliberately: `@` and `/` in a password have to be
   percent-encoded inside a connection URL, and a mis-encoded `DATABASE_URL` is
   an outage.

### Measured cost: wrapping is 3.7x, and the API is 4,700 km from the database

Measured 2026-08-05 against the production pooler as `klorn_app`, marginal cost
per query (101 iterations minus 1, so connection setup is excluded):

| | per query |
| --- | --- |
| plain `SELECT` | **11.5 ms** |
| same query inside `withTenant` | **42.1 ms** |

`BEGIN`, `set_config` and `COMMIT` are three extra round trips — the wrapper
costs 2.7 RTT, not a constant. Those numbers are from a laptop ~11 ms from
Seoul. **The API runs on Render in `singapore` while the database is Supabase
`ap-northeast-2` (Seoul)**, roughly 4,700 km apart; `/api/health`, which does
hit the database, answers in ~190 ms from Korea. At a Singapore→Seoul RTT of
~70 ms, the same wrapper costs **≈ +190 ms per query**.

That rules out the obvious implementation. `requireAuth` reads `User` on every
authenticated request (`auth.ts:116`), so wrapping call sites individually adds
~190 ms to *every* request, and a handler issuing five wrapped queries would
add nearly a second. Routing 148 call sites into that shape would produce a
correct system nobody can use.

A tempting shortcut does not work either: collapsing to one round trip with
`SELECT set_config(...), (SELECT … )` measures 11.7 ms — free — but SQL does
not define the evaluation order of a `SELECT` list relative to its subqueries.
It happens to work; it is not guaranteed to. A security boundary must not rest
on undefined evaluation order, and the failure mode when a planner reorders is
silent. Rejected.

What remains, in rough order of leverage:

1. **Co-locate the API with the database.** This is the real finding, and it is
   independent of RLS: every query already pays ~70 ms of geography, so the app
   is slow today for reasons nothing in this document caused. Render offers no
   Seoul region, so this means either moving the API to a provider that does, or
   moving Postgres to Singapore. Largest win available, and it makes the wrapper
   cost ~30 ms instead of ~190 ms.
2. **One transaction per request rather than per query** — a Fastify hook opens
   the tenant context once and handlers use that `tx`. Bounds the cost at one
   wrapper per request instead of one per query. Cost: a request that calls an
   LLM would hold a database transaction for seconds, which on a free-tier
   connection budget is its own outage.
3. **Cache the hot path.** `sessionRevokedForToken` reads one column
   (`sessionsInvalidatedAt`) on every request. A short-TTL in-process cache
   removes that query entirely — worth doing regardless of RLS, since it is
   already ~70 ms on every authenticated request today.

Decide this before routing the remaining call sites. Routing is the expensive,
irreversible-in-effort part, and its shape depends on which of the above wins.

### Hard gate before step 4: `User` is upstream of tenancy itself

`User` is not "one more table to route". Every other policied table is reached
*after* a tenant is resolved; `User` is how the tenant gets resolved. 148
`prisma.user.*` call sites across 39 files are currently unrouted, and the ones
that matter cannot be tenant-scoped even in principle:

| Path | Why no tenant context exists | Failure if unrouted when the role switches |
| --- | --- | --- |
| `routes/auth.ts:377` login, `:1036` Google OAuth | looks a user up *by email* — finding out who they are is the point | `null` for every attempt → **total lockout** |
| `routes/auth.ts:288`,`:300` registration | the new `id` is not knowable before the row exists | duplicate check silently passes, then `INSERT` is **rejected** by `WITH CHECK` |
| `routes/auth.ts:1487` reset, `:1543` verify | looked up by token hash, pre-authentication | every valid token reports "invalid or expired" |
| `auth.ts:189` `requireAdmin` | reads role before trusting the caller | every admin gets 403 |
| `automation-scheduler.ts:628`, `autonomous-agent-scheduler.ts:186`, `mail/github-scheduler.ts:20`, `mail/naver-imap-scheduler.ts:24` | sweeps the whole fleet | `[]` → mail sync and the agent go **silently dark**, no error logged |
| `routes/webhook.ts` (Stripe/Paddle/RevenueCat) | resolves by `stripeId`/`customerId` | billing sync no-ops, and looks identical to "customer not ours" |

These need `withSystem`, not `withTenant`. Which is worth being honest about:
most `User` access is legitimately system-level, so the tenant policy on this
table guards a narrower surface than the other 43 — essentially "read/update my
own profile". It still earns its place, because the bug class this exists to
stop is a query that *should* have been scoped and wasn't, and that query now
returns nothing instead of everyone.

**Route these before step 4, and treat "login still works" as the canary.** An
unrouted `User` does not degrade gracefully; it locks every account out at once,
including the account needed to diagnose it.

4. **Split migration and runtime connections.** `scripts/start.sh` runs
   `prisma migrate deploy` with `DATABASE_URL`, so pointing that at a role
   without DDL rights breaks deploys. Add `directUrl = env("DIRECT_DATABASE_URL")`
   to the datasource: migrations keep using the `postgres` URL, the runtime
   client uses the `klorn_app` one.

   Rotating `DATABASE_URL` on Render has a required order — Suspend first. See
   `docs/launch/db-credential-runbook.md`; skipping it is what caused the
   2026-08-04 outage.

5. **Disable RLS on the tables that are not routed yet**, in the same change
   that switches the role. This looks like undoing work and is not: the app
   bypasses all 43 today, so their RLS state is decorative. Making it explicit
   is what keeps the rollout incremental — otherwise flipping the role arms
   every table simultaneously and every unrouted query silently returns zero
   rows.

6. **Re-enable per table** as its call sites land, lowest-traffic first. Two
   hard gates before widening:
   - **Correctness canary (required)**: an integration test per newly-armed
     table asserting a `withTenant`-scoped query returns the expected rows AND
     the same query on the global `prisma` client returns 0/empty. This is the
     trip-wire for a missed call site — a stray `prisma.*` bulk read/write goes
     **silently dark** (`findMany`→empty, `updateMany`→`{count:0}`, no error;
     only single-record `update`/`delete` throw P2025), so a user could lose
     visibility into their own data with nothing crashing. Catch it in CI, not
     in production.
   - **p95 benchmark**: each tenant-scoped read adds one transaction round-trip.

   Roll a table back instantly with `ALTER TABLE t DISABLE ROW LEVEL SECURITY;`
   (no data change).

7. **Bespoke policies** for the tables the first migration skipped:

   - **`User`** — the important one, and the only one the migration omitted
     without saying so. It has no `userId`; the policy shape is
     `id = current_setting('app.current_user_id', true)`. Leaving it out means
     the table holding every account's email address stays outside the backstop
     that the other 43 get, which inverts the point of the exercise. Confirmed
     readable in full by `klorn_app` on 2026-08-05.
   - `Message` — scoped via `conversationId`, needs a subquery/join policy.
   - `LlmUsageLog` — nullable `userId` for system calls.
   - `WebhookEvent` — global idempotency ledger; likely stays system-only.

## Rollback

Nothing here is destructive. `ALTER TABLE t DISABLE ROW LEVEL SECURITY;` drops
enforcement; `DROP POLICY` removes the rules; pointing `DATABASE_URL` back at
the `postgres` role restores the pre-rollout behaviour wholesale. No data is
touched at any stage.

The one step that is not instantly reversible in practice is the credential
switch itself — not because of RLS, but because rotating a live `DATABASE_URL`
has an ordering hazard that has already taken production down once. Treat step
4 as the risky one, and follow the runbook.
