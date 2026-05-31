import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";

process.env.OPENAI_API_KEY = "";

const { buildApp } = await import("../src/app.js");
const { db } = await import("../src/db/client.js");
const {
  meetingContexts,
  profileDocuments,
  userProfiles,
  liveMeetingSessions,
  users
} = await import("../src/db/schema/index.js");
const { DEV_USER_ID } = await import("../src/modules/dev/dev-user.js");
const { ensureDevUser } = await import("../src/modules/dev/dev-user.repository.js");
const {
  findLatestReadyProfileDocumentExcluding,
  setActiveProfileDocument
} = await import("../src/modules/profile-documents/profile-document.repository.js");
const {
  endLiveMeetingSession,
  startLiveMeetingSession
} = await import("../src/modules/live-meetings/live-meeting.repository.js");
const { updateMeetingContextForDevUser } = await import("../src/modules/meeting-contexts/meeting-context.service.js");
const {
  endLiveMeetingForDevUser,
  startLiveMeetingForDevUser
} = await import("../src/modules/live-meetings/live-meeting.service.js");

const tempUserIds: string[] = [];
const devMeetingContextIds: string[] = [];
const devProfileDocumentIds: string[] = [];
const simulationIterations = 25;

try {
  await cleanupKnownSimulationArtifacts();
  await ensureDevUser();
  for (let iteration = 0; iteration < simulationIterations; iteration++) {
    await simulateActiveProfileDocumentUniqueness();
    await simulateReadyOnlyReplacementSelection();
    await simulateSessionEndIdempotency();
    await simulateOrphanSessionRecovery();
    await simulateDbConstraints();
    await simulateDevServiceGuards();
  }
  console.log(`Data integrity DB simulations passed (${simulationIterations} iterations).`);
} finally {
  await cleanup();
}

await simulateApiRouteMisses();

async function simulateActiveProfileDocumentUniqueness() {
  const userId = await createTempUser("active");
  await db.insert(userProfiles).values({ userId });
  const firstProfileDocumentId = await createProfileDocument(userId, "ready", false, -2000);
  const secondProfileDocumentId = await createProfileDocument(userId, "ready", false, -1000);

  await setActiveProfileDocument(userId, firstProfileDocumentId);
  await setActiveProfileDocument(userId, secondProfileDocumentId);

  const activeProfileDocuments = await db.query.profileDocuments.findMany({
    where: and(eq(profileDocuments.userId, userId), eq(profileDocuments.isActive, true))
  });
  assert.equal(activeProfileDocuments.length, 1);
  assert.equal(activeProfileDocuments[0]?.id, secondProfileDocumentId);

  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId)
  });
  assert.equal(profile?.activeProfileDocumentId, null);

  await assert.rejects(
    db.update(profileDocuments)
      .set({ isActive: true })
      .where(eq(profileDocuments.id, firstProfileDocumentId)),
    /profile_documents_one_active_per_user_idx|duplicate key/
  );

  await assert.rejects(
    setActiveProfileDocument(userId, randomUUID()),
    /Profile document not found/
  );
}

async function simulateReadyOnlyReplacementSelection() {
  const userId = await createTempUser("replacement");
  const activeProfileDocumentId = await createProfileDocument(userId, "ready", true, -3000);
  const readyReplacementId = await createProfileDocument(userId, "ready", false, -2000);
  const failedNewerId = await createProfileDocument(userId, "failed", false, -1000);

  const replacement = await findLatestReadyProfileDocumentExcluding(userId, activeProfileDocumentId);
  assert.equal(replacement?.id, readyReplacementId);
  assert.notEqual(replacement?.id, failedNewerId);
}

async function simulateSessionEndIdempotency() {
  const userId = await createTempUser("session");
  const profileDocumentId = await createProfileDocument(userId, "ready", false, -1000);
  const meetingContextId = await createMeetingContext(userId, profileDocumentId, "Session test", "Initial topic", "Initial brief");
  const session = await startLiveMeetingSession(userId, meetingContextId, "OTHER");

  const firstEnd = await endLiveMeetingSession(userId, session.id, "first transcript");
  const secondEnd = await endLiveMeetingSession(userId, session.id, "second transcript");

  assert.equal(firstEnd?.transcriptText, "first transcript");
  assert.equal(secondEnd?.transcriptText, "first transcript");
  assert.equal(secondEnd?.endedAt?.toISOString(), firstEnd?.endedAt?.toISOString());
}

async function simulateOrphanSessionRecovery() {
  const profileDocumentId = await createProfileDocument(DEV_USER_ID, "ready", false, -1000);
  devProfileDocumentIds.push(profileDocumentId);
  const meetingContextId = await createMeetingContext(DEV_USER_ID, profileDocumentId, "Orphan recovery", "Live session", "Brief");
  devMeetingContextIds.push(meetingContextId);
  const session = await startLiveMeetingSession(DEV_USER_ID, meetingContextId, "OTHER");

  const recovered = await endLiveMeetingForDevUser(session.id, {
    transcriptText: "Recovered from stale live session."
  });
  assert.equal(recovered?.id, session.id);
  assert.ok(recovered?.endedAt);
  assert.equal(recovered?.transcriptText, "Recovered from stale live session.");

  const repeated = await endLiveMeetingForDevUser(session.id, {
    transcriptText: "Should not overwrite recovered transcript."
  });
  assert.equal(repeated?.transcriptText, "Recovered from stale live session.");
  assert.equal(repeated?.endedAt?.toISOString(), recovered?.endedAt?.toISOString());
}

async function simulateDbConstraints() {
  const userId = await createTempUser("constraints");
  const profileDocumentId = await createProfileDocument(userId, "ready", false, -1000);
  const meetingContextId = await createMeetingContext(userId, profileDocumentId, "Constraint test", "Topic", "Brief");

  await assert.rejects(
    db.insert(profileDocuments).values({
      userId,
      fileName: "bad-status.pdf",
      filePath: `memory://${randomUUID()}.pdf`,
      processingStatus: "unknown",
      isActive: false
    }),
    /profile_documents_processing_status_check|violates check constraint/
  );
  await assert.rejects(
    db.insert(meetingContexts).values({
      userId,
      profileDocumentId,
      contextName: "Invalid status",
      meetingTopic: "Invalid status",
      status: "deleted"
    }),
    /meeting_contexts_status_check|violates check constraint/
  );
  await assert.rejects(
    startLiveMeetingSession(userId, meetingContextId, "BROKEN" as never),
    /live_meeting_sessions_session_type_check|violates check constraint/
  );
}

async function simulateDevServiceGuards() {
  const failedProfileDocumentId = await createProfileDocument(DEV_USER_ID, "failed", false, -3000);
  devProfileDocumentIds.push(failedProfileDocumentId);
  const failedProfileDocumentMeetingContextId = await createMeetingContext(DEV_USER_ID, failedProfileDocumentId, "Guard test", "Failed profile topic", "Brief");
  devMeetingContextIds.push(failedProfileDocumentMeetingContextId);

  await assert.rejects(
    startLiveMeetingForDevUser({ meetingContextId: failedProfileDocumentMeetingContextId, sessionType: "OTHER" }),
    /not ready/
  );

  const readyProfileDocumentId = await createProfileDocument(DEV_USER_ID, "ready", false, -2000);
  devProfileDocumentIds.push(readyProfileDocumentId);
  const updateMeetingContextId = await createMeetingContext(DEV_USER_ID, readyProfileDocumentId, "Update test", "Old topic", "Old brief");
  devMeetingContextIds.push(updateMeetingContextId);

  const updated = await updateMeetingContextForDevUser(updateMeetingContextId, {
    meetingTopic: "New topic",
    meetingBrief: "New meeting brief"
  });

  assert.equal(updated?.meetingTopic, "New topic");
  assert.match(updated?.meetingContextText || "", /New topic/);
  assert.doesNotMatch(updated?.meetingContextText || "", /Existing company|Existing role|Dummy context/);
  assert.match(JSON.stringify(updated?.meetingSummaryJson || {}), /New topic/);

  const newerProfileDocumentReadyContext = `Ready context from newer profile ${randomUUID()}.`;
  const newerReadyProfileDocumentId = await createProfileDocument(DEV_USER_ID, "ready", false, -1000, newerProfileDocumentReadyContext);
  devProfileDocumentIds.push(newerReadyProfileDocumentId);
  const contextBeforeProfileSwitch = switchedContextFingerprint(updated);

  const switched = await updateMeetingContextForDevUser(updateMeetingContextId, {
    profileDocumentId: newerReadyProfileDocumentId
  });
  assert.equal(switched?.profileDocumentId, newerReadyProfileDocumentId);
  assert.deepEqual(switchedContextFingerprint(switched), contextBeforeProfileSwitch);

  const started = await startLiveMeetingForDevUser({
    meetingContextId: updateMeetingContextId,
    sessionType: "OTHER"
  });
  assert.equal(started.realtimeContext.userProfileContext.readyContext, newerProfileDocumentReadyContext);
}

function switchedContextFingerprint(meetingContext: Awaited<ReturnType<typeof updateMeetingContextForDevUser>>) {
  return {
    meetingContextText: meetingContext?.meetingContextText,
    meetingSummaryJson: meetingContext?.meetingSummaryJson
  };
}

async function simulateApiRouteMisses() {
  const app = buildApp();
  try {
    for (let iteration = 0; iteration < simulationIterations; iteration++) {
      const response = await app.inject({
        method: "GET",
        url: `/live-meetings/meeting-context/${randomUUID()}`
      });
      assert.equal(response.statusCode, 404);
    }
  } finally {
    await app.close();
  }
}

async function createTempUser(label: string) {
  const userId = randomUUID();
  tempUserIds.push(userId);
  await db.insert(users).values({
    id: userId,
    email: `sim-${label}-${userId}@orviko.local`,
    name: `Sim ${label}`
  });
  return userId;
}

async function createProfileDocument(userId: string, processingStatus: string, isActive: boolean, offsetMs: number, readyContext?: string) {
  const [profileDocument] = await db.insert(profileDocuments).values({
    userId,
    fileName: `${processingStatus}-${randomUUID()}.pdf`,
    filePath: `memory://${randomUUID()}.pdf`,
    processingStatus,
    processingError: processingStatus === "failed" ? "simulated failure" : null,
    readyContext: processingStatus === "ready" ? readyContext || "Ready context for simulation." : null,
    isActive,
    createdAt: new Date(Date.now() + offsetMs)
  }).returning();
  assert.ok(profileDocument);
  return profileDocument.id;
}

async function createMeetingContext(userId: string, profileDocumentId: string, contextName: string, meetingTopic: string, meetingBrief: string) {
  const [meetingContext] = await db.insert(meetingContexts).values({
    userId,
    profileDocumentId,
    contextName,
    meetingTopic,
    meetingBrief,
    meetingSummaryJson: {
      status: "success",
      result: {
        meetingSummary: meetingTopic,
        keyCriteria: [],
        responsibilities: [],
        niceToHave: [],
        domainProfile: {
          primaryDomain: meetingTopic,
          nicheDescription: meetingBrief,
          inScopeConcepts: [],
          outOfScopeConcepts: [],
          seedConcepts: [],
          relevanceGuidance: "Simulation"
        },
        preparationThemes: [],
        contextText: `${meetingTopic}: ${meetingBrief}`
      },
      warnings: [],
      missingInputs: [],
      confidence: "high",
      evidence: []
    },
    meetingContextText: `${meetingTopic}: ${meetingBrief}`,
    status: "active"
  }).returning();
  assert.ok(meetingContext);
  return meetingContext.id;
}

async function cleanup() {
  if (devMeetingContextIds.length) {
    await db.delete(meetingContexts).where(inArray(meetingContexts.id, devMeetingContextIds));
  }
  if (devProfileDocumentIds.length) {
    await db.delete(profileDocuments).where(inArray(profileDocuments.id, devProfileDocumentIds));
  }
  if (tempUserIds.length) {
    await db.delete(users).where(inArray(users.id, tempUserIds));
  }
}

async function cleanupKnownSimulationArtifacts() {
  await db.delete(users).where(like(users.email, "sim-%@orviko.local"));
  await db.delete(meetingContexts).where(and(
    eq(meetingContexts.userId, DEV_USER_ID),
    inArray(meetingContexts.contextName, ["Guard test", "Update test"])
  ));
  await db.delete(profileDocuments).where(and(
    eq(profileDocuments.userId, DEV_USER_ID),
    like(profileDocuments.filePath, "memory://%")
  ));
}
