import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { env, parseBooleanEnv } from "../src/env.js";
import { parseLynkWebhook } from "../src/modules/payments/lynk.client.js";
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

  const lynkPayload = parseLynkWebhook({
    event_id: "EVENT-TEST-1",
    event_name: "Product Sold",
    trx_id: "LYNK-TEST-1",
    merchant_order_id: "ORVIKO-STARTER-TEST",
    customer: {
      email: "Buyer@Example.com",
      name: "Buyer Test"
    },
    product: {
      id: "lynk-starter",
      name: "Orviko Starter"
    },
    total_amount: 98_000,
    currency: "idr"
  });
  assert.equal(lynkPayload.isSuccess, true);
  assert.equal(lynkPayload.customerEmail, "buyer@example.com");
  assert.equal(lynkPayload.productName, "Orviko Starter");
  assert.equal(lynkPayload.transactionId, "LYNK-TEST-1");
  assert.equal(lynkPayload.amount, 98_000);
  assert.equal(lynkPayload.hasAmount, true);
  assert.equal(lynkPayload.currency, "IDR");
  assert.equal(lynkPayload.providerOrderId, "ORVIKO-STARTER-TEST");
  assert.equal(lynkPayload.productId, "lynk-starter");
  assert.equal(lynkPayload.eventType, "paid");
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
      id: "lynk-starter",
      name: "Orviko Starter"
    },
    total_amount: 98_000,
    currency: "idr"
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
      id: "lynk-starter",
      name: "Orviko Starter"
    },
    total_amount: 98_000,
    currency: "idr"
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

  const lynkPaymentReceivedPayload = parseLynkWebhook({
    event_name: "payment.received",
    data: {
      trx_id: "LYNK-DATA-1",
      customer: {
        email: "Buyer@Example.com",
        name: "Buyer Test"
      },
      product: {
        name: "Orviko Mini"
      },
      total_amount: 0
    }
  });
  assert.equal(lynkPaymentReceivedPayload.isSuccess, true);
  assert.equal(lynkPaymentReceivedPayload.customerEmail, "buyer@example.com");
  assert.equal(lynkPaymentReceivedPayload.transactionId, "LYNK-DATA-1");
  assert.equal(lynkPaymentReceivedPayload.amount, 0);
  assert.equal(lynkPaymentReceivedPayload.hasAmount, true);

  const lynkJsonDataPayload = parseLynkWebhook({
    event_name: "payment.received",
    data: JSON.stringify({
      payment_id: "LYNK-JSON-DATA-1",
      customer_email: "Buyer@Example.com",
      total_amount: 0
    })
  });
  assert.equal(lynkJsonDataPayload.isSuccess, true);
  assert.equal(lynkJsonDataPayload.customerEmail, "buyer@example.com");
  assert.equal(lynkJsonDataPayload.transactionId, "LYNK-JSON-DATA-1");
  assert.equal(lynkJsonDataPayload.amount, 0);
  assert.equal(lynkJsonDataPayload.hasAmount, true);

  const lynkRealWebhookShape = parseLynkWebhook({
    event: "payment.received",
    data: {
      message_action: "payment.received",
      message_code: "payment.received",
      message_data: {
        createdAt: "2026-06-17T07:00:00.000Z",
        customer: {
          email: "Buyer@Example.com",
          name: "Buyer Test",
          phone: ""
        },
        items: [],
        refId: "LYNK-REF-1",
        shippingAddress: "",
        shippingInfo: "",
        totals: {
          affiliate: 0,
          convenienceFee: 0,
          customerPay: 0,
          discount: 0,
          grandTotal: 0,
          totalAddon: 0,
          totalItem: 1,
          totalPrice: 0,
          totalShipping: 0
        },
        voucherCode: "",
        voucherQuantity: ""
      },
      message_desc: "Payment received",
      message_id: "MESSAGE-ID-1",
      message_title: "Payment received"
    }
  });
  assert.equal(lynkRealWebhookShape.isSuccess, true);
  assert.equal(lynkRealWebhookShape.customerEmail, "buyer@example.com");
  assert.equal(lynkRealWebhookShape.customerName, "Buyer Test");
  assert.equal(lynkRealWebhookShape.transactionId, "LYNK-REF-1");
  assert.equal(lynkRealWebhookShape.amount, 0);
  assert.equal(lynkRealWebhookShape.hasAmount, true);

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

    const removedDevelopmentBypassResponse = await app.inject({
      method: "GET",
      url: "/profile-documents/list",
      headers: {
        origin: "http://127.0.0.1:5175",
        "x-orviko-local-testing": "web-app"
      }
    });
    assert.equal(removedDevelopmentBypassResponse.statusCode, 401);

    const allowedCorsResponse = await app.inject({
      method: "OPTIONS",
      url: "/auth/me",
      headers: {
        origin: "http://127.0.0.1:5175",
        "access-control-request-method": "GET"
      }
    });
    assert.equal(allowedCorsResponse.headers["access-control-allow-origin"], "http://127.0.0.1:5175");
    assert.equal(allowedCorsResponse.headers["access-control-allow-credentials"], "true");

    const rejectedCorsResponse = await app.inject({
      method: "OPTIONS",
      url: "/auth/me",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "GET"
      }
    });
    assert.equal(rejectedCorsResponse.headers["access-control-allow-origin"], undefined);

    const invalidPlanResponse = await app.inject({
      method: "GET",
      url: "/auth/google/login?plan=enterprise"
    });
    assert.equal(invalidPlanResponse.statusCode, 400);

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
    assert.equal(lynkWebhookQueryFallbackResponse.statusCode, 401);
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
