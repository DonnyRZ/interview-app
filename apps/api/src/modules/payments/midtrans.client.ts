import { createHash } from "node:crypto";
import { env } from "../../env.js";

type MidtransSnapResponse = {
  token?: string;
  redirect_url?: string;
};

export type MidtransNotification = {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  transaction_id?: string;
};

export function midtransBaseUrl() {
  return env.MIDTRANS_IS_PRODUCTION || env.MIDTRANS_ENV === "production"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

function authHeaders() {
  if (!env.MIDTRANS_SERVER_KEY) {
    throw new Error("Midtrans server key belum dikonfigurasi.");
  }

  const encoded = Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString("base64");
  return {
    "Authorization": `Basic ${encoded}`,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
}

export async function createMidtransSnapTransaction(payload: unknown) {
  const response = await fetch(`${midtransBaseUrl()}/snap/v1/transactions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body ? ` Detail Midtrans: ${body.slice(0, 500)}` : "";
    throw new Error(`Gagal membuat transaksi Midtrans (${response.status}).${detail}`);
  }

  const data = await response.json() as MidtransSnapResponse;
  if (!data.token || !data.redirect_url) {
    throw new Error("Respons Midtrans tidak lengkap.");
  }

  return {
    snapToken: data.token,
    redirectUrl: data.redirect_url
  };
}

export function verifyMidtransSignature(payload: MidtransNotification) {
  if (!env.MIDTRANS_SERVER_KEY) {
    return false;
  }

  const orderId = String(payload.order_id || "");
  const statusCode = String(payload.status_code || "");
  const grossAmount = String(payload.gross_amount || "");
  const signatureKey = String(payload.signature_key || "");

  if (!orderId || !statusCode || !grossAmount || !signatureKey) {
    return false;
  }

  const expected = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.MIDTRANS_SERVER_KEY}`)
    .digest("hex");
  return signatureKey === expected;
}

export function mapMidtransStatus(payload: MidtransNotification) {
  const transactionStatus = String(payload.transaction_status || "").toLowerCase();
  const fraudStatus = String(payload.fraud_status || "").toLowerCase();

  if (transactionStatus === "capture") {
    return fraudStatus === "challenge" ? "capture" : "settlement";
  }

  if (["settlement", "pending", "deny", "cancel", "expire", "failure"].includes(transactionStatus)) {
    return transactionStatus;
  }

  return transactionStatus || "unknown";
}
