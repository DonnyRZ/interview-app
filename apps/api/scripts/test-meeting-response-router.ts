import { strict as assert } from "node:assert";
import {
  preprocessMeetingContextResultSchema,
  preprocessProfileDocumentResultSchema
} from "../src/modules/ai/action-schemas.js";
import { preprocessMeetingContextSpec } from "../src/modules/ai/actions/preprocessing/preprocess-meeting-context.js";
import { preprocessProfileDocumentSpec } from "../src/modules/ai/actions/preprocessing/preprocess-user-profile.js";
import { generateMeetingAnswerSpec } from "../src/modules/ai/actions/response/generate-meeting-response.js";
import { buildRealtimeMeetingSessionInstructions } from "../src/modules/ai/actions/realtime/realtime-meeting-session.js";
import { buildPrompt } from "../src/modules/ai/prompt-builder.js";
import type { RealtimeContext } from "@interview-app/shared";

const convoFixtures = [
  "Tim kami sebenarnya sudah cukup overwhelmed dengan kerjaan yang ada.",
  "Masalahnya data kami masih berantakan dan tersebar di banyak file.",
  "Proposal sebelumnya sebenarnya bagus, tapi terlalu kompleks buat tim kami.",
  "AI menarik sih, tapi kami masih agak ragu soal implementasinya.",
  "Keputusan ini harus sudah clear minggu ini."
];

const realtimeContext: RealtimeContext = {
  userProfileContext: {
    summary: "User adalah peserta meeting.",
    readyContext: "Gunakan profil sebagai konteks ringan saja.",
    skills: [],
    relevantExperience: [],
    experiences: [],
    education: [],
    organizations: [],
    internships: [],
    usefulStrengths: [],
    risks: []
  },
  meetingContext: {
    contextName: "General Meeting",
    meetingTopic: "Online meeting",
    meetingSummary: "Sesi meeting umum tanpa domain khusus.",
    keyCriteria: [],
    responsibilities: [],
    niceToHave: [],
    preparationThemes: [],
    contextText: "Meeting umum lintas topik."
  },
  domainProfile: {
    primaryDomain: "General online meeting",
    nicheDescription: "Percakapan meeting umum.",
    inScopeConcepts: [],
    outOfScopeConcepts: [],
    seedConcepts: [],
    relevanceGuidance: "Transcript-first."
  },
  sessionContext: {
    sessionType: "OTHER",
    focus: []
  }
};

const realtimeInstructions = buildRealtimeMeetingSessionInstructions(realtimeContext);
const actionPolicy = generateMeetingAnswerSpec.policyRules.join("\n");
const userProfilePrompt = buildPrompt(preprocessProfileDocumentSpec, {
  fileName: "profile.pdf",
  fileMimeType: "application/pdf"
});
const meetingContextPrompt = buildPrompt(preprocessMeetingContextSpec, {
  contextName: "General Meeting",
  meetingTopic: "Planning",
  meetingBrief: "Brief meeting umum.",
  profileDocumentReadyContext: "Profil aktif tersedia."
});

assert.match(realtimeInstructions, /JAWAB_PERTANYAAN must use QnA mode rules/);
assert.match(realtimeInstructions, /TANGGAPI must use Convo mode rules/);
assert.match(realtimeInstructions, /Do not override JAWAB_PERTANYAAN or TANGGAPI/);
assert.match(realtimeInstructions, /For JAWAB_PERTANYAAN and legacy answer action in QnA mode, produce a direct ready-to-say answer/);
assert.match(realtimeInstructions, /Do not use meta-intro openers such as Berikut/);
assert.match(realtimeInstructions, /For TANGGAPI and legacy answer action in Convo mode, produce a natural response/);
assert.match(realtimeInstructions, /TANGGAPI and legacy answer action \+ Convo mode: do not output follow-up questions by default/);
assert.match(realtimeInstructions, /TANGGAPI and legacy answer action \+ Convo mode: do not include question marks/);
assert.match(realtimeInstructions, /do not ask the other speaker or the user anything/);
assert.match(realtimeInstructions, /TANGGAPI and legacy answer action \+ Convo mode: return bullets only/);
assert.match(realtimeInstructions, /every output line must start with '- '/);
assert.match(realtimeInstructions, /bagaimana jika/);
assert.match(realtimeInstructions, /Mungkin kita bisa/);
assert.match(realtimeInstructions, /melihat apakah/);
assert.match(realtimeInstructions, /starts a bullet with 'Mungkin', 'Ada baiknya', 'Langkah'/);
assert.match(realtimeInstructions, /self-check every bullet/);
assert.match(realtimeInstructions, /external trends, popularity, market movement, or industry adoption/);
assert.match(realtimeInstructions, /many people doing X in place Y/);
assert.match(actionPolicy, /Do not explain causes, popularity, adoption/);
assert.match(actionPolicy, /The response is social meeting help, not factual analysis/);
assert.match(actionPolicy, /do not use a fixed example sentence/);
assert.match(realtimeInstructions, /casual observations should stay conversational and grounded/);
assert.match(realtimeInstructions, /Critical Convo guard/);
assert.match(realtimeInstructions, /must never contain the word 'apakah'/);
assert.match(realtimeInstructions, /Critical non-bias guard/);
assert.match(actionPolicy, /do not propose research, checking collaborations, market validation/);
assert.match(actionPolicy, /do not use general knowledge to explain/);
assert.match(actionPolicy, /Do not transform a neutral artifact/);
assert.match(actionPolicy, /memeriksa apakah/);
assert.doesNotMatch(realtimeInstructions, /BANTU_JAWAB: produce a ready-to-say first-person response in 3-5 bullets/);
assert.match(realtimeInstructions, /headline, update, report, observation, or concern/);
assert.match(realtimeInstructions, /headlines, reports, topic phrases, news-like narration/);
assert.match(realtimeInstructions, /Do not classify headlines, reports, news-like narration/);

assert.match(actionPolicy, /Default Convo response structure: acknowledge what the speaker said/);
assert.match(actionPolicy, /do not output follow-up questions by default/);
assert.match(actionPolicy, /For JAWAB_PERTANYAAN and legacy answer action in QnA mode, produce a direct ready-to-say answer/);
assert.match(actionPolicy, /Do not use meta-intro openers such as Berikut/);
assert.doesNotMatch(realtimeInstructions, /interview|candidate|kandidat|interviewer|CV|JD|BANTU_JAWAB|sales|client|vendor|hiring/i);
assert.doesNotMatch(actionPolicy, /interview|candidate|kandidat|interviewer|CV|JD|BANTU_JAWAB|sales|client|vendor|hiring/i);
assert.doesNotMatch(`${userProfilePrompt.systemInstructions}\n${userProfilePrompt.assembledPrompt}`, /candidate|kandidat|CV|interview|BANTU_JAWAB/i);
assert.doesNotMatch(`${meetingContextPrompt.systemInstructions}\n${meetingContextPrompt.assembledPrompt}`, /candidate|kandidat|CV|JD|interview|BANTU_JAWAB/i);
assert.equal(preprocessProfileDocumentResultSchema.parse({
  status: "success",
  result: {
    userProfileSummary: "Ringkasan profil user.",
    skills: [],
    relevantExperience: [],
    experiences: [],
    education: [],
    organizations: [],
    internships: [],
    usefulStrengths: ["Komunikasi jelas"],
    risks: [],
    readyContext: "Konteks siap."
  },
  warnings: [],
  missingInputs: [],
  confidence: "high",
  evidence: []
}).result.userProfileSummary, "Ringkasan profil user.");
assert.deepEqual(preprocessMeetingContextResultSchema.parse({
  status: "success",
  result: {
    meetingSummary: "Ringkasan meeting.",
    keyCriteria: ["Prioritas jelas"],
    responsibilities: [],
    niceToHave: [],
    domainProfile: {
      primaryDomain: "",
      nicheDescription: "",
      inScopeConcepts: [],
      outOfScopeConcepts: [],
      seedConcepts: [],
      relevanceGuidance: ""
    },
    preparationThemes: ["Siapkan konteks"],
    contextText: "Konteks sesi."
  },
  warnings: [],
  missingInputs: [],
  confidence: "medium",
  evidence: []
}).result.keyCriteria, ["Prioritas jelas"]);

for (const fixture of convoFixtures) {
  assert.ok(fixture.length > 20, "Convo fixtures should be realistic meeting statements.");
  assert.doesNotMatch(fixture, /\?/, "Convo fixtures should not be direct questions.");
}

console.log("Meeting response router tests passed.");
