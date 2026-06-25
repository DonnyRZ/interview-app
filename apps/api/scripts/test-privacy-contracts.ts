import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Readable } from "node:stream";
import type { MultipartFile } from "@fastify/multipart";

process.env.OPENAI_API_KEY = "";
process.env.RATE_LIMIT_MAX_REQUESTS = "1000";
process.env.AI_RATE_LIMIT_MAX_REQUESTS = "1000";
process.env.PAYMENT_RATE_LIMIT_MAX_REQUESTS = "1000";

const { buildApp } = await import("../src/app.js");
const { db } = await import("../src/db/client.js");
const { accountDeletionJobs, users } = await import("../src/db/schema/index.js");
const { createSessionForUser, SESSION_COOKIE } = await import("../src/modules/auth/session.js");
const { uploadProfileDocumentForUser } = await import("../src/modules/profile-documents/profile-document.service.js");

async function run() {
  await rejectsFakePdfMagicBytes();
  await exportsAndDeletesAccount();
  console.log("[ok] privacy contract checks passed");
}

async function rejectsFakePdfMagicBytes() {
  await assert.rejects(
    uploadProfileDocumentForUser(randomUUID(), fakeMultipartFile(Buffer.from("not a pdf"))),
    /signature file/
  );
}

async function exportsAndDeletesAccount() {
  const email = `privacy-${randomUUID()}@orviko.local`;
  const [user] = await db.insert(users).values({
    email,
    googleSub: `privacy-${randomUUID()}`,
    name: "Privacy Test",
    authProvider: "google"
  }).returning();
  assert.ok(user);

  const session = await createSessionForUser(user.id);
  const cookie = `${SESSION_COOKIE}=${session.token}`;
  const app = buildApp();
  try {
    const exportResponse = await app.inject({
      method: "POST",
      url: "/account/export",
      headers: { cookie }
    });
    assert.equal(exportResponse.statusCode, 200);
    assert.equal(exportResponse.json().accountExport.user.email, email);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/account/",
      headers: { cookie }
    });
    assert.equal(deleteResponse.statusCode, 200);
    assert.equal(deleteResponse.json().deletionJob.status, "completed");

    const deletedUser = await db.query.users.findFirst({
      where: eq(users.id, user.id)
    });
    assert.equal(deletedUser, undefined);

    const deletionJob = await db.query.accountDeletionJobs.findFirst({
      where: eq(accountDeletionJobs.userId, user.id)
    });
    assert.equal(deletionJob?.status, "completed");
    assert.notEqual(deletionJob?.emailDigest, email);
  } finally {
    await app.close();
  }
}

function fakeMultipartFile(bytes: Buffer): MultipartFile {
  return {
    type: "file",
    fieldname: "file",
    filename: "fake.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    file: Readable.from(bytes),
    fields: {},
    toBuffer: async () => bytes
  } as unknown as MultipartFile;
}

await run();
