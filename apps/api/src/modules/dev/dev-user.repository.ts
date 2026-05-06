import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { candidateProfiles, users } from "../../db/schema/index.js";
import { DEV_USER_EMAIL, DEV_USER_ID } from "./dev-user.js";

export async function ensureDevUser() {
  await db.insert(users).values({
    id: DEV_USER_ID,
    email: DEV_USER_EMAIL,
    name: "Dev User"
  }).onConflictDoNothing();

  const existingProfile = await db.query.candidateProfiles.findFirst({
    where: eq(candidateProfiles.userId, DEV_USER_ID)
  });

  if (!existingProfile) {
    await db.insert(candidateProfiles).values({
      userId: DEV_USER_ID
    });
  }
}
