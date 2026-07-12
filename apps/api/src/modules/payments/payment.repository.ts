import { and, eq, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { paymentIntents } from "../../db/schema/index.js";
import type { PlanSlug } from "./plan-catalog.js";
import { assertPaymentProviderId } from "./payment-provider.js";

export async function createPaymentIntent(input: {
  publicId: string;
  userId: string;
  provider: string;
  providerOrderId: string;
  providerProductId: string;
  plan: PlanSlug;
  amount: number;
  currency: string;
  customerEmail: string;
  checkoutUrl: string;
  expiresAt: Date;
}) {
  assertPaymentProviderId(input.provider);
  const [intent] = await db.insert(paymentIntents).values({
    ...input,
    status: "pending"
  }).returning();

  if (!intent) {
    throw new Error("Gagal membuat payment intent.");
  }
  return intent;
}

export async function findPaymentIntentForUser(userId: string, publicId: string) {
  return db.query.paymentIntents.findFirst({
    where: and(eq(paymentIntents.userId, userId), eq(paymentIntents.publicId, publicId))
  });
}

export async function expirePendingPaymentIntents(now = new Date()) {
  return db.update(paymentIntents)
    .set({ status: "expired", failedAt: now, updatedAt: now })
    .where(and(eq(paymentIntents.status, "pending"), lt(paymentIntents.expiresAt, now)))
    .returning({ id: paymentIntents.id });
}
