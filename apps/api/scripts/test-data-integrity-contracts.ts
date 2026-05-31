import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  meetingContextStatusSchema,
  updateMeetingContextRequestSchema
} from "../../../packages/shared/src/schemas/meeting-context.schema.js";
import { meetingSessionTypeSchema } from "../../../packages/shared/src/schemas/live-meeting.schema.js";

const migrationSql = readFileSync(new URL("../migrations/0000_fixed_wind_dancer.sql", import.meta.url), "utf8");

assert.deepEqual(meetingContextStatusSchema.options, ["active", "archived"]);
assert.deepEqual(meetingSessionTypeSchema.options, ["HR", "TECHNICAL", "USER", "FINAL", "OTHER"]);
assert.equal(updateMeetingContextRequestSchema.safeParse({ status: "active" }).success, true);
assert.equal(updateMeetingContextRequestSchema.safeParse({ status: "archived" }).success, true);
assert.equal(updateMeetingContextRequestSchema.safeParse({ status: "deleted" }).success, false);
assert.equal(updateMeetingContextRequestSchema.safeParse({ profileDocumentId: "00000000-0000-4000-8000-000000000001" }).success, true);
assert.equal(updateMeetingContextRequestSchema.safeParse({ profileDocumentId: "not-a-uuid" }).success, false);

assert.match(migrationSql, /CREATE TABLE "profile_documents"/);
assert.match(migrationSql, /CREATE TABLE "user_profiles"/);
assert.match(migrationSql, /CREATE TABLE "meeting_contexts"/);
assert.match(migrationSql, /CREATE TABLE "live_meeting_sessions"/);
assert.match(migrationSql, /"profile_document_id" uuid NOT NULL/);
assert.match(migrationSql, /"meeting_brief" text/);
assert.match(migrationSql, /"meeting_summary_json" jsonb/);
assert.match(migrationSql, /"session_type" text NOT NULL/);
assert.match(migrationSql, /profile_documents_one_active_per_user_idx/);
assert.match(migrationSql, /profile_documents_processing_status_check/);
assert.match(migrationSql, /meeting_contexts_status_check/);
assert.match(migrationSql, /live_meeting_sessions_session_type_check/);
assert.doesNotMatch(migrationSql, /candidate_cvs|candidate_profiles|applications|interview_rounds|job_description|job_summary_json|stage_type/);

console.log("Data integrity contract tests passed.");
