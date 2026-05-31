import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { userProfiles, users } from "../../db/schema/index.js";
import { DEV_USER_EMAIL, DEV_USER_ID } from "./dev-user.js";

export async function ensureDevUser() {
  await db.insert(users).values({
    id: DEV_USER_ID,
    email: DEV_USER_EMAIL,
    name: "Dev User"
  }).onConflictDoNothing();

  const existingProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, DEV_USER_ID)
  });

  if (!existingProfile) {
    await db.insert(userProfiles).values({
      userId: DEV_USER_ID
    });
  }
}
