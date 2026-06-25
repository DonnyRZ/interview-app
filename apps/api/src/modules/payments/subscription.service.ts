import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { subscriptionPeriods, subscriptions, users } from "../../db/schema/index.js";
import { expirePendingPaymentIntents } from "./payment.repository.js";

export async function getActiveSubscriptionForUser(userId: string, now = new Date()) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active"),
      gt(subscriptions.currentPeriodEndsAt, now)
    )
  });
}

export async function hasActiveEntitlement(userId: string) {
  return Boolean(await getActiveSubscriptionForUser(userId));
}

export async function reconcilePaymentState(now = new Date()) {
  const expiredIntents = await expirePendingPaymentIntents(now);
  const expiredSubscriptions = await db.transaction(async (tx) => {
    const expired = await tx.update(subscriptions).set({
      status: "expired",
      updatedAt: now
    }).where(and(
      eq(subscriptions.status, "active"),
      lt(subscriptions.currentPeriodEndsAt, now)
    )).returning({ userId: subscriptions.userId });

    if (expired.length > 0) {
      const userIds = expired.map((item) => item.userId);
      await tx.update(subscriptionPeriods).set({ status: "completed" })
        .where(and(
          inArray(subscriptionPeriods.userId, userIds),
          eq(subscriptionPeriods.status, "active")
        ));
      await tx.update(users).set({
        subscriptionPlan: "free",
        subscriptionExpiresAt: null,
        subscriptionPeriodStartedAt: null,
        updatedAt: now
      }).where(inArray(users.id, userIds));
    }
    return expired;
  });

  return {
    expiredPaymentIntents: expiredIntents.length,
    expiredSubscriptions: expiredSubscriptions.length
  };
}
