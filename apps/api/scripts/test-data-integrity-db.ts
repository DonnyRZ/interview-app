import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";

process.env.OPENAI_API_KEY = "";

const { buildApp } = await import("../src/app.js");
const { db } = await import("../src/db/client.js");
const {
  meetingContexts,
  payments,
  profileDocuments,
  userProfiles,
  liveMeetingSessions,
  authSessions,
  oauthStates,
  users
} = await import("../src/db/schema/index.js");
const { DEV_USER_ID } = await import("../src/modules/dev/dev-user.js");
const { ensureDevUser } = await import("../src/modules/dev/dev-user.repository.js");
const {
  activateUserSubscription,
  GoogleAccountConflictError,
  upsertGoogleUser
} = await import("../src/modules/auth/auth.service.js");
const {
  consumeOAuthState,
  createOAuthState,
  createSessionForUser,
  getSession,
  OAUTH_BROWSER_COOKIE,
  revokeAllSessionsForUser,
  SESSION_COOKIE
} = await import("../src/modules/auth/session.js");
const {
  findLatestReadyProfileDocumentExcluding,
  setActiveProfileDocument
} = await import("../src/modules/profile-documents/profile-document.repository.js");
const {
  deleteProfileDocumentForUser,
  getActiveProfileDocumentForUser,
  getProfileDocumentListForUser,
  retryProfileDocumentProcessingForUser,
  setActiveProfileDocumentForUser
} = await import("../src/modules/profile-documents/profile-document.service.js");
const {
  endLiveMeetingSession,
  startLiveMeetingSession
} = await import("../src/modules/live-meetings/live-meeting.repository.js");
const { createPayment } = await import("../src/modules/payments/payment.repository.js");
const { handleLynkWebhook } = await import("../src/modules/payments/payment.service.js");
const {
  createMeetingContextForUser,
  deleteMeetingContextForUser,
  getMeetingContextForUser,
  getMeetingContextsForUser,
  updateMeetingContextForUser
} = await import("../src/modules/meeting-contexts/meeting-context.service.js");
const {
  deleteLiveMeetingSessionForUser,
  endLiveMeetingForUser,
  getLiveMeetingSessionsForUser,
  getRealtimeContextForLiveMeetingSessionForUser,
  startLiveMeetingForUser
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
    await simulateProfileDocumentServiceUsesSessionUser();
    await simulateMeetingContextServiceUsesSessionUser();
    await simulateLiveMeetingServiceUsesSessionUser();
    await simulateSessionEndIdempotency();
    await simulateOrphanSessionRecovery();
    await simulateLynkWebhookReusesPendingPayment();
    await simulateDbConstraints();
    await simulateDevServiceGuards();
  }
  await simulateSubscriptionQuotaLimits();
  await simulateAuthLifecycle();
  await simulateGoogleAccountLinking();
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
    (error) => errorChainContains(error, /profile_documents_one_active_per_user_idx|duplicate key/)
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

async function simulateProfileDocumentServiceUsesSessionUser() {
  const ownerUserId = await createTempUser("profile-owner");
  const otherUserId = await createTempUser("profile-other");
  const ownerProfileDocumentId = await createProfileDocument(ownerUserId, "ready", true, -2000);
  const otherProfileDocumentId = await createProfileDocument(otherUserId, "ready", true, -1000);

  const ownerDocuments = await getProfileDocumentListForUser(ownerUserId);
  assert.equal(ownerDocuments.length, 1);
  assert.equal(ownerDocuments[0]?.id, ownerProfileDocumentId);

  const activeOwnerDocument = await getActiveProfileDocumentForUser(ownerUserId);
  assert.equal(activeOwnerDocument?.id, ownerProfileDocumentId);

  const wrongSetActive = await setActiveProfileDocumentForUser(ownerUserId, otherProfileDocumentId);
  assert.equal(wrongSetActive, null);

  const wrongRetry = await retryProfileDocumentProcessingForUser(ownerUserId, otherProfileDocumentId);
  assert.equal(wrongRetry, null);

  const wrongDelete = await deleteProfileDocumentForUser(ownerUserId, otherProfileDocumentId);
  assert.equal(wrongDelete, null);

  const otherDocumentStillExists = await db.query.profileDocuments.findFirst({
    where: and(eq(profileDocuments.userId, otherUserId), eq(profileDocuments.id, otherProfileDocumentId))
  });
  assert.equal(otherDocumentStillExists?.id, otherProfileDocumentId);
}

async function simulateMeetingContextServiceUsesSessionUser() {
  const ownerUserId = await createTempUser("context-owner");
  const otherUserId = await createTempUser("context-other");
  const ownerProfileDocumentId = await createProfileDocument(ownerUserId, "ready", true, -2000, "Owner ready context");
  const otherProfileDocumentId = await createProfileDocument(otherUserId, "ready", true, -1000, "Other ready context");

  const created = await createMeetingContextForUser(ownerUserId, {
    contextName: "Interview Backend",
    meetingTopic: "Tokopedia - Interview",
    meetingBrief: "Fokus pada sistem desain dan kolaborasi lintas fungsi."
  });
  assert.equal(created.userId, ownerUserId);
  assert.equal(created.profileDocumentId, ownerProfileDocumentId);

  const ownerContexts = await getMeetingContextsForUser(ownerUserId);
  assert.equal(ownerContexts.length, 1);
  assert.equal(ownerContexts[0]?.id, created.id);

  const visibleToOtherUser = await getMeetingContextForUser(otherUserId, created.id);
  assert.equal(visibleToOtherUser, undefined);

  const wrongUpdate = await updateMeetingContextForUser(otherUserId, created.id, {
    meetingTopic: "Harus gagal"
  });
  assert.equal(wrongUpdate, null);

  await assert.rejects(
    updateMeetingContextForUser(ownerUserId, created.id, {
      profileDocumentId: otherProfileDocumentId
    }),
    /Meeting context profile document not found/
  );

  const wrongDelete = await deleteMeetingContextForUser(otherUserId, created.id);
  assert.equal(wrongDelete, null);

  const existingContext = await db.query.meetingContexts.findFirst({
    where: and(eq(meetingContexts.userId, ownerUserId), eq(meetingContexts.id, created.id))
  });
  assert.equal(existingContext?.id, created.id);
}

async function simulateLiveMeetingServiceUsesSessionUser() {
  const ownerUserId = await createTempUser("live-owner");
  const otherUserId = await createTempUser("live-other");
  const ownerProfileDocumentId = await createProfileDocument(ownerUserId, "ready", true, -2000, "Owner live ready context");
  const otherProfileDocumentId = await createProfileDocument(otherUserId, "ready", true, -1000, "Other live ready context");
  const ownerMeetingContextId = await createMeetingContext(ownerUserId, ownerProfileDocumentId, "Live owner", "Tokopedia - Interview", "Diskusi pengalaman produk.");
  const otherMeetingContextId = await createMeetingContext(otherUserId, otherProfileDocumentId, "Live other", "Gojek - Interview", "Diskusi kolaborasi.");

  await assert.rejects(
    startLiveMeetingForUser(ownerUserId, {
      meetingContextId: ownerMeetingContextId,
      sessionType: "OTHER"
    }),
    /Subscription Orviko belum aktif/
  );

  await activateUserSubscription({ userId: ownerUserId, plan: "starter" });
  await activateUserSubscription({ userId: otherUserId, plan: "starter" });

  const started = await startLiveMeetingForUser(ownerUserId, {
    meetingContextId: ownerMeetingContextId,
    sessionType: "OTHER"
  });
  assert.equal(started.session.userId, ownerUserId);
  assert.equal(started.session.meetingContextId, ownerMeetingContextId);

  const ownerSessions = await getLiveMeetingSessionsForUser(ownerUserId, ownerMeetingContextId);
  assert.equal(ownerSessions?.length, 1);
  assert.equal(ownerSessions?.[0]?.id, started.session.id);

  const hiddenFromOtherUser = await getLiveMeetingSessionsForUser(otherUserId, ownerMeetingContextId);
  assert.equal(hiddenFromOtherUser, null);

  const ownerRealtimeContext = await getRealtimeContextForLiveMeetingSessionForUser(ownerUserId, started.session.id);
  assert.equal(ownerRealtimeContext?.meetingContext.meetingTopic, "Tokopedia - Interview");

  const hiddenRealtimeContext = await getRealtimeContextForLiveMeetingSessionForUser(otherUserId, started.session.id);
  assert.equal(hiddenRealtimeContext, null);

  await assert.rejects(
    startLiveMeetingForUser(otherUserId, {
      meetingContextId: ownerMeetingContextId,
      sessionType: "OTHER"
    }),
    /Meeting context not found/
  );

  const wrongEnd = await endLiveMeetingForUser(otherUserId, started.session.id, {
    transcriptText: "Tidak boleh bisa mengakhiri sesi user lain."
  });
  assert.equal(wrongEnd, null);

  const sessionAfterWrongEnd = await db.query.liveMeetingSessions.findFirst({
    where: and(eq(liveMeetingSessions.userId, ownerUserId), eq(liveMeetingSessions.id, started.session.id))
  });
  assert.equal(sessionAfterWrongEnd?.endedAt, null);

  const wrongDelete = await deleteLiveMeetingSessionForUser(otherUserId, started.session.id);
  assert.equal(wrongDelete, null);

  const ended = await endLiveMeetingForUser(ownerUserId, started.session.id, {
    transcriptText: "Owner mengakhiri sesi sendiri."
  });
  assert.equal(ended?.id, started.session.id);
  assert.equal(ended?.transcriptText, "Owner mengakhiri sesi sendiri.");

  await assert.rejects(
    getRealtimeContextForLiveMeetingSessionForUser(ownerUserId, started.session.id),
    /sudah berakhir/
  );

  const deleted = await deleteLiveMeetingSessionForUser(ownerUserId, started.session.id);
  assert.equal(deleted?.id, started.session.id);

  const deletedFromDb = await db.query.liveMeetingSessions.findFirst({
    where: and(eq(liveMeetingSessions.userId, ownerUserId), eq(liveMeetingSessions.id, started.session.id))
  });
  assert.equal(deletedFromDb, undefined);

  const otherUserSessions = await getLiveMeetingSessionsForUser(otherUserId, otherMeetingContextId);
  assert.equal(otherUserSessions?.length, 0);
}

async function simulateSubscriptionQuotaLimits() {
  const miniUserId = await createTempUser("quota-mini");
  const miniProfileDocumentId = await createProfileDocument(miniUserId, "ready", true, -1000, "Mini quota ready context");
  const miniMeetingContextId = await createMeetingContext(miniUserId, miniProfileDocumentId, "Mini quota", "Tokopedia - Interview", "Mini limit test");
  await activateUserSubscription({ userId: miniUserId, plan: "mini" });

  const miniSessions = [];
  for (let index = 0; index < 3; index++) {
    miniSessions.push(await startLiveMeetingForUser(miniUserId, {
      meetingContextId: miniMeetingContextId,
      sessionType: "OTHER"
    }));
  }

  await assert.rejects(
    startLiveMeetingForUser(miniUserId, {
      meetingContextId: miniMeetingContextId,
      sessionType: "OTHER"
    }),
    /Kuota sesi live paket Mini/
  );

  await endLiveMeetingForUser(miniUserId, miniSessions[0]!.session.id, {
    transcriptText: "Mini quota session ended before delete."
  });
  await deleteLiveMeetingSessionForUser(miniUserId, miniSessions[0]!.session.id);

  await assert.rejects(
    startLiveMeetingForUser(miniUserId, {
      meetingContextId: miniMeetingContextId,
      sessionType: "OTHER"
    }),
    /Kuota sesi live paket Mini/
  );

  await sleep(5);
  await activateUserSubscription({ userId: miniUserId, plan: "mini" });
  const miniAfterRenewal = await startLiveMeetingForUser(miniUserId, {
    meetingContextId: miniMeetingContextId,
    sessionType: "OTHER"
  });
  assert.equal(miniAfterRenewal.session.userId, miniUserId);

  const starterUserId = await createTempUser("quota-starter");
  const starterProfileDocumentId = await createProfileDocument(starterUserId, "ready", true, -1000, "Starter quota ready context");
  const starterMeetingContextId = await createMeetingContext(starterUserId, starterProfileDocumentId, "Starter quota", "Bukalapak - Interview", "Starter limit test");
  await activateUserSubscription({ userId: starterUserId, plan: "starter" });
  for (let index = 0; index < 12; index++) {
    await startLiveMeetingForUser(starterUserId, {
      meetingContextId: starterMeetingContextId,
      sessionType: "OTHER"
    });
  }
  await assert.rejects(
    startLiveMeetingForUser(starterUserId, {
      meetingContextId: starterMeetingContextId,
      sessionType: "OTHER"
    }),
    /Kuota sesi live paket Starter/
  );

  const proUserId = await createTempUser("quota-pro");
  const proProfileDocumentId = await createProfileDocument(proUserId, "ready", true, -1000, "Pro quota ready context");
  const proMeetingContextId = await createMeetingContext(proUserId, proProfileDocumentId, "Pro quota", "Gojek - Interview", "Pro unlimited test");
  await activateUserSubscription({ userId: proUserId, plan: "pro" });
  for (let index = 0; index < 13; index++) {
    const session = await startLiveMeetingForUser(proUserId, {
      meetingContextId: proMeetingContextId,
      sessionType: "OTHER"
    });
    assert.equal(session.session.userId, proUserId);
  }

  const expiredUserId = await createTempUser("quota-expired");
  const expiredProfileDocumentId = await createProfileDocument(expiredUserId, "ready", true, -1000, "Expired quota ready context");
  const expiredMeetingContextId = await createMeetingContext(expiredUserId, expiredProfileDocumentId, "Expired quota", "Blibli - Interview", "Expired subscription test");
  await activateUserSubscription({ userId: expiredUserId, plan: "mini" });
  await db.update(users)
    .set({ subscriptionExpiresAt: new Date(Date.now() - 1000), updatedAt: new Date() })
    .where(eq(users.id, expiredUserId));
  await assert.rejects(
    startLiveMeetingForUser(expiredUserId, {
      meetingContextId: expiredMeetingContextId,
      sessionType: "OTHER"
    }),
    /Subscription Orviko belum aktif/
  );
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

  const recovered = await endLiveMeetingForUser(DEV_USER_ID, session.id, {
    transcriptText: "Recovered from stale live session."
  });
  assert.equal(recovered?.id, session.id);
  assert.ok(recovered?.endedAt);
  assert.equal(recovered?.transcriptText, "Recovered from stale live session.");

  const repeated = await endLiveMeetingForUser(DEV_USER_ID, session.id, {
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
    (error) => errorChainContains(error, /profile_documents_processing_status_check|violates check constraint/)
  );
  await assert.rejects(
    db.insert(meetingContexts).values({
      userId,
      profileDocumentId,
      contextName: "Invalid status",
      meetingTopic: "Invalid status",
      status: "deleted"
    }),
    (error) => errorChainContains(error, /meeting_contexts_status_check|violates check constraint/)
  );
  await assert.rejects(
    startLiveMeetingSession(userId, meetingContextId, "BROKEN" as never),
    (error) => errorChainContains(error, /live_meeting_sessions_session_type_check|violates check constraint/)
  );
}

async function simulateLynkWebhookReusesPendingPayment() {
  const userId = await createTempUser("lynk");
  const userEmail = `sim-lynk-${userId}@orviko.local`;
  const pendingPayment = await createPayment({
    userId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "starter",
    grossAmount: 98_000,
    customerEmail: userEmail,
    customerName: "Sim lynk",
    status: "pending"
  });

  const webhookPayload = {
    event_name: "Product Sold",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: userEmail,
      name: "Sim lynk"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  };

  const firstResult = await handleLynkWebhook(webhookPayload);
  assert.equal(firstResult.processed, true);
  assert.equal(firstResult.payment.id, pendingPayment.id);
  assert.equal(firstResult.payment.externalTransactionId, webhookPayload.trx_id);
  assert.equal(firstResult.payment.status, "settlement");

  await assert.rejects(
    createPayment({
      userId,
      orderId: `DUPLICATE-${randomUUID()}`,
      plan: "starter",
      grossAmount: 98_000,
      externalTransactionId: webhookPayload.trx_id,
      customerEmail: userEmail,
      customerName: "Sim lynk duplicate",
      status: "pending"
    }),
    (error) => errorChainContains(error, /payments_external_transaction_id_unique_idx|duplicate key/)
  );

  const userPayments = await db.query.payments.findMany({
    where: eq(payments.userId, userId)
  });
  assert.equal(userPayments.length, 1);

  const activatedUser = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  assert.equal(activatedUser?.subscriptionPlan, "starter");
  const firstExpiry = activatedUser?.subscriptionExpiresAt?.toISOString();
  assert.ok(firstExpiry);

  const secondResult = await handleLynkWebhook(webhookPayload);
  assert.equal(secondResult.processed, true);
  assert.equal(secondResult.payment.id, pendingPayment.id);

  const userAfterRepeat = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });
  assert.equal(userAfterRepeat?.subscriptionExpiresAt?.toISOString(), firstExpiry);

  const parallelUserId = await createTempUser("lynk-parallel");
  const parallelEmail = buildTempUserEmail("lynk-parallel", parallelUserId);
  const parallelPayment = await createPayment({
    userId: parallelUserId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "starter",
    grossAmount: 98_000,
    customerEmail: parallelEmail,
    customerName: "Sim lynk parallel",
    status: "pending"
  });
  const parallelWebhookPayload = {
    event_name: "Product Sold",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: parallelEmail,
      name: "Sim lynk parallel"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  };
  const parallelStartedAt = Date.now();
  const parallelResults = await Promise.all([
    handleLynkWebhook(parallelWebhookPayload),
    handleLynkWebhook(parallelWebhookPayload)
  ]);
  assert.equal(parallelResults.every((result) => result.processed), true);
  assert.equal(parallelResults.every((result) => result.payment.id === parallelPayment.id), true);

  const parallelUser = await db.query.users.findFirst({
    where: eq(users.id, parallelUserId)
  });
  assert.ok(parallelUser);
  assert.equal(parallelUser.subscriptionPlan, "starter");
  assert.ok(parallelUser.subscriptionExpiresAt);
  assert.ok(parallelUser.subscriptionExpiresAt.getTime() < parallelStartedAt + 31 * 24 * 60 * 60 * 1000);

  const replayOtherUserId = await createTempUser("lynk-replay-other");
  const replayOtherResult = await handleLynkWebhook({
    ...webhookPayload,
    customer: {
      email: buildTempUserEmail("lynk-replay-other", replayOtherUserId),
      name: "Sim lynk replay other"
    }
  });
  assert.equal(replayOtherResult.processed, false);

  const replayOtherUser = await db.query.users.findFirst({
    where: eq(users.id, replayOtherUserId)
  });
  assert.equal(replayOtherUser?.subscriptionPlan, "free");

  const missingTransactionUserId = await createTempUser("lynk-missing-transaction");
  const missingTransactionEmail = buildTempUserEmail("lynk-missing-transaction", missingTransactionUserId);
  await createPayment({
    userId: missingTransactionUserId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "starter",
    grossAmount: 98_000,
    customerEmail: missingTransactionEmail,
    customerName: "Sim lynk missing transaction",
    status: "pending"
  });
  const missingTransactionResult = await handleLynkWebhook({
    event_name: "Product Sold",
    id: `GENERIC-${randomUUID()}`,
    customer: {
      id: `CUSTOMER-${randomUUID()}`,
      email: missingTransactionEmail,
      name: "Sim lynk missing transaction"
    },
    product: {
      id: `PRODUCT-${randomUUID()}`,
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(missingTransactionResult.processed, false);

  const missingTransactionUser = await db.query.users.findFirst({
    where: eq(users.id, missingTransactionUserId)
  });
  assert.equal(missingTransactionUser?.subscriptionPlan, "free");

  const failedStatusUserId = await createTempUser("lynk-failed-status");
  const failedStatusEmail = buildTempUserEmail("lynk-failed-status", failedStatusUserId);
  await createPayment({
    userId: failedStatusUserId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "starter",
    grossAmount: 98_000,
    customerEmail: failedStatusEmail,
    customerName: "Sim lynk failed status",
    status: "pending"
  });
  const failedStatusResult = await handleLynkWebhook({
    event_name: "Payment",
    status: "not_successful",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: failedStatusEmail,
      name: "Sim lynk failed status"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(failedStatusResult.processed, false);

  const failedStatusUser = await db.query.users.findFirst({
    where: eq(users.id, failedStatusUserId)
  });
  assert.equal(failedStatusUser?.subscriptionPlan, "free");

  const misleadingNameUserId = await createTempUser("lynk-misleading-name");
  const misleadingNameEmail = buildTempUserEmail("lynk-misleading-name", misleadingNameUserId);
  await createPayment({
    userId: misleadingNameUserId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "starter",
    grossAmount: 98_000,
    customerEmail: misleadingNameEmail,
    customerName: "Sim lynk misleading",
    status: "pending"
  });

  const misleadingNameResult = await handleLynkWebhook({
    event_name: "Product Sold",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: misleadingNameEmail,
      name: "Sim lynk misleading"
    },
    product: {
      name: "Orviko Pro"
    },
    total_amount: 98_000
  });
  assert.equal(misleadingNameResult.processed, true);

  const misleadingNameUser = await db.query.users.findFirst({
    where: eq(users.id, misleadingNameUserId)
  });
  assert.equal(misleadingNameUser?.subscriptionPlan, "starter");

  const missingPendingUserId = await createTempUser("lynk-missing-pending");
  const missingPendingEmail = buildTempUserEmail("lynk-missing-pending", missingPendingUserId);
  const missingPendingResult = await handleLynkWebhook({
    event_name: "Product Sold",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: missingPendingEmail,
      name: "Sim lynk missing"
    },
    product: {
      name: "Orviko Starter"
    },
    total_amount: 98_000
  });
  assert.equal(missingPendingResult.processed, false);

  const missingPendingUser = await db.query.users.findFirst({
    where: eq(users.id, missingPendingUserId)
  });
  assert.equal(missingPendingUser?.subscriptionPlan, "free");

  const zeroAmountUserId = await createTempUser("lynk-zero-amount");
  const zeroAmountEmail = buildTempUserEmail("lynk-zero-amount", zeroAmountUserId);
  const zeroAmountPayment = await createPayment({
    userId: zeroAmountUserId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "mini",
    grossAmount: 0,
    customerEmail: zeroAmountEmail,
    customerName: "Sim lynk zero amount",
    status: "pending"
  });
  const zeroAmountResult = await handleLynkWebhook({
    event_name: "Product Sold",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: zeroAmountEmail,
      name: "Sim lynk zero amount"
    },
    product: {
      name: "Orviko Mini"
    },
    total_amount: 0
  });
  assert.equal(zeroAmountResult.processed, true);
  assert.equal(zeroAmountResult.payment.id, zeroAmountPayment.id);

  const zeroAmountUser = await db.query.users.findFirst({
    where: eq(users.id, zeroAmountUserId)
  });
  assert.equal(zeroAmountUser?.subscriptionPlan, "mini");

  const missingAmountUserId = await createTempUser("lynk-missing-amount");
  const missingAmountEmail = buildTempUserEmail("lynk-missing-amount", missingAmountUserId);
  await createPayment({
    userId: missingAmountUserId,
    orderId: `PENDING-${randomUUID()}`,
    plan: "mini",
    grossAmount: 0,
    customerEmail: missingAmountEmail,
    customerName: "Sim lynk missing amount",
    status: "pending"
  });
  const missingAmountResult = await handleLynkWebhook({
    event_name: "Product Sold",
    trx_id: `LYNK-${randomUUID()}`,
    customer: {
      email: missingAmountEmail,
      name: "Sim lynk missing amount"
    },
    product: {
      name: "Orviko Mini"
    }
  });
  assert.equal(missingAmountResult.processed, false);

  const missingAmountUser = await db.query.users.findFirst({
    where: eq(users.id, missingAmountUserId)
  });
  assert.equal(missingAmountUser?.subscriptionPlan, "free");
}

async function simulateDevServiceGuards() {
  await activateUserSubscription({ userId: DEV_USER_ID, plan: "starter" });

  const failedProfileDocumentId = await createProfileDocument(DEV_USER_ID, "failed", false, -3000);
  devProfileDocumentIds.push(failedProfileDocumentId);
  const failedProfileDocumentMeetingContextId = await createMeetingContext(DEV_USER_ID, failedProfileDocumentId, "Guard test", "Failed profile topic", "Brief");
  devMeetingContextIds.push(failedProfileDocumentMeetingContextId);

  await assert.rejects(
    startLiveMeetingForUser(DEV_USER_ID, { meetingContextId: failedProfileDocumentMeetingContextId, sessionType: "OTHER" }),
    /not ready/
  );

  const readyProfileDocumentId = await createProfileDocument(DEV_USER_ID, "ready", false, -2000);
  devProfileDocumentIds.push(readyProfileDocumentId);
  const updateMeetingContextId = await createMeetingContext(DEV_USER_ID, readyProfileDocumentId, "Update test", "Old topic", "Old brief");
  devMeetingContextIds.push(updateMeetingContextId);

  const updated = await updateMeetingContextForUser(DEV_USER_ID, updateMeetingContextId, {
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

  const switched = await updateMeetingContextForUser(DEV_USER_ID, updateMeetingContextId, {
    profileDocumentId: newerReadyProfileDocumentId
  });
  assert.equal(switched?.profileDocumentId, newerReadyProfileDocumentId);
  assert.deepEqual(switchedContextFingerprint(switched), contextBeforeProfileSwitch);

  const started = await startLiveMeetingForUser(DEV_USER_ID, {
    meetingContextId: updateMeetingContextId,
    sessionType: "OTHER"
  });
  assert.equal(started.realtimeContext.userProfileContext.readyContext, newerProfileDocumentReadyContext);
}

function switchedContextFingerprint(meetingContext: Awaited<ReturnType<typeof updateMeetingContextForUser>>) {
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
      assert.equal(response.statusCode, 401);
    }

    const profileListResponse = await app.inject({
      method: "GET",
      url: "/profile-documents/list"
    });
    assert.equal(profileListResponse.statusCode, 401);

    const activeProfileResponse = await app.inject({
      method: "GET",
      url: "/profile-documents/active"
    });
    assert.equal(activeProfileResponse.statusCode, 401);

    const meetingContextListResponse = await app.inject({
      method: "GET",
      url: "/meeting-contexts/"
    });
    assert.equal(meetingContextListResponse.statusCode, 401);

    const realtimeSecretResponse = await app.inject({
      method: "POST",
      url: "/live-meetings/realtime/client-secret",
      payload: {
        liveMeetingSessionId: randomUUID()
      }
    });
    assert.equal(realtimeSecretResponse.statusCode, 401);

    const freeUserId = await createTempUser("route-free");
    const freeUserProfileDocumentId = await createProfileDocument(freeUserId, "ready", true, -1000, "Free route ready context");
    const freeUserMeetingContextId = await createMeetingContext(
      freeUserId,
      freeUserProfileDocumentId,
      "Route free user",
      "Shopee - Interview",
      "Uji akses live meeting tanpa subscription aktif."
    );
    const freeUserCookie = await issueSessionCookie(freeUserId);

    const startWithoutSubscriptionResponse = await app.inject({
      method: "POST",
      url: "/live-meetings/start",
      headers: {
        cookie: freeUserCookie
      },
      payload: {
        meetingContextId: freeUserMeetingContextId,
        sessionType: "OTHER"
      }
    });
    assert.equal(startWithoutSubscriptionResponse.statusCode, 403);

    const realtimeSecretWithoutSubscriptionResponse = await app.inject({
      method: "POST",
      url: "/live-meetings/realtime/client-secret",
      headers: {
        cookie: freeUserCookie
      },
      payload: {
        liveMeetingSessionId: randomUUID()
      }
    });
    assert.equal(realtimeSecretWithoutSubscriptionResponse.statusCode, 403);

    const paidOwnerUserId = await createTempUser("route-paid-owner");
    const paidOtherUserId = await createTempUser("route-paid-other");
    const paidOwnerProfileDocumentId = await createProfileDocument(paidOwnerUserId, "ready", true, -1000, "Paid owner ready context");
    const paidOtherProfileDocumentId = await createProfileDocument(paidOtherUserId, "ready", true, -900, "Paid other ready context");
    const paidOwnerMeetingContextId = await createMeetingContext(
      paidOwnerUserId,
      paidOwnerProfileDocumentId,
      "Route paid owner",
      "Tokopedia - Interview",
      "Uji binding realtime ke live meeting session owner."
    );
    const paidOtherMeetingContextId = await createMeetingContext(
      paidOtherUserId,
      paidOtherProfileDocumentId,
      "Route paid other",
      "Traveloka - Interview",
      "Uji kepemilikan live meeting session user lain."
    );

    await activateUserSubscription({ userId: paidOwnerUserId, plan: "starter" });
    await activateUserSubscription({ userId: paidOtherUserId, plan: "starter" });

    const paidOwnerSession = await startLiveMeetingForUser(paidOwnerUserId, {
      meetingContextId: paidOwnerMeetingContextId,
      sessionType: "OTHER"
    });
    const paidOtherSession = await startLiveMeetingForUser(paidOtherUserId, {
      meetingContextId: paidOtherMeetingContextId,
      sessionType: "OTHER"
    });

    const paidOwnerCookie = await issueSessionCookie(paidOwnerUserId);

    const realtimeSecretWrongOwnerResponse = await app.inject({
      method: "POST",
      url: "/live-meetings/realtime/client-secret",
      headers: {
        cookie: paidOwnerCookie
      },
      payload: {
        liveMeetingSessionId: paidOtherSession.session.id
      }
    });
    assert.equal(realtimeSecretWrongOwnerResponse.statusCode, 404);

    await endLiveMeetingForUser(paidOwnerUserId, paidOwnerSession.session.id, {
      transcriptText: "Route paid owner session ended."
    });

    const realtimeSecretEndedSessionResponse = await app.inject({
      method: "POST",
      url: "/live-meetings/realtime/client-secret",
      headers: {
        cookie: paidOwnerCookie
      },
      payload: {
        liveMeetingSessionId: paidOwnerSession.session.id
      }
    });
    assert.equal(realtimeSecretEndedSessionResponse.statusCode, 400);

    const revokeAllResponse = await app.inject({
      method: "POST",
      url: "/auth/sessions/revoke-all",
      headers: {
        cookie: paidOwnerCookie
      }
    });
    assert.equal(revokeAllResponse.statusCode, 200);
    assert.ok(revokeAllResponse.json().revokedSessions >= 1);

    const revokedSessionResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: paidOwnerCookie
      }
    });
    assert.equal(revokedSessionResponse.statusCode, 401);

    const logoutCookie = await issueSessionCookie(paidOtherUserId);
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: logoutCookie
      }
    });
    assert.equal(logoutResponse.statusCode, 200);

    const loggedOutSessionResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: logoutCookie
      }
    });
    assert.equal(loggedOutSessionResponse.statusCode, 401);
  } finally {
    await cleanup();
    await app.close();
  }
}

function buildTempUserEmail(label: string, userId: string) {
  return `sim-${label}-${userId}@orviko.local`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorChainContains(error: unknown, pattern: RegExp) {
  let current = error;
  while (current && typeof current === "object") {
    const message = "message" in current ? String(current.message) : String(current);
    if (pattern.test(message)) {
      return true;
    }
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

async function createTempUser(label: string) {
  const userId = randomUUID();
  tempUserIds.push(userId);
  await db.insert(users).values({
    id: userId,
    email: buildTempUserEmail(label, userId),
    name: `Sim ${label}`
  });
  return userId;
}

async function issueSessionCookie(userId: string) {
  const session = await createSessionForUser(userId);
  return `${SESSION_COOKIE}=${session.token}`;
}

async function simulateAuthLifecycle() {
  const existingStateIds = new Set(
    (await db.select({ id: oauthStates.id }).from(oauthStates)).map((state) => state.id)
  );
  const userId = await createTempUser("auth-session");
  const firstSession = await createSessionForUser(userId);
  const secondSession = await createSessionForUser(userId);
  const firstRequest = {
    headers: { cookie: `${SESSION_COOKIE}=${firstSession.token}` }
  } as Parameters<typeof getSession>[0];
  assert.equal((await getSession(firstRequest))?.userId, userId);

  const revokedCount = await revokeAllSessionsForUser(userId);
  assert.equal(revokedCount, 2);
  assert.equal(await getSession(firstRequest), null);

  const responseHeaders = new Map<string, string | string[]>();
  const reply = {
    getHeader(name: string) {
      return responseHeaders.get(name);
    },
    header(name: string, value: string | string[]) {
      responseHeaders.set(name, value);
      return this;
    }
  } as Parameters<typeof createOAuthState>[0];

  const state = await createOAuthState(reply, "starter", "web-app");
  const setCookie = responseHeaders.get("Set-Cookie");
  const cookies = (Array.isArray(setCookie) ? setCookie : [setCookie || ""])
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean);
  const browserCookie = cookies.find((cookie) => cookie.startsWith(`${OAUTH_BROWSER_COOKIE}=`));
  assert.ok(browserCookie);

  const callbackRequest = {
    headers: { cookie: browserCookie }
  } as Parameters<typeof consumeOAuthState>[0];
  const callbackReply = {
    getHeader() {
      return undefined;
    },
    header() {
      return this;
    }
  } as Parameters<typeof consumeOAuthState>[1];

  const consumed = await consumeOAuthState(callbackRequest, callbackReply, state);
  assert.deepEqual(consumed, { plan: "starter", flow: "web-app" });
  assert.equal(await consumeOAuthState(callbackRequest, callbackReply, state), null);

  const storedSessionCount = await db.select().from(authSessions).where(eq(authSessions.userId, userId));
  assert.equal(storedSessionCount.length, 2);
  assert.ok(storedSessionCount.every((storedSession) => storedSession.tokenHash !== firstSession.token));
  const consumedStates = await db.select().from(oauthStates).where(eq(oauthStates.plan, "starter"));
  assert.ok(consumedStates.some((storedState) => storedState.consumedAt !== null));
  const createdStateIds = consumedStates
    .filter((storedState) => !existingStateIds.has(storedState.id))
    .map((storedState) => storedState.id);
  if (createdStateIds.length > 0) {
    await db.delete(oauthStates).where(inArray(oauthStates.id, createdStateIds));
  }
}

async function simulateGoogleAccountLinking() {
  const email = `sim-google-${randomUUID()}@orviko.local`;
  const created = await upsertGoogleUser({
    sub: `google-${randomUUID()}`,
    email,
    emailVerified: true,
    name: "Verified Google User"
  });
  tempUserIds.push(created.id);

  const refreshed = await upsertGoogleUser({
    sub: created.googleSub || "",
    email,
    emailVerified: true,
    name: "Updated Google User"
  });
  assert.equal(refreshed.id, created.id);
  assert.equal(refreshed.name, "Updated Google User");

  await assert.rejects(
    upsertGoogleUser({
      sub: `different-google-${randomUUID()}`,
      email,
      emailVerified: true,
      name: "Conflicting Google User"
    }),
    GoogleAccountConflictError
  );

  await assert.rejects(
    upsertGoogleUser({
      sub: `unverified-${randomUUID()}`,
      email: `unverified-${randomUUID()}@orviko.local`,
      emailVerified: false,
      name: "Unverified Google User"
    }),
    /belum terverifikasi/
  );
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
