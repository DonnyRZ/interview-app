import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments } from "../../db/schema/index.js";
import type { PlanSlug } from "./plan-catalog.js";

export async function createPayment(input: {
  userId: string;
  orderId: string;
  plan: PlanSlug;
  grossAmount: number;
  provider?: "midtrans" | "lynk";
  externalTransactionId?: string;
  customerEmail?: string;
  customerName?: string;
  status?: string;
  rawNotification?: unknown;
}) {
  const [payment] = await db.insert(payments).values({
    userId: input.userId,
    orderId: input.orderId,
    plan: input.plan,
    grossAmount: input.grossAmount,
    provider: input.provider || "midtrans",
    externalTransactionId: input.externalTransactionId || "",
    customerEmail: input.customerEmail || "",
    customerName: input.customerName || "",
    status: input.status || "created",
    rawNotification: input.rawNotification || {}
  }).returning();

  if (!payment) {
    throw new Error("Gagal membuat payment.");
  }

  return payment;
}

export async function findPaymentForUser(userId: string, paymentId: string) {
  return db.query.payments.findFirst({
    where: and(eq(payments.userId, userId), eq(payments.id, paymentId))
  });
}

export async function findPaymentByOrderId(orderId: string) {
  return db.query.payments.findFirst({
    where: eq(payments.orderId, orderId)
  });
}

export async function findPaymentByExternalTransactionId(provider: "midtrans" | "lynk", externalTransactionId: string) {
  return db.query.payments.findFirst({
    where: and(eq(payments.provider, provider), eq(payments.externalTransactionId, externalTransactionId))
  });
}

export async function updatePaymentSnapDetails(input: {
  paymentId: string;
  snapToken: string;
  snapRedirectUrl: string;
}) {
  const [payment] = await db.update(payments)
    .set({
      snapToken: input.snapToken,
      snapRedirectUrl: input.snapRedirectUrl,
      status: "pending",
      updatedAt: new Date()
    })
    .where(eq(payments.id, input.paymentId))
    .returning();

  return payment || null;
}

export async function updatePaymentStatus(input: {
  paymentId: string;
  status: string;
  midtransTransactionId?: string;
  midtransOrderId?: string;
  externalTransactionId?: string;
  customerEmail?: string;
  customerName?: string;
  rawNotification?: unknown;
}) {
  const [payment] = await db.update(payments)
    .set({
      status: input.status,
      midtransTransactionId: input.midtransTransactionId || "",
      midtransOrderId: input.midtransOrderId || "",
      externalTransactionId: input.externalTransactionId || "",
      customerEmail: input.customerEmail || "",
      customerName: input.customerName || "",
      rawNotification: input.rawNotification || {},
      updatedAt: new Date()
    })
    .where(eq(payments.id, input.paymentId))
    .returning();

  return payment || null;
}
