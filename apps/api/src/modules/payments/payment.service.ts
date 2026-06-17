import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { payments, users } from "../../db/schema/index.js";
import {
  calculateSubscriptionExpiresAt,
  findUserByEmail,
  findUserById
} from "../auth/auth.service.js";
import { getLynkCheckoutUrl, parseLynkWebhook } from "./lynk.client.js";
import {
  createPayment,
  findPaymentForUser
} from "./payment.repository.js";
import { planCatalog, planSlugSchema, type PlanSlug } from "./plan-catalog.js";

function buildOrderId(plan: PlanSlug) {
  return `ORVIKO-${plan.toUpperCase()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
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

  if (!parsed.transactionId) {
    return {
      processed: false,
      reason: "Webhook Lynk sukses diterima, tetapi transaction id tidak ditemukan.",
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

  return db.transaction(async (tx) => {
    const [existingPayment] = await tx.select()
      .from(payments)
      .where(eq(payments.externalTransactionId, parsed.transactionId))
      .limit(1)
      .for("update");

    const [pendingPayment] = existingPayment || parsed.amount <= 0
      ? []
      : await tx.select()
        .from(payments)
        .where(and(
          eq(payments.userId, user.id),
          eq(payments.grossAmount, parsed.amount),
          eq(payments.customerEmail, parsed.customerEmail),
          eq(payments.externalTransactionId, ""),
          eq(payments.status, "pending")
        ))
        .orderBy(desc(payments.createdAt))
        .limit(1)
        .for("update");

    const payment = existingPayment || pendingPayment || null;

    if (existingPayment && existingPayment.userId !== user.id) {
      return {
        processed: false,
        reason: "Webhook Lynk cocok dengan transaksi yang sudah tercatat untuk akun Orviko lain.",
        payment: existingPayment,
        parsed
      };
    }

    if (payment?.status === "settlement") {
      return {
        processed: true,
        reason: "Webhook Lynk sudah pernah diproses.",
        payment,
        parsed
      };
    }

    if (!payment) {
      const [recheckedPayment] = await tx.select()
        .from(payments)
        .where(eq(payments.externalTransactionId, parsed.transactionId))
        .limit(1)
        .for("update");

      if (recheckedPayment && recheckedPayment.userId !== user.id) {
        return {
          processed: false,
          reason: "Webhook Lynk cocok dengan transaksi yang sudah tercatat untuk akun Orviko lain.",
          payment: recheckedPayment,
          parsed
        };
      }

      if (recheckedPayment?.status === "settlement") {
        return {
          processed: true,
          reason: "Webhook Lynk sudah pernah diproses.",
          payment: recheckedPayment,
          parsed
        };
      }

      return {
        processed: false,
        reason: "Webhook Lynk sukses diterima, tetapi pending checkout Orviko tidak ditemukan.",
        parsed
      };
    }

    const paymentPlan = planSlugSchema.safeParse(payment.plan);
    if (!paymentPlan.success) {
      return {
        processed: false,
        reason: "Webhook Lynk cocok dengan payment Orviko, tetapi paket payment tidak valid.",
        payment,
        parsed
      };
    }

    const [lockedUser] = await tx.select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
      .for("update");
    if (!lockedUser) {
      return {
        processed: false,
        reason: "Webhook Lynk cocok dengan email, tetapi user Orviko tidak ditemukan.",
        parsed
      };
    }

    const now = new Date();
    const expiresAt = calculateSubscriptionExpiresAt(lockedUser, now, 30);
    const [updatedPayment] = await tx.update(payments)
      .set({
        status: "settlement",
        externalTransactionId: parsed.transactionId,
        customerEmail: parsed.customerEmail,
        customerName: parsed.customerName,
        rawNotification: payload,
        updatedAt: now
      })
      .where(eq(payments.id, payment.id))
      .returning();

    const [updatedUser] = await tx.update(users)
      .set({
        subscriptionPlan: paymentPlan.data,
        subscriptionExpiresAt: expiresAt,
        subscriptionPeriodStartedAt: now,
        updatedAt: now
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updatedUser) {
      throw new Error("Gagal mengaktifkan subscription user.");
    }

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
  });
}
