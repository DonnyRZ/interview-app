import { randomUUID } from "node:crypto";
import { findUserById } from "../auth/auth.service.js";
import {
  createMidtransSnapTransaction,
  mapMidtransStatus,
  type MidtransNotification,
  verifyMidtransSignature
} from "./midtrans.client.js";
import {
  createPayment,
  findPaymentByOrderId,
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
