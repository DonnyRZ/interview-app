import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { subscriptionPeriods, subscriptions, users } from "../../db/schema/index.js";
import type { GoogleUserInfo } from "./google-oauth.js";
import { getActiveSubscriptionForUser } from "../payments/subscription.service.js";
import { planCatalog } from "../payments/plan-catalog.js";

export class SubscriptionRequiredError extends Error {
  constructor(message = "Subscription Orviko belum aktif. Pilih paket terlebih dulu.") {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

export class SubscriptionQuotaExceededError extends SubscriptionRequiredError {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionQuotaExceededError";
  }
}

export class GoogleAccountConflictError extends Error {
  constructor() {
    super("Email ini sudah terhubung ke akun Google lain.");
    this.name = "GoogleAccountConflictError";
  }
}

export async function upsertGoogleUser(userInfo: GoogleUserInfo) {
  if (!userInfo.emailVerified) {
    throw new Error("Email Google belum terverifikasi.");
  }

  const normalizedEmail = userInfo.email.trim().toLowerCase();
  const existingByGoogleSub = await db.query.users.findFirst({
    where: eq(users.googleSub, userInfo.sub)
  });

  if (existingByGoogleSub) {
    const emailOwner = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail)
    });
    if (emailOwner && emailOwner.id !== existingByGoogleSub.id) {
      throw new GoogleAccountConflictError();
    }

    const [updatedUser] = await db.update(users)
      .set({
        email: normalizedEmail,
        name: userInfo.name,
        picture: userInfo.picture,
        authProvider: "google",
        updatedAt: new Date()
      })
      .where(eq(users.id, existingByGoogleSub.id))
      .returning();

    return updatedUser || existingByGoogleSub;
  }

  const existingByEmail = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail)
  });
  if (existingByEmail?.googleSub && existingByEmail.googleSub !== userInfo.sub) {
    throw new GoogleAccountConflictError();
  }

  if (existingByEmail) {
    const [linkedUser] = await db.update(users)
      .set({
        googleSub: userInfo.sub,
        name: userInfo.name,
        picture: userInfo.picture,
        authProvider: "google",
        updatedAt: new Date()
      })
      .where(eq(users.id, existingByEmail.id))
      .returning();
    return linkedUser || existingByEmail;
  }

  const [createdUser] = await db.insert(users).values({
    googleSub: userInfo.sub,
    email: normalizedEmail,
    name: userInfo.name,
    picture: userInfo.picture,
    authProvider: "google"
  }).returning();

  if (!createdUser) {
    throw new Error("Gagal membuat user Google.");
  }

  return createdUser;
}

export async function findUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId)
  });
}

export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase())
  });
}

export function hasActiveSubscription(
  user: { subscriptionPlan: string; subscriptionExpiresAt: Date | null } | null | undefined
) {
  if (!user || !user.subscriptionPlan || user.subscriptionPlan === "free" || !user.subscriptionExpiresAt) {
    return false;
  }

  return user.subscriptionExpiresAt.getTime() > Date.now();
}

export async function ensureUserHasActiveSubscription(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("User tidak ditemukan.");
  }

  const subscription = await getActiveSubscriptionForUser(userId);
  if (!subscription) {
    throw new SubscriptionRequiredError();
  }

  return {
    ...user,
    subscriptionPlan: subscription.plan,
    subscriptionExpiresAt: subscription.currentPeriodEndsAt,
    subscriptionPeriodStartedAt: subscription.currentPeriodStartedAt
  };
}

export async function activateUserSubscription(input: {
  userId: string;
  plan: "mini" | "starter" | "pro";
  durationDays?: number;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [currentUser] = await tx.select().from(users)
      .where(eq(users.id, input.userId)).limit(1).for("update");
    if (!currentUser) {
      throw new Error("User tidak ditemukan.");
    }
    const expiresAt = calculateSubscriptionExpiresAt(currentUser, now, input.durationDays || 30);
    const [existing] = await tx.select().from(subscriptions)
      .where(eq(subscriptions.userId, input.userId)).limit(1).for("update");

    const [subscription] = existing
      ? await tx.update(subscriptions).set({
        plan: input.plan,
        status: "active",
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: expiresAt,
        revokedAt: null,
        revokeReason: "",
        updatedAt: now
      }).where(eq(subscriptions.id, existing.id)).returning()
      : await tx.insert(subscriptions).values({
        userId: input.userId,
        plan: input.plan,
        status: "active",
        currentPeriodStartedAt: now,
        currentPeriodEndsAt: expiresAt
      }).returning();

    await tx.update(subscriptionPeriods).set({ status: "completed" })
      .where(eq(subscriptionPeriods.userId, input.userId));
    await tx.insert(subscriptionPeriods).values({
      subscriptionId: subscription!.id,
      userId: input.userId,
      plan: input.plan,
      periodStartedAt: now,
      periodEndsAt: expiresAt,
      liveSessionLimit: planCatalog[input.plan].liveSessionLimit,
      status: "active"
    });

    const [updatedUser] = await tx.update(users).set({
      subscriptionPlan: input.plan,
      subscriptionExpiresAt: expiresAt,
      subscriptionPeriodStartedAt: now,
      updatedAt: now
    }).where(eq(users.id, input.userId)).returning();
    return updatedUser!;
  });
}

export function calculateSubscriptionExpiresAt(
  currentUser: { subscriptionExpiresAt: Date | null } | null | undefined,
  now: Date,
  durationDays: number
) {
  const baseDate = currentUser?.subscriptionExpiresAt && currentUser.subscriptionExpiresAt > now
    ? currentUser.subscriptionExpiresAt
    : now;
  const expiresAt = new Date(baseDate);
  expiresAt.setDate(expiresAt.getDate() + durationDays);
  return expiresAt;
}
