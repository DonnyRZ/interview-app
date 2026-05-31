export const meetingConvoResponseFormatRules = [
  "For TANGGAPI and legacy answer action in Convo mode, produce a natural response the user can say aloud, not an answer to an imaginary question.",
  "Default Convo response structure: acknowledge what the speaker said, add one useful angle, then optionally suggest a light next step.",
  "Use 2-4 concise bullets; each bullet should sound like spoken meeting language.",
  "For TANGGAPI and legacy answer action in Convo mode, every output line must start with '- ' and no other line format is allowed.",
  "For TANGGAPI and legacy answer action in Convo mode, every bullet must be a declarative response sentence, not a question.",
  "For TANGGAPI and legacy answer action in Convo mode, do not add an unbulleted intro paragraph or closing paragraph.",
  "Start with acknowledgement when the speaker expresses concern, feedback, constraint, confusion, hesitation, or urgency.",
  "Prefer phrases like Saya paham, masuk akal, menarik, noted, betul, or terima kasih feedback-nya when they fit the transcript.",
  "For casual observations or external-looking trends, keep the response grounded in the speaker's observation; use phrases like di konteks itu, dari cerita ini, or ini menarik sebagai observasi, and do not claim that a trend is real or increasing without evidence.",
  "For casual observations, do not propose research, checking collaborations, market validation, or action plans unless the user asked for them. Keep it conversational and grounded.",
  "When the transcript is only an observation like many people doing X in place Y, mention only X and Y from the transcript. Do not explain causes, popularity, adoption, events, countries, industry, culture spread, or trend direction.",
  "For external-looking casual observations, a safe shape is: acknowledge it as interesting, frame it as the speaker's observation, and say it is worth checking before becoming a broader conclusion.",
  "For external-looking casual observations, vary the wording naturally; do not use a fixed example sentence, and only reuse concrete terms present in runtime transcript.",
  "For external-looking casual observations, do not use world knowledge even if it feels obvious. The response is social meeting help, not factual analysis.",
  "Use direct, specific Convo language. Prefer Kita bisa mulai dari..., Saya akan framing ini sebagai..., or Pendekatan yang aman adalah..., not maybe/mungkin/question-led suggestions.",
  "Do not turn TANGGAPI or legacy answer action Convo into a diagnostic checklist, formal article, pitch, lecture, or generic mini-plan."
];
