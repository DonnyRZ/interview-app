import assert from "node:assert/strict";

process.env.RATE_LIMIT_WINDOW_SECONDS = "60";
process.env.RATE_LIMIT_MAX_REQUESTS = "100";
process.env.AI_RATE_LIMIT_MAX_REQUESTS = "100";
process.env.PAYMENT_RATE_LIMIT_MAX_REQUESTS = "2";
process.env.OPENAI_API_KEY = "";

const { buildApp } = await import("../src/app.js");
const { planCatalog } = await import("../src/modules/payments/plan-catalog.js");

async function run() {
  assert.equal(planCatalog.pro.liveSessionLimit, 60);
  assert.match(planCatalog.pro.sessionLimit, /Fair-use/);

  const app = buildApp();
  try {
    const first = await app.inject({ method: "GET", url: "/payments/pay_test" });
    const second = await app.inject({ method: "GET", url: "/payments/pay_test" });
    const third = await app.inject({ method: "GET", url: "/payments/pay_test" });

    assert.equal(first.statusCode, 401);
    assert.equal(second.statusCode, 401);
    assert.equal(third.statusCode, 429);
    assert.equal(typeof third.json().retryAfterSeconds, "number");
    assert.ok(Number(third.headers["retry-after"]) >= 1);
  } finally {
    await app.close();
  }

  console.log("[ok] cost safety contract checks passed");
}

await run();
