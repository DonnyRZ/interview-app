import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  paymentEvents,
  paymentIntents,
  subscriptionPeriods,
  subscriptions,
  users
} from "../../db/schema/index.js";
import { env } from "../../env.js";
import { findUserById } from "../auth/auth.service.js";
import { parseLynkWebhook } from "./lynk.client.js";
import {
  createPaymentIntent,
  expirePendingPaymentIntents,
  findPaymentIntentForUser
} from "./payment.repository.js";
import {
  planCatalog,
  planSlugSchema,
  requireCheckoutReadyPlan,
  type PlanSlug
} from "./plan-catalog.js";

function buildOrderId(plan: PlanSlug) {
  return `ORVIKO-${plan.toUpperCase()}-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
}

function buildPublicId() {
  return `pay_${randomBytes(18).toString("base64url")}`;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function createLynkCheckoutForUser(input: { userId: string; plan: string }) {
  const parsedPlan = planSlugSchema.safeParse(input.plan);
  if (!parsedPlan.success) {
    throw new Error("Paket yang dipilih tidak valid.");
  }

  const user = await findUserById(input.userId);
  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  await expirePendingPaymentIntents();
  const plan = parsedPlan.data;
  const catalogItem = requireCheckoutReadyPlan(plan);
  const now = new Date();

  return createPaymentIntent({
    publicId: buildPublicId(),
    userId: input.userId,
    providerOrderId: buildOrderId(plan),
    providerProductId: catalogItem.providerProductId,
    plan,
    amount: catalogItem.grossAmount,
    currency: catalogItem.currency,
    customerEmail: user.email,
    checkoutUrl: catalogItem.checkoutUrl,
    expiresAt: new Date(now.getTime() + env.PAYMENT_INTENT_TTL_MINUTES * 60_000)
  });
}

export async function getPaymentForUser(userId: string, publicId: string) {
  await expirePendingPaymentIntents();
  return findPaymentIntentForUser(userId, publicId);
}

function payloadDigest(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function safeEventPayload(parsed: ReturnType<typeof parseLynkWebhook>) {
  return {
    eventName: parsed.eventName,
    status: parsed.status,
    eventType: parsed.eventType,
    providerOrderId: parsed.providerOrderId,
    productId: parsed.productId,
    transactionIdPresent: Boolean(parsed.transactionId),
    amount: parsed.amount,
    currency: parsed.currency
  };
}

function invalid(reason: string) {
  return { processed: false as const, reason };
}

export async function handleLynkWebhook(payload: Record<string, unknown>) {
  const parsed = parseLynkWebhook(payload);
  if (parsed.eventType === "unknown") {
    return invalid("Event payment tidak dikenali.");
  }
  if (
    !parsed.providerEventId
    || !parsed.transactionId
    || !parsed.providerOrderId
    || !parsed.productId
    || !parsed.customerEmail
  ) {
    return invalid("Webhook tidak memiliki identifier provider yang lengkap.");
  }
  if (!parsed.hasAmount || !parsed.currency) {
    return invalid("Webhook tidak memiliki amount dan currency yang lengkap.");
  }

  return db.transaction(async (tx) => {
    const [intent] = await tx.select()
      .from(paymentIntents)
      .where(and(
        eq(paymentIntents.provider, "lynk"),
        eq(paymentIntents.providerOrderId, parsed.providerOrderId)
      ))
      .limit(1)
      .for("update");

    const [event] = await tx.insert(paymentEvents).values({
      paymentIntentId: intent?.id || null,
      provider: "lynk",
      providerEventId: parsed.providerEventId,
      providerTransactionId: parsed.transactionId,
      eventType: parsed.eventType,
      verificationStatus: "verified",
      processingStatus: "received",
      payloadDigest: payloadDigest(payload),
      sanitizedPayload: safeEventPayload(parsed)
    }).onConflictDoNothing().returning();

    if (!event) {
      return {
        processed: true as const,
        duplicate: true,
        reason: "Webhook sudah pernah diproses."
      };
    }

    const rejectEvent = async (reason: string) => {
      await tx.update(paymentEvents).set({
        processingStatus: "rejected",
        failureReason: reason,
        processedAt: new Date()
      }).where(eq(paymentEvents.id, event.id));
      return invalid(reason);
    };

    if (!intent) {
      return rejectEvent("Payment intent untuk provider order tidak ditemukan.");
    }
    if (
      intent.providerProductId !== parsed.productId
      || intent.amount !== parsed.amount
      || intent.currency !== parsed.currency
      || intent.customerEmail.toLowerCase() !== parsed.customerEmail
    ) {
      return rejectEvent("Product, amount, atau currency tidak cocok dengan payment intent.");
    }

    const now = new Date();
    if (intent.expiresAt <= now && intent.status === "pending") {
      await tx.update(paymentIntents).set({
        status: "expired",
        failedAt: now,
        updatedAt: now
      }).where(eq(paymentIntents.id, intent.id));
      return rejectEvent("Payment intent sudah kedaluwarsa.");
    }

    if (parsed.eventType === "paid") {
      if (intent.status === "paid") {
        await tx.update(paymentEvents).set({
          processingStatus: "processed",
          processedAt: now
        }).where(eq(paymentEvents.id, event.id));
        return { processed: true as const, duplicate: true, reason: "Payment sudah aktif." };
      }
      if (intent.status !== "pending") {
        return rejectEvent(`Payment intent berstatus ${intent.status} dan tidak dapat dibayar.`);
      }

      const plan = planSlugSchema.parse(intent.plan);
      const catalogItem = planCatalog[plan];
      const [activeSubscription] = await tx.select()
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, intent.userId), eq(subscriptions.status, "active")))
        .limit(1)
        .for("update");
      const periodStart = activeSubscription?.currentPeriodEndsAt && activeSubscription.currentPeriodEndsAt > now
        ? activeSubscription.currentPeriodEndsAt
        : now;
      const periodEnd = addDays(periodStart, catalogItem.billingPeriodDays);

      let subscriptionId: string;
      if (activeSubscription) {
        const [updated] = await tx.update(subscriptions).set({
          plan,
          sourcePaymentIntentId: intent.id,
          currentPeriodStartedAt: periodStart,
          currentPeriodEndsAt: periodEnd,
          updatedAt: now
        }).where(eq(subscriptions.id, activeSubscription.id)).returning();
        subscriptionId = updated!.id;
        await tx.update(subscriptionPeriods).set({ status: "completed" })
          .where(and(
            eq(subscriptionPeriods.subscriptionId, activeSubscription.id),
            eq(subscriptionPeriods.status, "active")
          ));
      } else {
        const [created] = await tx.insert(subscriptions).values({
          userId: intent.userId,
          plan,
          status: "active",
          sourcePaymentIntentId: intent.id,
          currentPeriodStartedAt: periodStart,
          currentPeriodEndsAt: periodEnd
        }).returning();
        subscriptionId = created!.id;
      }

      await tx.insert(subscriptionPeriods).values({
        subscriptionId,
        userId: intent.userId,
        paymentIntentId: intent.id,
        plan,
        periodStartedAt: periodStart,
        periodEndsAt: periodEnd,
        liveSessionLimit: catalogItem.liveSessionLimit,
        status: "active"
      });
      await tx.update(paymentIntents).set({
        status: "paid",
        paidAt: now,
        updatedAt: now
      }).where(eq(paymentIntents.id, intent.id));
      await tx.update(users).set({
        subscriptionPlan: plan,
        subscriptionPeriodStartedAt: periodStart,
        subscriptionExpiresAt: periodEnd,
        updatedAt: now
      }).where(eq(users.id, intent.userId));
    } else if (parsed.eventType === "refunded" || parsed.eventType === "chargeback") {
      await tx.update(paymentIntents).set({
        status: parsed.eventType,
        failedAt: now,
        updatedAt: now
      }).where(eq(paymentIntents.id, intent.id));
      await tx.update(subscriptions).set({
        status: parsed.eventType,
        revokedAt: now,
        revokeReason: parsed.eventType,
        updatedAt: now
      }).where(and(eq(subscriptions.userId, intent.userId), eq(subscriptions.status, "active")));
      await tx.update(subscriptionPeriods).set({ status: parsed.eventType })
        .where(and(eq(subscriptionPeriods.userId, intent.userId), eq(subscriptionPeriods.status, "active")));
      await tx.update(users).set({
        subscriptionPlan: "free",
        subscriptionPeriodStartedAt: null,
        subscriptionExpiresAt: null,
        updatedAt: now
      }).where(eq(users.id, intent.userId));
    } else {
      await tx.update(paymentIntents).set({
        status: parsed.eventType,
        failedAt: now,
        updatedAt: now
      }).where(eq(paymentIntents.id, intent.id));
    }

    await tx.update(paymentEvents).set({
      processingStatus: "processed",
      processedAt: now
    }).where(eq(paymentEvents.id, event.id));

    return {
      processed: true as const,
      duplicate: false,
      reason: `Payment event ${parsed.eventType} berhasil diproses.`,
      paymentPublicId: intent.publicId,
      eventType: parsed.eventType
    };
  });
}
