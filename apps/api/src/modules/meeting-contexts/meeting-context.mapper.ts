import { meetingContextStatusSchema, type MeetingContext } from "@interview-app/shared";
import type { meetingContexts } from "../../db/schema/index.js";

type MeetingContextRow = typeof meetingContexts.$inferSelect;

export function mapMeetingContext(row: MeetingContextRow): MeetingContext {
  return {
    id: row.id,
    profileDocumentId: row.profileDocumentId,
    contextName: row.contextName,
    meetingTopic: row.meetingTopic,
    meetingBrief: row.meetingBrief,
    meetingSummaryJson: row.meetingSummaryJson,
    meetingContextText: row.meetingContextText,
    status: meetingContextStatusSchema.parse(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
