import assert from "node:assert/strict";
import type { MeetingContext, ProfileDocument } from "@interview-app/shared";
import {
  getProfileStatusTitle,
  getProfileSummary,
  mapWorkspaceMeetingContext
} from "../src/features/workspace/workspace-model.js";

const profile: ProfileDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  fileName: "dynamic-profile.pdf",
  fileMimeType: "application/pdf",
  summaryJson: { result: { userProfileSummary: "Dynamic profile summary sentinel." } },
  readyContext: "Fallback ready context.",
  processingStatus: "ready",
  processingError: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z"
};

const meetingContext: MeetingContext = {
  id: "22222222-2222-4222-8222-222222222222",
  profileDocumentId: profile.id,
  contextName: "Dynamic Context",
  meetingTopic: "Dynamic Topic",
  meetingBrief: "Dynamic brief sentinel.",
  meetingSummaryJson: {
    result: {
      meetingSummary: "Dynamic meeting summary sentinel.",
      preparationThemes: ["Theme one", "Theme two"],
      domainProfile: {
        primaryDomain: "Dynamic domain",
        nicheDescription: "Dynamic focus sentinel."
      }
    }
  },
  meetingContextText: "Fallback context text.",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

assert.equal(getProfileSummary(profile), "Dynamic profile summary sentinel.");
assert.equal(getProfileStatusTitle(profile), "AI Ready");

const mapped = mapWorkspaceMeetingContext(meetingContext);
assert.equal(mapped.id, meetingContext.id);
assert.equal(mapped.profileDocumentId, profile.id);
assert.equal(mapped.summary, "Dynamic meeting summary sentinel.");
assert.equal(mapped.focus, "Dynamic focus sentinel.");
assert.deepEqual(mapped.preparationThemes, ["Theme one", "Theme two"]);

const fallback = mapWorkspaceMeetingContext({
  ...meetingContext,
  meetingSummaryJson: null,
  meetingContextText: null,
  meetingBrief: null
});
assert.equal(fallback.summary, "Ringkasan meeting belum tersedia.");
assert.equal(fallback.meetingBriefDisplay, "Brief meeting belum ditambahkan.");
assert.deepEqual(fallback.preparationThemes, []);

console.log("Web workspace model tests passed.");
