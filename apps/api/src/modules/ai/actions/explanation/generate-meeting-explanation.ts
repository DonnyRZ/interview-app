import type { RealtimeContext } from "@interview-app/shared";
import type { ActionSpec } from "../../action-types.js";
import {
  meetingResponseCommonRules,
  meetingResponseJsonRules
} from "../response/meeting-response-common.js";
import { formatMeetingContextForPrompt, meetingContextUsagePolicy } from "../shared/meeting-context-format.js";

export type GenerateInterviewExplanationInput = {
  interviewerQuestion: string;
  recentTranscript?: string;
  realtimeContext: RealtimeContext;
};

export const generateInterviewExplanationSpec: ActionSpec<GenerateInterviewExplanationInput> = {
  actionId: "generate_meeting_explanation",
  version: "2026-05-27.v1",
  goal: "Menjelaskan maksud lawan bicara secara singkat agar user paham konteks dan bisa merespons dengan tepat.",
  role: "Kamu adalah assistant penjelas meeting untuk user saat online meeting.",
  task: [
    "Baca latest meeting focus dan recentTranscript.",
    "Jelaskan secara singkat maksud, sinyal, atau implikasi dari ucapan lawan bicara.",
    "Sebutkan 1-3 hal yang kemungkinan perlu diperhatikan user.",
    "Pilih sumber konteks yang paling tepat: latest conversation, general knowledge, user profile, meeting context, atau gabungan yang aman.",
    "Berikan angle respons aman agar user bisa merespons dengan tepat tanpa mengarang."
  ].join("\n"),
  policyRules: [
    ...meetingContextUsagePolicy,
    ...meetingResponseCommonRules,
    "Penjelasan harus ringkas, natural, dan mudah discan cepat di overlay.",
    "Jangan mengklaim pengalaman, angka, tools, organisasi, atau pencapaian yang tidak ada di runtime context.",
    "Jelaskan statement, reaksi, debat, concern, feedback, atau implied question meskipun kalimat lawan bicara bukan pertanyaan formal.",
    "Jika ucapan lawan bicara tidak cukup jelas, jelaskan ketidakjelasannya secara aman dan sarankan klarifikasi singkat.",
    "Prioritaskan 2-4 poin total yang pendek, bukan penjelasan panjang.",
    ...meetingResponseJsonRules
  ],
  outputSchemaDescription: `Balas hanya dengan JSON valid:
{
  "status": "success | partial | insufficient_input | needs_human_review | failed_policy",
  "result": {
    "meaningSummary": "penjelasan singkat maksud lawan bicara",
    "signals": ["maksimal 3 hal yang perlu diperhatikan user"],
    "answerAngle": "arah jawaban aman dan singkat"
  },
  "warnings": ["string"],
  "missingInputs": ["string"],
  "confidence": "low | medium | high",
  "evidence": [{ "field": "string", "source": "string", "quote": "string" }]
}`,
  buildContext: (input) => `Runtime payload:
- latestMeetingFocus:
${input.interviewerQuestion.trim() || "unknown"}

- recentTranscript:
${input.recentTranscript?.trim() || "unknown"}

${formatMeetingContextForPrompt(input.realtimeContext)}`
};
