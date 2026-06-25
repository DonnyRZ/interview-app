import type { EndLiveMeetingRequest, MeetingSessionType, StartLiveMeetingRequest } from "@interview-app/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { liveMeetingSessions, liveMeetingUsageEvents, subscriptions, usageEvents, users } from "../../db/schema/index.js";
import { env } from "../../env.js";
import {
  SubscriptionQuotaExceededError,
  SubscriptionRequiredError
} from "../auth/auth.service.js";
import { findMeetingContextById } from "../meeting-contexts/meeting-context.repository.js";
import { findProfileDocumentById } from "../profile-documents/profile-document.repository.js";
import { planCatalog, planSlugSchema } from "../payments/plan-catalog.js";
import {
  deleteLiveMeetingSession,
  endLiveMeetingSession,
  findLiveMeetingSessionById,
  listLiveMeetingSessions,
} from "./live-meeting.repository.js";
import { buildRealtimeContext, compactRealtimeContextForLiveSession } from "./realtime-context.js";

async function loadMeetingRealtimeContextDependencies(userId: string, meetingContextId: string) {
  const meetingContext = await findMeetingContextById(userId, meetingContextId);
  if (!meetingContext) {
    throw new Error("Meeting context not found");
  }

  const profileDocument = await findProfileDocumentById(userId, meetingContext.profileDocumentId);
  if (!profileDocument) {
    throw new Error("Meeting context profile document not found.");
  }
  if (profileDocument.processingStatus !== "ready") {
    throw new Error("Meeting context profile document is not ready yet. Wait for AI processing or retry profile processing.");
  }

  return {
    meetingContext,
    profileDocument
  };
}

export async function getLiveMeetingSessionsForUser(
  userId: string,
  meetingContextId: string,
  pagination?: { limit: number; offset: number }
) {
  const meetingContext = await findMeetingContextById(userId, meetingContextId);
  if (!meetingContext) {
    return null;
  }

  return listLiveMeetingSessions(userId, meetingContextId, pagination);
}

export async function startLiveMeetingForUser(
  userId: string,
  input: StartLiveMeetingRequest
) {
  const { meetingContext, profileDocument } = await loadMeetingRealtimeContextDependencies(userId, input.meetingContextId);

  const session = await db.transaction(async (tx) => {
    const [lockedUser] = await tx.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");

    if (!lockedUser) {
      throw new Error("User tidak ditemukan.");
    }

    const [activeSubscription] = await tx.select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      ))
      .limit(1)
      .for("update");

    if (!activeSubscription || activeSubscription.currentPeriodEndsAt <= new Date()) {
      throw new SubscriptionRequiredError();
    }

    const [activeLiveMeetingCount] = await tx.select({ total: count() })
      .from(liveMeetingSessions)
      .where(and(
        eq(liveMeetingSessions.userId, userId),
        isNull(liveMeetingSessions.endedAt)
      ));
    if ((activeLiveMeetingCount?.total || 0) >= env.MAX_CONCURRENT_LIVE_MEETINGS) {
      throw new Error("Masih ada sesi live yang aktif. Akhiri sesi tersebut sebelum memulai sesi baru.");
    }

    const parsedPlan = planSlugSchema.safeParse(activeSubscription.plan);
    if (!parsedPlan.success) {
      throw new SubscriptionRequiredError();
    }

    const usagePlan = parsedPlan.data;
    const usagePeriodStartedAt = activeSubscription.currentPeriodStartedAt;
    const catalogItem = planCatalog[usagePlan];
    if (catalogItem.liveSessionLimit !== null) {
      const [usage] = await tx.select({ total: count() })
        .from(liveMeetingUsageEvents)
        .where(and(
          eq(liveMeetingUsageEvents.userId, userId),
          eq(liveMeetingUsageEvents.periodStartedAt, usagePeriodStartedAt)
        ));

      if ((usage?.total || 0) >= catalogItem.liveSessionLimit) {
        throw new SubscriptionQuotaExceededError(`Kuota sesi live paket ${catalogItem.name} sudah habis untuk periode ini.`);
      }
    }

    const [createdSession] = await tx.insert(liveMeetingSessions).values({
      userId,
      meetingContextId: input.meetingContextId,
      sessionType: input.sessionType
    }).returning();

    if (!createdSession) {
      throw new Error("Failed to start live meeting session");
    }

    await tx.insert(liveMeetingUsageEvents).values({
      userId,
      liveMeetingSessionId: createdSession.id,
      plan: usagePlan,
      periodStartedAt: usagePeriodStartedAt
    });

    return createdSession;
  });

  const realtimeContext = buildRealtimeContext({
    profileDocument,
    meetingContext,
    sessionType: input.sessionType
  });

  return {
    session,
    realtimeContext: compactRealtimeContextForLiveSession(realtimeContext)
  };
}

export async function getRealtimeContextForLiveMeetingSessionForUser(userId: string, liveMeetingSessionId: string) {
  const liveMeetingSession = await findLiveMeetingSessionById(userId, liveMeetingSessionId);
  if (!liveMeetingSession) {
    return null;
  }

  if (liveMeetingSession.endedAt) {
    throw new Error("Live meeting session sudah berakhir.");
  }
  if (isLiveMeetingExpired(liveMeetingSession.startedAt)) {
    throw new Error(`Live meeting session melewati batas ${env.MAX_LIVE_MEETING_MINUTES} menit.`);
  }

  const { meetingContext, profileDocument } = await loadMeetingRealtimeContextDependencies(
    userId,
    liveMeetingSession.meetingContextId
  );

  return compactRealtimeContextForLiveSession(buildRealtimeContext({
    profileDocument,
    meetingContext,
    sessionType: liveMeetingSession.sessionType as MeetingSessionType
  }));
}

export async function assertRealtimeClientSecretAllowed(userId: string, liveMeetingSessionId: string) {
  const liveMeetingSession = await findLiveMeetingSessionById(userId, liveMeetingSessionId);
  if (!liveMeetingSession) {
    return null;
  }
  if (liveMeetingSession.endedAt) {
    throw new Error("Live meeting session sudah berakhir.");
  }
  if (isLiveMeetingExpired(liveMeetingSession.startedAt)) {
    throw new Error(`Live meeting session melewati batas ${env.MAX_LIVE_MEETING_MINUTES} menit.`);
  }

  const [issuedSecrets] = await db.select({ total: count() })
    .from(usageEvents)
    .where(and(
      eq(usageEvents.userId, userId),
      eq(usageEvents.liveMeetingSessionId, liveMeetingSessionId),
      eq(usageEvents.capability, "realtime_client_secret"),
      eq(usageEvents.requestStatus, "success")
    ));
  if ((issuedSecrets?.total || 0) >= env.REALTIME_CLIENT_SECRET_LIMIT_PER_SESSION) {
    throw new Error("Batas penerbitan realtime client secret untuk sesi ini sudah tercapai.");
  }

  return liveMeetingSession;
}

export async function endLiveMeetingForUser(userId: string, liveMeetingSessionId: string, input: EndLiveMeetingRequest) {
  const existingRound = await findLiveMeetingSessionById(userId, liveMeetingSessionId);
  if (!existingRound) {
    return null;
  }

  return endLiveMeetingSession(userId, liveMeetingSessionId, input.transcriptText);
}

export async function deleteLiveMeetingSessionForUser(userId: string, liveMeetingSessionId: string) {
  const existingRound = await findLiveMeetingSessionById(userId, liveMeetingSessionId);
  if (!existingRound) {
    return null;
  }

  if (!existingRound.endedAt) {
    throw new Error("Live meeting session cannot be deleted. End the meeting first.");
  }

  return deleteLiveMeetingSession(userId, liveMeetingSessionId);
}

function isLiveMeetingExpired(startedAt: Date) {
  return Date.now() - startedAt.getTime() > env.MAX_LIVE_MEETING_MINUTES * 60 * 1000;
}
