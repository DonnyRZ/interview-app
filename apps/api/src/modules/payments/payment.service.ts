import { randomUUID } from "node:crypto";
import { activateUserSubscription, findUserByEmail, findUserById } from "../auth/auth.service.js";
import { getLynkCheckoutUrl, parseLynkWebhook } from "./lynk.client.js";
import {
  createMidtransSnapTransaction,
  mapMidtransStatus,
  type MidtransNotification,
  verifyMidtransSignature
} from "./midtrans.client.js";
import {
  createPayment,
  findPaymentByOrderId,
  findPaymentByExternalTransactionId,
  findPaymentForUser,
  updatePaymentSnapDetails,
  updatePaymentStatus
} from "./payment.repository.js";
import { planCatalog, planSlugSchema, type PlanSlug } from "./plan-catalog.js";

function buildOrderId(plan: PlanSlug) {
  return `ORVIKO-${plan.toUpperCase()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export async function createMidtransPaymentForUser(input: {
  userId: string;
  plan: string;
}) {
  const parsedPlan = planSlugSchema.safeParse(input.plan);
  if (!parsedPlan.success) {
    throw new Error("Paket yang dipilih tidak valid.");
  }

  const user = await findUserById(input.userId);
  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  const plan = parsedPlan.data;
  const catalogItem = planCatalog[plan];
  const payment = await createPayment({
    userId: input.userId,
    orderId: buildOrderId(plan),
    plan,
    grossAmount: catalogItem.grossAmount
  });

  const midtransPayload = {
    transaction_details: {
      order_id: payment.orderId,
      gross_amount: catalogItem.grossAmount
    },
    item_details: [
      {
        id: plan,
        price: catalogItem.grossAmount,
        quantity: 1,
        name: `Orviko ${catalogItem.name}`
      }
    ],
    customer_details: {
      first_name: user.name || "User Orviko",
      email: user.email
    }
  };

  const snap = await createMidtransSnapTransaction(midtransPayload);
  const updatedPayment = await updatePaymentSnapDetails({
    paymentId: payment.id,
    snapToken: snap.snapToken,
    snapRedirectUrl: snap.redirectUrl
  });

  if (!updatedPayment) {
    throw new Error("Gagal menyimpan transaksi payment.");
  }

  return updatedPayment;
}

export async function createLynkCheckoutForUser(input: {
  userId: string;
  plan: string;
}) {
  const parsedPlan = planSlugSchema.safeParse(input.plan);
  if (!parsedPlan.success) {
    throw new Error("Paket yang dipilih tidak valid.");
  }

  const user = await findUserById(input.userId);
  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  const plan = parsedPlan.data;
  const catalogItem = planCatalog[plan];
  const payment = await createPayment({
    userId: input.userId,
    orderId: buildOrderId(plan),
    plan,
    grossAmount: catalogItem.grossAmount,
    provider: "lynk",
    customerEmail: user.email,
    customerName: user.name || "",
    status: "pending"
  });

  return {
    ...payment,
    lynkRedirectUrl: getLynkCheckoutUrl(plan)
  };
}

export async function getPaymentForUser(userId: string, paymentId: string) {
  return findPaymentForUser(userId, paymentId);
}

export async function handleMidtransNotification(payload: MidtransNotification) {
  if (!verifyMidtransSignature(payload)) {
    throw new Error("Signature Midtrans tidak valid.");
  }

  const orderId = String(payload.order_id || "");
  const payment = await findPaymentByOrderId(orderId);
  if (!payment) {
    throw new Error("Order payment tidak ditemukan.");
  }

  const updatedPayment = await updatePaymentStatus({
    paymentId: payment.id,
    status: mapMidtransStatus(payload),
    midtransTransactionId: String(payload.transaction_id || ""),
    midtransOrderId: orderId,
    rawNotification: payload
  });

  if (!updatedPayment) {
    throw new Error("Gagal memperbarui status payment.");
  }

  return updatedPayment;
}

export async function handleLynkWebhook(payload: Record<string, unknown>) {
  const parsed = parseLynkWebhook(payload);

  if (!parsed.isSuccess) {
    return {
      processed: false,
      reason: "Webhook Lynk diterima, tetapi belum terdeteksi sebagai transaksi sukses.",
      parsed
    };
  }

  if (!parsed.customerEmail) {
    return {
      processed: false,
      reason: "Webhook Lynk sukses diterima, tetapi email customer tidak ditemukan.",
      parsed
    };
  }

  if (!parsed.plan) {
    return {
      processed: false,
      reason: "Webhook Lynk sukses diterima, tetapi paket Orviko tidak bisa dikenali.",
      parsed
    };
  }

  const user = await findUserByEmail(parsed.customerEmail);
  if (!user) {
    return {
      processed: false,
      reason: "Webhook Lynk sukses diterima, tetapi email belum cocok dengan akun Orviko.",
      parsed
    };
  }

  const externalTransactionId = parsed.transactionId || `LYNK-${randomUUID()}`;
  const existingPayment = parsed.transactionId
    ? await findPaymentByExternalTransactionId("lynk", parsed.transactionId)
    : null;

  if (existingPayment?.status === "settlement") {
    return {
      processed: true,
      reason: "Webhook Lynk sudah pernah diproses.",
      payment: existingPayment,
      parsed
    };
  }

  const payment = existingPayment || await createPayment({
    userId: user.id,
    orderId: externalTransactionId,
    plan: parsed.plan,
    grossAmount: parsed.amount || planCatalog[parsed.plan].grossAmount,
    provider: "lynk",
    externalTransactionId,
    customerEmail: parsed.customerEmail,
    customerName: parsed.customerName,
    status: "pending",
    rawNotification: payload
  });

  const updatedPayment = await updatePaymentStatus({
    paymentId: payment.id,
    status: "settlement",
    externalTransactionId,
    customerEmail: parsed.customerEmail,
    customerName: parsed.customerName,
    rawNotification: payload
  });

  const updatedUser = await activateUserSubscription({
    userId: user.id,
    plan: parsed.plan,
    durationDays: 30
  });

  return {
    processed: true,
    reason: "Subscription Orviko berhasil diaktifkan dari webhook Lynk.",
    payment: updatedPayment || payment,
    subscription: {
      plan: updatedUser.subscriptionPlan,
      expiresAt: updatedUser.subscriptionExpiresAt?.toISOString() || null
    },
    parsed
  };
}
