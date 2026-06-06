import { env } from "../../env.js";
import { planCatalog, planSlugSchema, type PlanSlug } from "./plan-catalog.js";

type LynkWebhookPayload = Record<string, unknown>;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function flattenPayload(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return output;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    output[path] = nestedValue;
    flattenPayload(nestedValue, path, output);
  }

  return output;
}

function firstString(payload: LynkWebhookPayload, keys: string[]) {
  const flat = flattenPayload(payload);
  for (const [path, value] of Object.entries(flat)) {
    const normalizedPath = path.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!keys.some((key) => normalizedPath.endsWith(key))) {
      continue;
    }

    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function firstNumber(payload: LynkWebhookPayload, keys: string[]) {
  const flat = flattenPayload(payload);
  for (const [path, value] of Object.entries(flat)) {
    const normalizedPath = path.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!keys.some((key) => normalizedPath.endsWith(key))) {
      continue;
    }

    const amount = typeof value === "number" ? value : Number(String(value).replace(/[^\d]/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }

  return 0;
}

function planFromProductName(productName: string) {
  const normalized = productName.toLowerCase();
  for (const plan of planSlugSchema.options) {
    if (normalized.includes(plan)) {
      return plan;
    }
  }

  return null;
}

function planFromAmount(amount: number) {
  const match = planSlugSchema.options.find((plan) => planCatalog[plan].grossAmount === amount);
  return match || null;
}

export function getLynkCheckoutUrl(plan: PlanSlug) {
  const planUrls: Record<PlanSlug, string | undefined> = {
    mini: env.LYNK_MINI_URL,
    starter: env.LYNK_STARTER_URL,
    pro: env.LYNK_PRO_URL
  };

  return planUrls[plan] || env.LYNK_PROFILE_URL;
}

export function verifyLynkWebhookSecret(secret: unknown) {
  if (!env.LYNK_WEBHOOK_SECRET) {
    return true;
  }

  return normalizeText(secret) === env.LYNK_WEBHOOK_SECRET;
}

export function parseLynkWebhook(payload: LynkWebhookPayload) {
  const eventName = firstString(payload, ["event", "eventname", "type", "trigger"]);
  const status = firstString(payload, ["status", "paymentstatus", "transactionstatus"]);
  const customerEmail = firstString(payload, ["email", "customeremail", "buyeremail"]).toLowerCase();
  const customerName = firstString(payload, ["customername", "buyername", "fullname"]);
  const productName = firstString(payload, ["productname", "producttitle", "itemname", "title"]);
  const transactionId = firstString(payload, ["trxid", "transactionid", "orderid", "invoiceid", "id"]);
  const amount = firstNumber(payload, ["amount", "total", "totalamount", "price", "grossamount"]);
  const plan = planFromProductName(productName) || planFromAmount(amount);
  const successText = `${eventName} ${status}`.toLowerCase();
  const isSuccess = ["sold", "success", "settlement", "paid", "completed"].some((keyword) => successText.includes(keyword));

  return {
    eventName,
    status,
    customerEmail,
    customerName,
    productName,
    transactionId,
    amount,
    plan,
    isSuccess
  };
}
