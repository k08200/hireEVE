# Rotating the database password (and backing it up)

Written after the 2026-08-04 outage, which was caused entirely by doing this
in the wrong order. Production was down for roughly 40 minutes. Following the
order below makes the same rotation a ~5 minute, no-downtime operation.

Production database: **Supabase**, region `ap-northeast-2`, project ref
`wqqjldncizvmandepobc`. The app connects through the **session pooler**
(port 5432), which is the mode Prisma migrations need.

## Why order matters

Render does not kill the running container until a replacement is healthy.
So if you change the password in Supabase *first*:

1. The old container keeps its old `DATABASE_URL` and keeps calling the
   database — the schedulers alone do this every 30–60s.
2. Every one of those calls is now an authentication failure.
3. Supabase's pooler arms a circuit breaker and refuses **all** new
   connections, including correctly-credentialed ones.
4. The replacement container therefore cannot start.
5. Render keeps the old container alive — go to 1.

A restart does not break this loop, because the old container is the thing
poisoning the gate. Only stopping it does.

(The app now rides out a short breaker window on its own — `withDbRetry`
treats `ECIRCUITBREAKER` as retryable since #1005 — but do not lean on that.
Following this order means the breaker never arms.)

## Rotating the password

1. **Render → `klorn-api` → Settings → Suspend Web Service.**
   This stops the old container, so nothing is holding the stale credential.
2. **Supabase → Settings → Database → Reset database password.**
   Copy the new password immediately — it is not viewable again.
3. **Render → `klorn-api` → Environment → `DATABASE_URL`.**
   Replace **only** the password (between `:` and `@`). Leave the username
   `postgres.<project-ref>` alone — the project ref suffix is required by the
   pooler. Save.
4. **Render → Settings → Resume Web Service.**
5. Verify: open `https://api.klorn.ai/api/health`. You want
   `"db":"connected"` **and a small `uptime`** — a large uptime means you are
   still talking to the old container and nothing was replaced.

## Backup

Supabase's free tier has no automated backups, so this is manual until the
plan changes. Use the **direct connection** (`db.<ref>.supabase.co`), not the
pooler — dumps through a pooler are unreliable.

```bash
export PROD_URL="postgresql://postgres:<password>@db.wqqjldncizvmandepobc.supabase.co:5432/postgres?sslmode=require"
pg_dump "$PROD_URL" -Fc -f "klorn-$(date +%Y%m%d).dump"
ls -lh klorn-*.dump      # a zero-byte file means it failed
```

## Restore drill

A dump you have never restored is not a backup. Restore into a throwaway
local database — production is untouched:

```bash
docker run -d --name klorn-restore -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:16
sleep 8
createdb -h localhost -p 5433 -U postgres klorn_restore
pg_restore -h localhost -p 5433 -U postgres -d klorn_restore --no-owner klorn-*.dump

export DRILL_URL="postgresql://postgres:x@localhost:5433/klorn_restore"
psql "$DRILL_URL" -c 'SELECT count(*) FROM "User";'
cd packages/api && DATABASE_URL="$DRILL_URL" npx prisma migrate status
docker rm -f klorn-restore
```

The last command is the point of the exercise. "The dump exists" and "the app
boots on it" are different claims, and it is the second one that fails during
a real incident.

Record the result — the date, how long it took end to end, and the row counts
— in `docs/rls-rollout.md`'s prerequisite section. A drill nobody wrote down
gets re-argued the next time someone asks whether restores work.

## If the app will not start

Since #1005 the startup path prints its cause before exiting; look for
`[STARTUP] fatal: server did not start —` in the Render logs. Before that
change the process discarded the error and exited silently, which is why the
2026-08-04 outage took half an hour to diagnose. If you ever see a bare
`Exited with status 1` with no preceding line, that logging has regressed.
