#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is required}"
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

BACKUP_FILE="${1:?Usage: restore-drill.sh /path/to/orviko.dump.enc}"
DRILL_DATABASE="orviko_restore_drill_$(date -u +%Y%m%d%H%M%S)"
TEMP_DUMP="$(mktemp)"

cleanup() {
  rm -f "${TEMP_DUMP}"
  psql "${DATABASE_ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DRILL_DATABASE}\" WITH (FORCE);" >/dev/null
}
trap cleanup EXIT

sha256sum --check "${BACKUP_FILE}.sha256"
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "${BACKUP_FILE}" \
  -out "${TEMP_DUMP}" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD

psql "${DATABASE_ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DRILL_DATABASE}\";" >/dev/null
DRILL_URL="${DATABASE_ADMIN_URL%/*}/${DRILL_DATABASE}"
pg_restore --dbname="${DRILL_URL}" --no-owner --no-acl --exit-on-error "${TEMP_DUMP}"

psql "${DRILL_URL}" -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) AS migration_count FROM drizzle.__drizzle_migrations;" >/dev/null
psql "${DRILL_URL}" -v ON_ERROR_STOP=1 -c \
  "SELECT to_regclass('public.users') AS users_table, to_regclass('public.ai_processing_jobs') AS jobs_table;" >/dev/null

echo "Restore drill succeeded for ${BACKUP_FILE}"
