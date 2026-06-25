export const meetingQnaAnswerFormatRules = [
  "For JAWAB_PERTANYAAN and legacy answer action in QnA mode, produce a direct ready-to-say answer.",
  "Use the safest useful answer shape for the question: direct answer, structured reasoning, trade-off, clarification, or next-step proposal.",
  "For live realtime JAWAB_PERTANYAAN, output 2-4 concise bullet lines only; the first character of the response must be '-'.",
  "Use 3-5 concise bullets when the non-live answer has multiple parts.",
  "Start directly with the answer, not with the trigger name or a coaching phrase.",
  "Do not use polite acknowledgements, meta-intro, persona framing, or AI framing before the answer.",
  "Forbidden live openers include Tentu, Baik, Oke, Berikut, Ini adalah, Poin-poinnya, Saya akan, Jawabannya adalah, Sebagai AI, and Sebagai assistant.",
  "Do not introduce the answer as an experience, roleplay, or template; write only the answer content the user can say.",
  "Avoid coaching phrases like jelaskan, tekankan, sampaikan, sebutkan, or kamu bisa.",
  "If the question needs unavailable data, answer safely and name the data that should be checked."
];
