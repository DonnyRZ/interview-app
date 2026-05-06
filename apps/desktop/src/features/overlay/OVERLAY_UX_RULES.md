# Overlay UX Rules

This file captures product behavior that must not regress when editing the interview overlay.

## Source Of Truth

- `mockup/interactive_mvp_mockup.html` is the UX reference for overlay behavior.
- Keep rules close to the overlay implementation so changes are checked in context.

## Core Modes

- Mini mode is passive: listening status, `Ask`, and end interview only.
- Expanded mode is interactive: latest question, quick actions, keyword chips, free ask, and recent help.
- Response mode must show a separate response shell, not replace the whole overlay panel.
- Loading must be visible in the response shell while AI help is being generated.

## Context Updates

- Runtime context updates must not reset the session UI.
- Updating `latestQuestion` or `runtimeKeywords` must not reset timer, mode, response, or recent help.
- Only a new `interviewRoundId` may reset overlay state to a fresh mini session.
- If the user hides the overlay while a request is loading, late AI responses must not reopen it unexpectedly.

## Questions And Ask

- `Latest detected question` must not display a fake placeholder as if it were detected speech.
- If no interviewer question exists yet, show a clear empty state.
- `Bantu Jawab`, `Bantu Follow-up`, and `Jelaskan Maksudnya` must not use placeholder text as AI input.
- Free text `Ask` is user intent first. Treat it as `latestQuestion` only when it looks like an interviewer question or is clearly domain-related.

## Runtime Keywords

- Keyword chips appear when the current question/transcript is relevant to CV + JD through layered relevance.
- Layered relevance includes core role/domain, role skill domain, business domain, adjacent interview knowledge, and logical macro/contextual factors.
- Generic questions should still produce chips when they test role-relevant knowledge or professional breadth.
- True out-of-scope questions should produce no keyword chips.
- Keyword chips should remain discoverable when a response shell is open.
- Auto-expand is allowed only when relevant keywords are surfaced while the overlay is mini.

## User Comfort

- Do not make audio setup noisy in the overlay. Use short status text.
- Do not surprise the user with sudden full panel changes while they are reading.
- Keep response text short, scannable, and safe to say during an interview.
- System notices, such as no detected question, should not be saved into recent help.
