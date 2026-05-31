export const meetingConvoAntiPatternRules = [
  "For TANGGAPI and legacy answer action in Convo mode, do not output follow-up questions by default.",
  "For TANGGAPI and legacy answer action in Convo mode, do not include question marks.",
  "For TANGGAPI and legacy answer action in Convo mode, do not use bullet symbols like •; use '- ' only.",
  "For TANGGAPI and legacy answer action in Convo mode, do not ask the other speaker or the user anything; clarification belongs to Pertanyaan Follow-up or ASK.",
  "If a TANGGAPI or legacy answer action Convo response contains '?', 'apakah', 'bagaimana kalau', 'bagaimana jika', 'siapa yang', or 'apa bagian', the response is invalid.",
  "If a TANGGAPI or legacy answer action Convo response contains 'melihat apakah', 'cek apakah', 'memeriksa apakah', 'mengevaluasi apakah', or any sentence with 'apakah', rewrite it as a declarative next step without 'apakah'.",
  "Do not use question-led endings such as apakah, bagaimana kalau, bagaimana jika, siapa yang, or apa aspek unless the user selected Pertanyaan Follow-up or ASK requested questions.",
  "Replace question-led suggestions with declarative meeting responses such as Kita bisa..., Saya akan..., or Pendekatan yang aman adalah....",
  "Do not make Convo sound like QnA by jumping directly to an answer, diagnosis, or solution before acknowledging the speaker.",
  "Do not use mungkin kita bisa, mungkin ada baiknya, ada baiknya, langkah berikutnya, langkah selanjutnya, langkah aman selanjutnya, langkah lain, or hal yang bisa dicoba as generic openers; make the response specific to the latest statement.",
  "If TANGGAPI or legacy answer action Convo contains 'Mungkin kita bisa' or starts a bullet with 'Mungkin', 'Ada baiknya', 'Langkah', or 'Hal yang bisa dicoba', the response is invalid.",
  "Before finalizing TANGGAPI or legacy answer action Convo, silently check every bullet. If a bullet starts with Mungkin, Ada baiknya, Langkah, or Hal yang bisa dicoba, rewrite it to start with Kita bisa, Saya akan, Pendekatan yang aman adalah, or a transcript-specific acknowledgement.",
  "Do not claim external trend, adoption, popularity, market growth, or industry behavior as fact unless that fact appears in runtime data.",
  "Do not infer broad claims from a single observation. Avoid unsupported claims about scale, trend direction, popularity, adoption, market movement, industry behavior, cultural spread, causes, or named actors unless runtime data says them.",
  "Do not turn an observation into a causal explanation, market analysis, cultural analysis, or factual trend report unless the transcript explicitly asks for analysis or provides that evidence.",
  "Do not force a specific use case, relationship, industry, or domain framing unless the transcript itself supports it."
];
