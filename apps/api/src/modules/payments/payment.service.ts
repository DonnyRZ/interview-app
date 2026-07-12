import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
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
import { buildLynkCheckoutUrl, parseLynkWebhook } from "./lynk.client.js";
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
import {
  assertPaymentProviderId,
  type VerifiedPaymentProviderEvent
} from "./payment-provider.js";

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
  const providerOrderId = buildOrderId(plan);

  return createPaymentIntent({
    publicId: buildPublicId(),
    userId: input.userId,
    provider: "lynk",
    providerOrderId,
    providerProductId: catalogItem.providerProductId,
    plan,
    amount: catalogItem.grossAmount,
    currency: catalogItem.currency,
    customerEmail: user.email,
    checkoutUrl: buildLynkCheckoutUrl(catalogItem.checkoutUrl, providerOrderId),
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

function safeLynkEventPayload(parsed: ReturnType<typeof parseLynkWebhook>) {
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

  return handleVerifiedPaymentEvent({
    provider: "lynk",
    providerEventId: parsed.providerEventId,
    providerPaymentId: parsed.transactionId,
    providerOrderId: parsed.providerOrderId,
    providerProductId: parsed.productId,
    customerEmail: parsed.customerEmail,
    eventType: parsed.eventType,
    amount: parsed.amount,
    currency: parsed.currency,
    sanitizedPayload: safeLynkEventPayload(parsed)
  }, payload);
}

/** Canonical checkout entry point. The active provider adapter is Lynk during the MVP. */
export async function createPaymentCheckoutForUser(input: { userId: string; plan: string }) {
  return createLynkCheckoutForUser(input);
}

export async function handleVerifiedPaymentEvent(
  providerEvent: VerifiedPaymentProviderEvent,
  rawPayload: Record<string, unknown>
) {
  assertPaymentProviderId(providerEvent.provider);
  if (
    !providerEvent.providerEventId
    || !providerEvent.providerPaymentId
    || !providerEvent.providerOrderId
  ) {
    return invalid("Event payment tidak memiliki identifier provider yang lengkap.");
  }
  if (!Number.isSafeInteger(providerEvent.amount) || providerEvent.amount < 0) {
    return invalid("Event payment memiliki amount yang tidak valid.");
  }
  if (!/^[A-Z]{3}$/.test(providerEvent.currency)) {
    return invalid("Event payment memiliki currency yang tidak valid.");
  }

  return db.transaction(async (tx) => {
    const [intent] = await tx.select()
      .from(paymentIntents)
      .where(and(
        eq(paymentIntents.provider, providerEvent.provider),
        eq(paymentIntents.providerOrderId, providerEvent.providerOrderId)
      ))
      .limit(1)
      .for("update");

    const [event] = await tx.insert(paymentEvents).values({
      paymentIntentId: intent?.id || null,
      provider: providerEvent.provider,
      providerEventId: providerEvent.providerEventId,
      providerTransactionId: providerEvent.providerPaymentId,
      eventType: providerEvent.eventType,
      verificationStatus: "verified",
      processingStatus: "received",
      payloadDigest: payloadDigest(rawPayload),
      sanitizedPayload: providerEvent.sanitizedPayload
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
      (providerEvent.providerProductId !== undefined && intent.providerProductId !== providerEvent.providerProductId)
      || intent.amount !== providerEvent.amount
      || intent.currency !== providerEvent.currency
      || (providerEvent.customerEmail !== undefined
        && intent.customerEmail.toLowerCase() !== providerEvent.customerEmail.toLowerCase())
    ) {
      return rejectEvent("Product, amount, atau currency tidak cocok dengan payment intent.");
    }
    if (intent.providerPaymentId && intent.providerPaymentId !== providerEvent.providerPaymentId) {
      return rejectEvent("Provider payment id tidak cocok dengan payment intent.");
    }
    if (!intent.providerPaymentId) {
      await tx.update(paymentIntents).set({
        providerPaymentId: providerEvent.providerPaymentId,
        updatedAt: new Date()
      }).where(eq(paymentIntents.id, intent.id));
    }

    // Serialize all entitlement changes for one user, including different payment intents.
    await tx.select({ id: users.id })
      .from(users)
      .where(eq(users.id, intent.userId))
      .limit(1)
      .for("update");

    const now = new Date();
    if (intent.expiresAt <= now && intent.status === "pending") {
      await tx.update(paymentIntents).set({
        status: "expired",
        failedAt: now,
        updatedAt: now
      }).where(eq(paymentIntents.id, intent.id));
      return rejectEvent("Payment intent sudah kedaluwarsa.");
    }

    if (providerEvent.eventType === "paid") {
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
    } else if (providerEvent.eventType === "refunded" || providerEvent.eventType === "chargeback") {
      const canReverse = intent.status === "paid"
        || (providerEvent.eventType === "chargeback" && intent.status === "refunded");
      if (!canReverse) {
        return rejectEvent(`Payment intent berstatus ${intent.status} dan tidak dapat ${providerEvent.eventType}.`);
      }
      await tx.update(paymentIntents).set({
        status: providerEvent.eventType,
        failedAt: now,
        updatedAt: now
      }).where(eq(paymentIntents.id, intent.id));
      const [currentSubscription] = await tx.select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.userId, intent.userId),
          eq(subscriptions.sourcePaymentIntentId, intent.id),
          eq(subscriptions.status, "active")
        )).limit(1);
      await tx.update(subscriptionPeriods).set({ status: providerEvent.eventType })
        .where(eq(subscriptionPeriods.paymentIntentId, intent.id));

      if (currentSubscription) {
        const [fallbackPeriod] = await tx.select()
          .from(subscriptionPeriods)
          .where(and(
            eq(subscriptionPeriods.userId, intent.userId),
            inArray(subscriptionPeriods.status, ["active", "completed"]),
            gt(subscriptionPeriods.periodEndsAt, now),
            ne(subscriptionPeriods.paymentIntentId, intent.id)
          ))
          .orderBy(desc(subscriptionPeriods.periodEndsAt))
          .limit(1);

        if (fallbackPeriod) {
          await tx.update(subscriptionPeriods).set({ status: "active" })
            .where(eq(subscriptionPeriods.id, fallbackPeriod.id));
          await tx.update(subscriptions).set({
            plan: fallbackPeriod.plan,
            status: "active",
            sourcePaymentIntentId: fallbackPeriod.paymentIntentId,
            currentPeriodStartedAt: fallbackPeriod.periodStartedAt,
            currentPeriodEndsAt: fallbackPeriod.periodEndsAt,
            revokedAt: null,
            revokeReason: "",
            updatedAt: now
          }).where(eq(subscriptions.id, currentSubscription.id));
          await tx.update(users).set({
            subscriptionPlan: fallbackPeriod.plan,
            subscriptionPeriodStartedAt: fallbackPeriod.periodStartedAt,
            subscriptionExpiresAt: fallbackPeriod.periodEndsAt,
            updatedAt: now
          }).where(eq(users.id, intent.userId));
        } else {
          await tx.update(subscriptions).set({
            status: providerEvent.eventType,
            revokedAt: now,
            revokeReason: providerEvent.eventType,
            updatedAt: now
          }).where(eq(subscriptions.id, currentSubscription.id));
          await tx.update(users).set({
            subscriptionPlan: "free",
            subscriptionPeriodStartedAt: null,
            subscriptionExpiresAt: null,
            updatedAt: now
          }).where(eq(users.id, intent.userId));
        }
      }
    } else {
      if (intent.status !== "pending") {
        return rejectEvent(`Payment intent berstatus ${intent.status} tidak menerima event ${providerEvent.eventType}.`);
      }
      await tx.update(paymentIntents).set({
        status: providerEvent.eventType,
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
      reason: `Payment event ${providerEvent.eventType} berhasil diproses.`,
      paymentPublicId: intent.publicId,
      eventType: providerEvent.eventType
    };
  });
}
