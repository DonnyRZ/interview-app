# Web App Production Route

The official Orviko Web App route is `/app/`.

## Build contract

`apps/web-app/vite.config.ts` uses:

```ts
base: "/app/"
```

Production build output must reference assets as `/app/assets/...`.

The AudioWorklet file must be available at:

```txt
/app/audio/pcm16-processor.js
```

## Environment

Local development must not default to the shared dev API.

```env
VITE_WEB_APP_API_BASE_URL=http://127.0.0.1:4000
```

Dev VPS:

```env
VITE_WEB_APP_API_BASE_URL=https://dev.orviko.net
```

Production VPS:

```env
VITE_WEB_APP_API_BASE_URL=https://orviko.net
```

## Nginx

The landing page remains mounted at `/`.

The Web App must be served from `apps/web-app/dist` at `/app/` with SPA fallback:

```nginx
location ^~ /app/assets/ {
  alias /srv/orviko/prod/app/apps/web-app/dist/assets/;
  add_header Cache-Control "public, max-age=31536000, immutable";
  try_files $uri =404;
}

location ^~ /app/audio/ {
  alias /srv/orviko/prod/app/apps/web-app/dist/audio/;
  add_header Cache-Control "public, max-age=86400";
  try_files $uri =404;
}

location ^~ /app/ {
  alias /srv/orviko/prod/app/apps/web-app/dist/;
  add_header Cache-Control "no-store";
  try_files $uri $uri/ /app/index.html;
}
```

Use the matching `/srv/orviko/dev/...` path for dev.

## Verification

Run after build:

```bash
npm.cmd --workspace @interview-app/web-app run test:app-base
```

Deployment smoke checks:

```bash
curl -I https://orviko.net/app/
curl -I https://orviko.net/app/audio/pcm16-processor.js
curl -I https://orviko.net/app/assets/orviko-logo.png
```

Expected:

- `/app/` serves Web App HTML, not landing page HTML.
- `/app/audio/pcm16-processor.js` returns JavaScript.
- `/app/assets/...` returns static assets with cache headers.
- Refreshing a deep link under `/app/` does not return `404`.
