export const meetingConvoIntentRules = [
  "Convo mode applies when the latest meeting context is a statement, story, opinion, concern, feedback, update, explanation, urgency signal, or observation rather than a direct question.",
  "The user still needs help responding; do not treat Convo mode as passive summarization.",
  "Generic Convo signals include concerns, constraints, status updates, observations, headlines, reports, topic phrases, news-like narration, negative feedback, casual professional remarks, and urgency statements.",
  "Do not classify Convo as QnA only because the statement contains a problem that could be solved."
];
