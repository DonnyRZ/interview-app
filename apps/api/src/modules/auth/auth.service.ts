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
