#!/bin/sh
# Production start script.
# 1. Run prisma migrate deploy.
# 2. If the database was previously managed by `db push`, only baseline when the
#    live schema already matches the checked-in Prisma schema.
# 3. Exec the API server.
set -e

cd "$(dirname "$0")/.."

if ! npx prisma migrate deploy; then
  echo "[start.sh] migrate deploy failed; checking whether existing schema can be baselined..."

  if ! npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --exit-code; then
    echo "[start.sh] live database schema differs from prisma/schema.prisma; refusing to baseline."
    exit 1
  fi

  echo "[start.sh] live schema matches prisma/schema.prisma; baselining checked-in migrations..."
  for migration in prisma/migrations/*/; do
    name=$(basename "$migration")
    npx prisma migrate resolve --applied "$name" 2>/dev/null || true
  done
  echo "[start.sh] retrying migrate deploy..."
  npx prisma migrate deploy
fi

exec node dist/index.js
