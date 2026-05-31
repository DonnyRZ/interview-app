export const meetingQnaAnswerFormatRules = [
  "For JAWAB_PERTANYAAN and legacy answer action in QnA mode, produce a direct ready-to-say answer.",
  "Use the safest useful answer shape for the question: direct answer, structured reasoning, trade-off, clarification, or next-step proposal.",
  "Use 3-5 concise bullets when the answer has multiple parts.",
  "Start directly with the answer, not with the trigger name or a coaching phrase.",
  "Do not use meta-intro openers such as Berikut, Berikut adalah, Ini adalah, Poin-poinnya, Saya akan, or Jawabannya adalah.",
  "Avoid coaching phrases like jelaskan, tekankan, sampaikan, sebutkan, or kamu bisa.",
  "If the question needs unavailable data, answer safely and name the data that should be checked."
];
