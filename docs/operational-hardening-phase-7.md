# Phase 7 — Database, API, and Operational Hardening

## Implemented

- `user_profiles.user_id` is unique.
- Live-meeting usage rows have a nullable foreign key to their meeting session. Session deletion sets the reference to null so billing/quota history remains durable.
- Profile preprocessing is persisted in `ai_processing_jobs`.
- Workers claim jobs with `FOR UPDATE SKIP LOCKED`, active-job deduplication, bounded retries, exponential backoff, and stale-lock recovery.
- List APIs accept bounded `limit` and `offset`.
- User-controlled meeting text has explicit maximum lengths.
- `/health` is liveness-only; `/ready` checks database, writable storage, and required AI configuration.
- `/internal/metrics` is hidden unless a valid operations bearer token is supplied.
- API responses include CSP, HSTS in production, frame, referrer, content-type, and permissions headers.
- Unhandled errors are logged internally and returned to clients as sanitized messages.
- CI runs migrations, contracts, typecheck, and production builds against PostgreSQL 16.

## Runtime processes

Run API and durable worker as separate systemd services:

```bash
npm --workspace @interview-app/api run start
npm --workspace @interview-app/api run jobs:work
```

The worker may be restarted safely. Queued jobs remain in PostgreSQL and stale running locks are reclaimed after 15 minutes.

## Least-privilege database user

Run `ops/sql/create-app-role.sql` as the database owner and use `orviko_app` in production `DATABASE_URL`.
The migration command should use a separate owner/migrator credential. Production startup rejects the default `postgres` role.

## Backup and restore

Required environment:

```bash
export DATABASE_URL='postgres://orviko_app:...@127.0.0.1/orviko_prod'
export DATABASE_ADMIN_URL='postgres://orviko_migrator:...@127.0.0.1/postgres'
export BACKUP_ENCRYPTION_PASSWORD='from-secret-manager'
export BACKUP_DIR='/srv/orviko/prod/backups'
```

Create encrypted backup:

```bash
bash ops/backup-postgres.sh
```

Perform restore drill:

```bash
bash ops/restore-drill.sh /srv/orviko/prod/backups/orviko-YYYYMMDDTHHMMSSZ.dump.enc
```

Schedule daily backups and a monthly restore drill. Alert if no recent backup, `/ready` fails, `stuckJobs > 0`, or `failedJobs24h > 0`.

## Deployment rollback

Before production migration:

1. create and verify an encrypted backup;
2. record the currently deployed Git SHA;
3. build and migrate the new release;
4. restart API and worker;
5. require `/ready` HTTP 200;
6. if readiness fails, restore the previous release SHA;
7. if migration is not backward compatible, restore the verified backup before reopening traffic.

Database migrations should be backward-compatible whenever possible. Destructive cleanup belongs in a later release after the new code has been stable.
