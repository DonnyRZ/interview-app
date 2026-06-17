import { env } from "../../env.js";
import type { PlanSlug } from "./plan-catalog.js";

type LynkWebhookPayload = Record<string, unknown>;

const successStatusTokens = new Set([
  "capture",
  "captured",
  "complete",
  "completed",
  "paid",
  "received",
  "settlement",
  "settled",
  "sold",
  "success",
  "successful"
]);

const failureStatusTokens = new Set([
  "cancel",
  "canceled",
  "cancelled",
  "chargeback",
  "deny",
  "denied",
  "expire",
  "expired",
  "fail",
  "failed",
  "failure",
  "notpaid",
  "refund",
  "refunded",
  "unsuccessful",
  "void",
  "voided"
]);

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function tokenizeStatusText(...values: string[]) {
  return values
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean);
}

function hasNegatedSuccessStatus(tokens: string[]) {
  return tokens.some((token, index) => {
    if (!["no", "non", "not", "un"].includes(token)) {
      return false;
    }

    const nextToken = tokens[index + 1];
    return !!nextToken && successStatusTokens.has(nextToken);
  });
}

function isSuccessfulWebhookStatus(eventName: string, status: string) {
  const tokens = tokenizeStatusText(eventName, status);
  if (tokens.some((token) => failureStatusTokens.has(token)) || hasNegatedSuccessStatus(tokens)) {
    return false;
  }

  return tokens.some((token) => successStatusTokens.has(token));
}

function flattenPayload(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const normalizedValue = parseJsonObjectString(nestedValue) ?? nestedValue;
    output[path] = normalizedValue;
    flattenPayload(normalizedValue, path, output);
  }

  return output;
}

function parseJsonObjectString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePayloadPath(path: string) {
  return path.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function withWebhookContainers(paths: string[]) {
  return paths.flatMap((path) => [path, `data.${path}`, `payload.${path}`]);
}

function normalizedFlatPayload(payload: LynkWebhookPayload) {
  const flat = flattenPayload(payload);
  const normalized = new Map<string, unknown>();
  for (const [path, value] of Object.entries(flat)) {
    normalized.set(normalizePayloadPath(path), value);
  }

  return normalized;
}

function firstString(payload: LynkWebhookPayload, allowedPaths: string[]) {
  const flat = normalizedFlatPayload(payload);
  for (const path of allowedPaths) {
    const value = flat.get(normalizePayloadPath(path));
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function parseAmountValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  const amount = Number(digits);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function firstNumber(payload: LynkWebhookPayload, allowedPaths: string[]) {
  const flat = normalizedFlatPayload(payload);
  for (const path of allowedPaths) {
    const value = flat.get(normalizePayloadPath(path));
    const amount = parseAmountValue(value);
    if (amount !== null) {
      return { amount, hasAmount: true };
    }
  }

  return { amount: 0, hasAmount: false };
}

export function getLynkCheckoutUrl(plan: PlanSlug) {
  const planUrls: Record<PlanSlug, string | undefined> = {
    mini: env.LYNK_MINI_URL,
    starter: env.LYNK_STARTER_URL,
    pro: env.LYNK_PRO_URL
  };

  return planUrls[plan] || env.LYNK_PROFILE_URL;
}

export function verifyLynkWebhookSecret(headerSecret: unknown, querySecret?: unknown) {
  if (!env.LYNK_WEBHOOK_SECRET) {
    return env.NODE_ENV !== "production";
  }

  const secret = normalizeText(Array.isArray(headerSecret) ? headerSecret[0] : headerSecret)
    || normalizeText(querySecret);
  return secret === env.LYNK_WEBHOOK_SECRET;
}

export function parseLynkWebhook(payload: LynkWebhookPayload) {
  const eventName = firstString(payload, withWebhookContainers(["event", "event_name", "event.name", "type", "trigger"]));
  const status = firstString(payload, withWebhookContainers(["status", "payment_status", "payment.status", "transaction_status", "transaction.status"]));
  const customerEmail = firstString(payload, withWebhookContainers([
    "email",
    "customer_email",
    "customer.email",
    "buyer_email",
    "buyer.email",
    "message_data.customer.email"
  ])).toLowerCase();
  const customerName = firstString(payload, withWebhookContainers([
    "customer_name",
    "customer.name",
    "buyer_name",
    "buyer.name",
    "full_name",
    "full.name",
    "message_data.customer.name"
  ]));
  const productName = firstString(payload, withWebhookContainers(["product_name", "product.name", "product_title", "product.title", "item_name", "item.name", "title"]));
  const transactionId = firstString(payload, withWebhookContainers([
    "trx_id",
    "transaction_id",
    "transaction.id",
    "transaction.trx_id",
    "payment_id",
    "payment.id",
    "payment.trx_id",
    "order_id",
    "order.id",
    "order.trx_id",
    "invoice_id",
    "invoice.id",
    "invoice.trx_id",
    "message_data.refId"
  ]));
  const parsedAmount = firstNumber(payload, withWebhookContainers([
    "amount",
    "total",
    "total_amount",
    "price",
    "gross_amount",
    "payment.amount",
    "payment.total",
    "payment.total_amount",
    "transaction.amount",
    "transaction.total",
    "transaction.total_amount",
    "order.amount",
    "order.total",
    "order.total_amount",
    "invoice.amount",
    "invoice.total",
    "invoice.total_amount",
    "message_data.totals.grandTotal",
    "message_data.totals.totalPrice",
    "message_data.totals.customerPay"
  ]));
  const isSuccess = isSuccessfulWebhookStatus(eventName, status);

  return {
    eventName,
    status,
    customerEmail,
    customerName,
    productName,
    transactionId,
    amount: parsedAmount.amount,
    hasAmount: parsedAmount.hasAmount,
    isSuccess
  };
}
