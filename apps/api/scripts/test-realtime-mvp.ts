import assert from "node:assert/strict";
import {
  generateMeetingAnswerRequestSchema,
  type RealtimeContext
} from "@interview-app/shared";
import {
  buildRealtimeMeetingSessionInstructions,
  buildRealtimeResponseInstructions
} from "../src/modules/ai/actions/realtime/realtime-meeting-session.js";
import { compactRealtimeContextForLiveSession } from "../src/modules/live-meetings/realtime-context.js";

const context: RealtimeContext = {
  userProfileContext: {
    summary: "Product manager dengan pengalaman marketplace.",
    readyContext: "Berpengalaman memimpin discovery dan delivery lintas fungsi.",
    skills: ["product strategy", "stakeholder management"],
    relevantExperience: ["Memimpin peluncuran fitur checkout"],
    experiences: [],
    education: [],
    organizations: [],
    internships: [],
    usefulStrengths: ["komunikasi terstruktur"],
    risks: ["jangan mengarang angka dampak"]
  },
  meetingContext: {
    contextName: "Contoso",
    meetingTopic: "Product Review",
    meetingSummary: "Membahas prioritas dan risiko roadmap.",
    keyCriteria: ["prioritization"],
    responsibilities: ["product delivery"],
    niceToHave: [],
    preparationThemes: ["trade-off"],
    contextText: "Fokus pada keputusan roadmap kuartal berikutnya."
  },
  domainProfile: {
    primaryDomain: "Product Management",
    nicheDescription: "Marketplace product delivery",
    inScopeConcepts: ["roadmap", "prioritization"],
    outOfScopeConcepts: [],
    seedConcepts: ["trade-off"],
    relevanceGuidance: "Gunakan hanya jika relevan dengan focus terbaru."
  },
  sessionContext: {
    sessionType: "OTHER",
    focus: ["clarification", "next steps"]
  }
};

const compactContext = compactRealtimeContextForLiveSession(context);
const sessionInstructions = buildRealtimeMeetingSessionInstructions();
const responseInstructions = buildRealtimeResponseInstructions(compactContext);

assert.match(sessionInstructions, /Every explicit response is stateless/i);
assert.match(sessionInstructions, /Do not use earlier audio/i);
assert.ok(sessionInstructions.length < 1_000, "transcription session instructions must stay compact");
for (const instructions of Object.values(responseInstructions)) {
  assert.match(instructions, /Product manager dengan pengalaman marketplace/);
  assert.match(instructions, /Contoso/);
  assert.match(instructions, /Product Review/);
  assert.match(instructions, /Product Management/);
  assert.match(instructions, /BEGIN_STATIC_CONTEXT_DATA/);
}
assert.match(responseInstructions.answer_qna, /This response is stateless/i);
assert.match(responseInstructions.answer_qna, /Never use older audio/i);
assert.match(responseInstructions.answer_qna, /Action: JAWAB_PERTANYAAN/);
assert.match(responseInstructions.answer_convo, /Action: TANGGAPI/);
assert.match(responseInstructions.surface_keywords, /Return exactly one line/i);
assert.ok(
  responseInstructions.surface_keywords.length < responseInstructions.answer_qna.length,
  "automatic keyword extraction must use a smaller policy than user-triggered help"
);

const parsedAnswerRequest = generateMeetingAnswerRequestSchema.parse({
  meetingPrompt: "Apa prioritas roadmap berikutnya?",
  recentTranscript: "Percakapan lama yang tidak boleh menjadi input MVP.",
  realtimeContext: compactContext
});
assert.equal("recentTranscript" in parsedAnswerRequest, false);
assert.equal(parsedAnswerRequest.realtimeContext.userProfileContext.summary, compactContext.userProfileContext.summary);

console.log("API realtime MVP contract tests passed.");
