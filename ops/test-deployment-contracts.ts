import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const environments = [
  {
    file: "nginx/orviko.net.conf",
    domain: "orviko.net",
    root: "/srv/orviko/prod/",
    port: "4000"
  },
  {
    file: "nginx/dev.orviko.net.conf",
    domain: "dev.orviko.net",
    root: "/srv/orviko/dev/",
    port: "4001"
  }
];

for (const environment of environments) {
  const source = await readFile(new URL(environment.file, import.meta.url), "utf8");
  assert.match(source, new RegExp(`server_name [^;]*${environment.domain.replaceAll(".", "\\.")}`));
  assert.match(source, /return 308 https:\/\/\$host\$request_uri/);
  assert.match(source, /listen 443 ssl http2/);
  assert.match(source, new RegExp(`/etc/letsencrypt/live/${environment.domain.replaceAll(".", "\\.")}/fullchain\\.pem`));
  assert.match(source, new RegExp(`alias ${environment.root}app/apps/web-app/dist/`));
  assert.match(source, /location = \/app[\s\S]*return 308 \/app\//);
  assert.match(source, /location \^~ \/app\/assets\//);
  assert.match(source, /location \^~ \/app\/audio\//);
  assert.match(source, /try_files \$uri \$uri\/ \/app\/index\.html/);
  assert.match(source, new RegExp(`proxy_pass http://127\\.0\\.0\\.1:${environment.port}`));
  for (const route of ["auth", "account", "payments", "profile-documents", "meeting-contexts", "live-meetings"]) {
    assert.match(source, new RegExp(route));
  }
  assert.match(source, /location = \/health/);
  assert.match(source, /location = \/ready/);
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /X-Frame-Options/);
  assert.match(source, /Strict-Transport-Security/);
  assert.match(source, /Content-Security-Policy/);
  assert.doesNotMatch(source, /try_files \$request_filename/);
}

console.log("Deployment configuration contracts passed.");
