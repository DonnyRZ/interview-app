import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { env, parseBooleanEnv } from "../src/env.js";
import { createOAuthState, parseOAuthState } from "../src/modules/auth/session.js";
import { parseLynkWebhook } from "../src/modules/payments/lynk.client.js";
import { planCatalog } from "../src/modules/payments/plan-catalog.js";

async function run() {
  assert.equal(planCatalog.mini.grossAmount, env.ORVIKO_MINI_PRICE ?? 29_000);
  assert.equal(planCatalog.starter.grossAmount, env.ORVIKO_STARTER_PRICE ?? 98_000);
  assert.equal(planCatalog.pro.grossAmount, env.ORVIKO_PRO_PRICE ?? 359_000);
  assert.equal(parseBooleanEnv("false"), false);
  assert.equal(parseBooleanEnv(""), false);
  assert.equal(parseBooleanEnv(undefined), false);
  assert.equal(parseBooleanEnv("true"), true);
  assert.equal(parseBooleanEnv(true), true);

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
  assert.equal(lynkPayload.productName, "Orviko Starter");
  assert.equal(lynkPayload.transactionId, "LYNK-TEST-1");
  assert.equal(lynkPayload.amount, 98_000);
  assert.equal(lynkPayload.hasAmount, true);
  assert.equal("plan" in lynkPayload, false);

  const lynkPayloadWithGenericIds = parseLynkWebhook({
    event_name: "Product Sold",
    id: "GENERIC-ROOT-ID",
    customer: {
      id: "CUSTOMER-ID",
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      id: "PRODUCT-ID",
      invoice_id: "PRODUCT-INVOICE-ID",
      name: "Orviko Starter"
    },
    metadata: {
      order_id: "METADATA-ORDER-ID"
    },
    total_amount: 98_000
  });
  assert.equal(lynkPayloadWithGenericIds.transactionId, "");

  const lynkPayloadWithPaymentId = parseLynkWebhook({
    event_name: "Product Sold",
    payment_id: "LYNK-PAYMENT-1",
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(lynkPayloadWithPaymentId.transactionId, "LYNK-PAYMENT-1");

  const lynkPayloadWithNestedTransactionId = parseLynkWebhook({
    event_name: "Product Sold",
    transaction: {
      id: "LYNK-TRANSACTION-1"
    },
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(lynkPayloadWithNestedTransactionId.transactionId, "LYNK-TRANSACTION-1");

  const lynkPayloadWithNestedPaymentId = parseLynkWebhook({
    event_name: "Product Sold",
    payment: {
      id: "LYNK-PAYMENT-NESTED-1"
    },
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(lynkPayloadWithNestedPaymentId.transactionId, "LYNK-PAYMENT-NESTED-1");

  const lynkPayloadWithZeroAmount = parseLynkWebhook({
    event_name: "Product Sold",
    trx_id: "LYNK-ZERO-1",
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Mini"
    },
    total_amount: 0
  });
  assert.equal(lynkPayloadWithZeroAmount.isSuccess, true);
  assert.equal(lynkPayloadWithZeroAmount.amount, 0);
  assert.equal(lynkPayloadWithZeroAmount.hasAmount, true);

  const lynkPayloadWithoutAmount = parseLynkWebhook({
    event_name: "Product Sold",
    trx_id: "LYNK-NO-AMOUNT-1",
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Mini"
    }
  });
  assert.equal(lynkPayloadWithoutAmount.isSuccess, true);
  assert.equal(lynkPayloadWithoutAmount.amount, 0);
  assert.equal(lynkPayloadWithoutAmount.hasAmount, false);

  const lynkPayloadWithBlankAmount = parseLynkWebhook({
    event_name: "Product Sold",
    trx_id: "LYNK-BLANK-AMOUNT-1",
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      name: "Orviko Mini"
    },
    total_amount: ""
  });
  assert.equal(lynkPayloadWithBlankAmount.isSuccess, true);
  assert.equal(lynkPayloadWithBlankAmount.amount, 0);
  assert.equal(lynkPayloadWithBlankAmount.hasAmount, false);

  for (const failedPayload of [
    { event_name: "payment_unsuccessful", status: "failed" },
    { event_name: "Payment", status: "not_successful" },
    { event_name: "Payment", status: "unpaid" },
    { event_name: "Payment", status: "expired" },
    { event_name: "Payment", status: "cancelled" }
  ]) {
    const parsedFailedPayload = parseLynkWebhook({
      ...failedPayload,
      trx_id: "LYNK-FAILED-1",
      customer: {
        email: "Buyer@Example.com",
        name: "Buyer Test"
      },
      product: {
        name: "Orviko Starter"
      },
      total_amount: 98_000
    });
    assert.equal(parsedFailedPayload.isSuccess, false);
  }

  const originalLynkWebhookSecret = env.LYNK_WEBHOOK_SECRET;
  env.LYNK_WEBHOOK_SECRET = "test-lynk-secret";
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

    const lynkWebhookNoSecretResponse = await app.inject({
      method: "POST",
      url: "/payments/lynk/webhook",
      payload: { event_name: "Test URL" }
    });
    assert.equal(lynkWebhookNoSecretResponse.statusCode, 401);

    const lynkWebhookWrongSecretResponse = await app.inject({
      method: "POST",
      url: "/payments/lynk/webhook",
      headers: {
        "x-orviko-lynk-webhook-secret": "wrong-secret"
      },
      payload: { event_name: "Test URL" }
    });
    assert.equal(lynkWebhookWrongSecretResponse.statusCode, 401);

    const lynkWebhookTestResponse = await app.inject({
      method: "POST",
      url: "/payments/lynk/webhook",
      headers: {
        "x-orviko-lynk-webhook-secret": "test-lynk-secret"
      },
      payload: { event_name: "Test URL" }
    });
    assert.equal(lynkWebhookTestResponse.statusCode, 200);
    assert.equal(lynkWebhookTestResponse.json().ok, true);

    const lynkWebhookQueryFallbackResponse = await app.inject({
      method: "POST",
      url: "/payments/lynk/webhook?secret=test-lynk-secret",
      payload: { event_name: "Test URL" }
    });
    assert.equal(lynkWebhookQueryFallbackResponse.statusCode, 200);
    assert.equal(lynkWebhookQueryFallbackResponse.json().ok, true);
  } finally {
    env.LYNK_WEBHOOK_SECRET = originalLynkWebhookSecret;
    await app.close();
  }
}

run().then(() => {
  console.log("auth/payment contract tests passed");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
