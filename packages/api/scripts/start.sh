#!/bin/sh
# Production start script.
# 1. Run prisma migrate deploy with cold-start retry (Neon free tier suspends
#    the compute after ~5 min idle, so the first connection on a fresh
#    container often fails before wake-up completes).
# 2. If the database was previously managed by `db push`, only baseline when
#    the live schema already matches the checked-in Prisma schema.
# 3. Exec the API server.
set -e

cd "$(dirname "$0")/.."

deploy_with_retry() {
  attempt=1
  max_attempts=6
  delay=2
  while [ $attempt -le $max_attempts ]; do
    if npx prisma migrate deploy; then
      return 0
    fi
    if [ $attempt -eq $max_attempts ]; then
      return 1
    fi
    echo "[start.sh] migrate deploy attempt $attempt/$max_attempts failed; retrying in ${delay}s..."
    sleep $delay
    delay=$((delay * 2))
    attempt=$((attempt + 1))
  done
}

schema_matches_with_retry() {
  attempt=1
  max_attempts=6
  delay=2
  while [ $attempt -le $max_attempts ]; do
    if npx prisma migrate diff \
      --from-url "$DATABASE_URL" \
      --to-schema-datamodel prisma/schema.prisma \
      --exit-code; then
      return 0
    else
      code=$?
      # Prisma --exit-code: 0 = empty diff, 1 = error, 2 = non-empty diff.
      if [ "$code" -eq 2 ]; then
        return 1
      fi
      if [ $attempt -eq $max_attempts ]; then
        return 2
      fi
      echo "[start.sh] migrate diff attempt $attempt/$max_attempts errored; retrying in ${delay}s..."
      sleep $delay
      delay=$((delay * 2))
      attempt=$((attempt + 1))
    fi
  done
  return 2
}

if ! deploy_with_retry; then
  echo "[start.sh] migrate deploy failed after retries; checking whether existing schema can be baselined..."

  if schema_matches_with_retry; then
    echo "[start.sh] live schema matches prisma/schema.prisma; baselining checked-in migrations..."
  else
    diff_code=$?
    if [ "$diff_code" -eq 1 ]; then
      echo "[start.sh] live database schema differs from prisma/schema.prisma; refusing to baseline."
      exit 1
    fi
    echo "[start.sh] migrate diff failed after retries; refusing to baseline without schema proof."
    exit 1
  fi

  for migration in prisma/migrations/*/; do
    name=$(basename "$migration")
    npx prisma migrate resolve --applied "$name" 2>/dev/null || true
  done
  echo "[start.sh] retrying migrate deploy..."
  deploy_with_retry || exit 1
fi

exec node dist/index.js
