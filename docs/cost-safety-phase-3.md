# Phase 3 Cost Safety

Phase 3 introduces production-style guardrails before realtime usage is opened broadly.

## Source of truth

`apps/api/src/modules/payments/plan-catalog.ts` is the backend source of truth for plan prices and live-session quota.

- Mini: 3 live sessions per period.
- Starter: 12 live sessions per period.
- Pro: fair-use 60 live sessions per period.

No plan is treated as unlimited in backend enforcement.

## Entitlement gates

The following paid AI paths require an active subscription:

- profile document upload and retry processing;
- meeting context create and update;
- live meeting start;
- realtime client secret creation;
- dev-only meeting help endpoints.

Unauthenticated requests return `401`. Authenticated users without active entitlement return `403`.

## Rate limits

The API uses an in-process rate limiter for the current single-instance VPS shape.

- `RATE_LIMIT_WINDOW_SECONDS`
- `RATE_LIMIT_MAX_REQUESTS`
- `AI_RATE_LIMIT_MAX_REQUESTS`
- `PAYMENT_RATE_LIMIT_MAX_REQUESTS`

Responses use `429` with `Retry-After` and `retryAfterSeconds`.

If the API is scaled to multiple instances, this limiter must move to a shared store before production traffic is split.

## Realtime cost caps

Live meeting sessions are constrained by:

- `MAX_CONCURRENT_LIVE_MEETINGS`
- `MAX_LIVE_MEETING_MINUTES`
- `REALTIME_CLIENT_SECRET_LIMIT_PER_SESSION`

The backend rejects new realtime client secrets when a session is ended, expired, owned by another user, or has exceeded its secret issuance limit.

## OpenAI request safety

Responses API calls use:

- `store: false`
- `safety_identifier`
- `OPENAI_KILL_SWITCH`

OpenAI pricing is configurable through env variables so provider price changes do not require a code deploy:

- `OPENAI_TEXT_INPUT_USD_PER_1M`
- `OPENAI_TEXT_OUTPUT_USD_PER_1M`
- `OPENAI_REALTIME_TEXT_INPUT_USD_PER_1M`
- `OPENAI_REALTIME_TEXT_OUTPUT_USD_PER_1M`
- `OPENAI_REALTIME_AUDIO_INPUT_USD_PER_1M`
- `OPENAI_REALTIME_AUDIO_OUTPUT_USD_PER_1M`

## Usage ledger

`usage_events` stores per-request telemetry:

- user;
- optional live meeting session;
- capability;
- provider and model;
- text/audio token counts;
- duration;
- estimated cost;
- request status.

`usage_rollups` stores daily user/capability rollups for operational checks and cost dashboards.

Provider dashboard budget alerts still need to be configured outside this repo before production launch.
