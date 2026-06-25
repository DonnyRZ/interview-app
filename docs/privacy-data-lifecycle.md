# Privacy Data Lifecycle

Phase 5 adds production-oriented privacy controls for account data, uploaded profile documents, meeting-derived text, payment records, and logs.

## Retention

Retention is configured through environment variables:

- `PROFILE_DOCUMENT_RETENTION_DAYS=365`
- `LIVE_TRANSCRIPT_RETENTION_DAYS=180`
- `PAYMENT_EVENT_RETENTION_DAYS=2555`
- `ACCOUNT_DELETION_JOB_RETENTION_DAYS=2555`

Payment and deletion audit retention is intentionally longer because those records support dispute handling, accounting, and abuse investigation.

## Account Export

Endpoint:

```txt
POST /account/export
```

The export includes:

- user profile;
- profile document metadata and AI summaries;
- meeting contexts;
- live meeting session records;
- payment intent/event summaries;
- subscription records;
- usage events and rollups.

Uploaded file bytes are not embedded in the JSON export.

## Account Deletion

Endpoint:

```txt
DELETE /account
```

Deletion behavior:

- creates an `account_deletion_jobs` audit record;
- deletes uploaded profile document files from storage;
- deletes the user row and cascade-owned records;
- revokes the browser session cookie;
- keeps the deletion job audit record with hashed email only.

## Cleanup Job

Run periodically:

```bash
npm.cmd --workspace @interview-app/api run privacy:cleanup
```

The cleanup job:

- deletes expired auth sessions and OAuth states;
- scrubs old live meeting transcripts and summaries;
- removes orphan profile document files;
- removes completed deletion job audit records after retention.

## Upload Validation

Profile document upload currently accepts PDF only.

Validation checks:

- multipart file size limit;
- MIME type;
- PDF magic bytes `%PDF-`.

Malware scanning is not implemented in-repo yet. Production should attach an external scanner before accepting broader file types or higher-risk uploads.

## Logging

Fastify logger redacts sensitive headers and common provider/customer fields:

- `authorization`;
- `cookie`;
- `x-orviko-lynk-webhook-secret`;
- raw payload fields;
- email/customer/provider identifiers.
