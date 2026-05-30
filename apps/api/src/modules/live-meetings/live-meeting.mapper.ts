import type { LiveMeetingSession, MeetingSessionType } from "@interview-app/shared";
import type { liveMeetingSessions } from "../../db/schema/index.js";

type LiveMeetingSessionRow = typeof liveMeetingSessions.$inferSelect;

export function mapLiveMeetingSession(row: LiveMeetingSessionRow): LiveMeetingSession {
  return {
    id: row.id,
    meetingContextId: row.meetingContextId,
    sessionType: row.sessionType as MeetingSessionType,
    transcriptText: row.transcriptText,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString()
  };
}
