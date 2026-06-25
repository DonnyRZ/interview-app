#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${BACKUP_DIR}"

PLAIN_FILE="${BACKUP_DIR}/orviko-${TIMESTAMP}.dump"
ENCRYPTED_FILE="${PLAIN_FILE}.enc"

pg_dump "${DATABASE_URL}" --format=custom --no-owner --no-acl --file="${PLAIN_FILE}"
openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "${PLAIN_FILE}" \
  -out "${ENCRYPTED_FILE}" \
  -pass env:BACKUP_ENCRYPTION_PASSWORD
sha256sum "${ENCRYPTED_FILE}" > "${ENCRYPTED_FILE}.sha256"
rm -f "${PLAIN_FILE}"

find "${BACKUP_DIR}" -type f -name 'orviko-*.dump.enc*' -mtime "+${RETENTION_DAYS}" -delete
echo "Encrypted backup created: ${ENCRYPTED_FILE}"
