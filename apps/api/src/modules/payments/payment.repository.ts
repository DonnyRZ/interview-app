import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments } from "../../db/schema/index.js";
import type { PlanSlug } from "./plan-catalog.js";

export async function createPayment(input: {
  userId: string;
  orderId: string;
  plan: PlanSlug;
  grossAmount: number;
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
