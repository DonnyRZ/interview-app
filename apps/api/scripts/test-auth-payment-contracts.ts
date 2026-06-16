import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildApp } from "../src/app.js";
import { env, parseBooleanEnv } from "../src/env.js";
import { createOAuthState, parseOAuthState } from "../src/modules/auth/session.js";
import { parseLynkWebhook } from "../src/modules/payments/lynk.client.js";
import { midtransBaseUrl, verifyMidtransSignature } from "../src/modules/payments/midtrans.client.js";
import { planCatalog } from "../src/modules/payments/plan-catalog.js";

async function run() {
  assert.equal(planCatalog.mini.grossAmount, 29_000);
  assert.equal(planCatalog.starter.grossAmount, 98_000);
  assert.equal(planCatalog.pro.grossAmount, 359_000);
  assert.equal(parseBooleanEnv("false"), false);
  assert.equal(parseBooleanEnv(""), false);
  assert.equal(parseBooleanEnv(undefined), false);
  assert.equal(parseBooleanEnv("true"), true);
  assert.equal(parseBooleanEnv(true), true);

  if (env.MIDTRANS_ENV === "sandbox" && !env.MIDTRANS_IS_PRODUCTION) {
    assert.equal(midtransBaseUrl(), "https://app.sandbox.midtrans.com");
  }

  const state = createOAuthState("starter");
  assert.equal(parseOAuthState(state)?.plan, "starter");
  assert.equal(parseOAuthState(`${state.slice(0, -1)}x`), null);
  const desktopState = createOAuthState("starter", "desktop");
  assert.equal(parseOAuthState(desktopState)?.flow, "desktop");

  const lynkPayload = parseLynkWebhook({
    event_name: "Product Sold",
    trx_id: "LYNK-TEST-1",
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(lynkPayload.isSuccess, true);
  assert.equal(lynkPayload.customerEmail, "buyer@example.com");
  assert.equal(lynkPayload.plan, "starter");

  assert.equal(verifyMidtransSignature({
    order_id: "ORVIKO-TEST",
    status_code: "200",
    gross_amount: "98000",
    signature_key: "invalid"
  }), false);

  if (env.MIDTRANS_SERVER_KEY) {
    const signature = createHash("sha512")
      .update(`ORVIKO-TEST20098000${env.MIDTRANS_SERVER_KEY}`)
      .digest("hex");
    assert.equal(verifyMidtransSignature({
      order_id: "ORVIKO-TEST",
      status_code: "200",
      gross_amount: "98000",
      signature_key: signature
    }), true);
  }

  const app = buildApp();
  try {
    const meResponse = await app.inject({
      method: "GET",
      url: "/auth/me"
    });
    assert.equal(meResponse.statusCode, 401);

    const invalidPlanResponse = await app.inject({
      method: "GET",
      url: "/auth/google/login?plan=enterprise"
    });
    assert.equal(invalidPlanResponse.statusCode, 400);

    const invalidDesktopExchangeResponse = await app.inject({
      method: "POST",
      url: "/auth/desktop/exchange",
      payload: { token: "invalid" }
    });
    assert.equal(invalidDesktopExchangeResponse.statusCode, 401);

    const paymentResponse = await app.inject({
      method: "POST",
      url: "/payments/midtrans/create",
      payload: { plan: "starter" }
    });
    assert.equal(paymentResponse.statusCode, 401);

    const lynkWebhookTestResponse = await app.inject({
      method: "POST",
      url: "/payments/lynk/webhook",
      payload: { event_name: "Test URL" }
    });
    assert.equal(lynkWebhookTestResponse.statusCode, 200);
    assert.equal(lynkWebhookTestResponse.json().ok, true);
  } finally {
    await app.close();
  }
}

run().then(() => {
  console.log("auth/payment contract tests passed");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
