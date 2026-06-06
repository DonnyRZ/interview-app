import { eq, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema/index.js";
import type { GoogleUserInfo } from "./google-oauth.js";

export async function upsertGoogleUser(userInfo: GoogleUserInfo) {
  const existing = await db.query.users.findFirst({
    where: or(eq(users.googleSub, userInfo.sub), eq(users.email, userInfo.email))
  });

  if (existing) {
    const [updatedUser] = await db.update(users)
      .set({
        googleSub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        authProvider: "google",
        updatedAt: new Date()
      })
      .where(eq(users.id, existing.id))
      .returning();

    return updatedUser || existing;
  }

  const [createdUser] = await db.insert(users).values({
    googleSub: userInfo.sub,
    email: userInfo.email,
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

export async function activateUserSubscription(input: {
  userId: string;
  plan: "mini" | "starter" | "pro";
  durationDays?: number;
}) {
  const now = new Date();
  const currentUser = await findUserById(input.userId);
  const baseDate = currentUser?.subscriptionExpiresAt && currentUser.subscriptionExpiresAt > now
    ? currentUser.subscriptionExpiresAt
    : now;
  const expiresAt = new Date(baseDate);
  expiresAt.setDate(expiresAt.getDate() + (input.durationDays || 30));

  const [updatedUser] = await db.update(users)
    .set({
      subscriptionPlan: input.plan,
      subscriptionExpiresAt: expiresAt,
      updatedAt: now
    })
    .where(eq(users.id, input.userId))
    .returning();

  if (!updatedUser) {
    throw new Error("Gagal mengaktifkan subscription user.");
  }

  return updatedUser;
}
