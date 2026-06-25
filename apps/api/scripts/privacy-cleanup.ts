import { sql } from "../src/db/client.js";
import { runPrivacyCleanup } from "../src/modules/privacy/privacy-cleanup.service.js";

try {
  const result = await runPrivacyCleanup();
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  await sql.end();
}
