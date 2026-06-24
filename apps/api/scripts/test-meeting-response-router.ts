import { strict as assert } from "node:assert";
import {
  preprocessMeetingContextResultSchema,
  preprocessProfileDocumentResultSchema
} from "../src/modules/ai/action-schemas.js";
import { preprocessMeetingContextSpec } from "../src/modules/ai/actions/preprocessing/preprocess-meeting-context.js";
import { preprocessProfileDocumentSpec } from "../src/modules/ai/actions/preprocessing/preprocess-user-profile.js";
import { generateMeetingAnswerSpec } from "../src/modules/ai/actions/response/generate-meeting-response.js";
import { buildRealtimeResponseInstructions } from "../src/modules/ai/actions/realtime/realtime-meeting-session.js";
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

const realtimeResponseInstructions = buildRealtimeResponseInstructions(realtimeContext);
const realtimeInstructions = Object.values(realtimeResponseInstructions).join("\n");
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

assert.match(realtimeResponseInstructions.answer_qna, /Action: JAWAB_PERTANYAAN/);
assert.match(realtimeResponseInstructions.answer_qna, /produce a direct ready-to-say answer/i);
assert.match(realtimeResponseInstructions.answer_qna, /Forbidden live openers include Tentu, Baik, Oke, Berikut/);
assert.match(realtimeResponseInstructions.answer_convo, /Action: TANGGAPI/);
assert.match(realtimeResponseInstructions.answer_convo, /produce a natural response/i);
assert.match(realtimeResponseInstructions.answer_convo, /do not include question marks/i);
assert.match(realtimeResponseInstructions.answer_convo, /do not ask the other speaker or the user anything/i);
assert.match(realtimeResponseInstructions.answer_convo, /do not use the word 'apakah'/i);
assert.match(realtimeResponseInstructions.answer_convo, /self-check before final output/i);
assert.match(realtimeResponseInstructions.explain, /EXPLANATION_SOURCE LATEST_TRANSCRIPT/);
assert.match(realtimeResponseInstructions.explain_text, /EXPLANATION_SOURCE USER_TEXT/);
assert.match(realtimeResponseInstructions.explain_text, /current user-provided explanation subject as the primary subject/);
assert.match(realtimeResponseInstructions.followup, /Return 1-3 natural follow-up questions/);
assert.match(realtimeResponseInstructions.keyword, /Explain only the selected keyword/);
assert.match(realtimeResponseInstructions.surface_keywords, /Return exactly one line and nothing else: KEYWORDS:/);
assert.match(realtimeInstructions, /This response is stateless/);
assert.match(realtimeInstructions, /profile: User adalah peserta meeting/);
assert.match(realtimeInstructions, /meeting: General Meeting/);
assert.doesNotMatch(realtimeInstructions, /\bASK\b/);
assert.match(actionPolicy, /Do not explain causes, popularity, adoption/);
assert.match(actionPolicy, /The response is social meeting help, not factual analysis/);
assert.match(actionPolicy, /do not use a fixed example sentence/);
assert.match(actionPolicy, /do not propose research, checking collaborations, market validation/);
assert.match(actionPolicy, /do not use general knowledge to explain/);
assert.match(actionPolicy, /Do not transform a neutral artifact/);
assert.match(actionPolicy, /memeriksa apakah/);
assert.doesNotMatch(realtimeInstructions, /BANTU_JAWAB: produce a ready-to-say first-person response in 3-5 bullets/);
assert.match(realtimeInstructions, /headlines, reports, topic phrases, news-like narration/);
assert.match(realtimeInstructions, /Do not classify headlines, reports, news-like narration/);

assert.match(actionPolicy, /Default Convo response structure: acknowledge what the speaker said/);
assert.match(actionPolicy, /do not output follow-up questions by default/);
assert.match(actionPolicy, /For JAWAB_PERTANYAAN and legacy answer action in QnA mode, produce a direct ready-to-say answer/);
assert.match(actionPolicy, /Forbidden live openers include Tentu, Baik, Oke, Berikut/);
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
