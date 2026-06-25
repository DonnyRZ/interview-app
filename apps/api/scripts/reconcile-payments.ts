import { sql } from "../src/db/client.js";
import { reconcilePaymentState } from "../src/modules/payments/subscription.service.js";

try {
  const result = await reconcilePaymentState();
  console.log(JSON.stringify(result));
} finally {
  await sql.end();
}
