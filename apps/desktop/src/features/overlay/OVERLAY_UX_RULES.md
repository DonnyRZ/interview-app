# Overlay UX Rules

This file captures product behavior that must not regress when editing the meeting overlay.

## Source Of Truth

- `mockup/interactive_mvp_mockup.html` is historical UX reference for overlay behavior.
- If the mockup lags behind current product decisions, the rules in this file take precedence.
- Keep rules close to the overlay implementation so changes are checked in context.
- For transcript trust, latest focus, stable context, and keyword source safety, `CONTEXT_INTEGRITY.md` takes precedence.

## Core Modes

- Mini mode is passive: listening status, `Ask`, and end meeting only.
- Expanded mode is interactive: latest conversation focus, quick actions, keyword chips, free ask, and recent help.
- Response mode must show a separate response shell, not replace the whole overlay panel.
- Loading must be visible in the response shell while AI help is being generated.

## Context Updates

- Runtime context updates must not reset the session UI.
- Updating transcript, `latestFocus`, `conversationWindow`, or `runtimeKeywords` must not reset timer, mode, response, or recent help.
- Only a new live session id may reset overlay state to a fresh mini session.
- If the user hides the overlay while a request is loading, late AI responses must not reopen it unexpectedly.

## Conversation Focus And Ask

- `Latest conversation focus` must not display a fake placeholder as if it were detected speech.
- `Latest conversation focus` must not display rejected or quarantined transcript.
- If no fresh conversation context exists yet, show a clear empty state.
- `Jawab Pertanyaan`, `Tanggapi`, `Pertanyaan Follow-up`, and `Jelaskan Maksudnya` must use fresh conversation context, not placeholder text.
- Help buttons must not require a formal question. Statement, debate, explanation, or implied question can be enough if the conversation context is meaningful.
- Free text `Ask` is user intent first. It may update overlay context only when it looks like meeting participant context or is clearly related to the session context.
- If speech is still in progress, the overlay may show loading and wait briefly for final transcript before sending the action.
- If fresh transcript is unavailable, show an honest notice instead of answering from stale context.

## Runtime Keywords

- Keyword chips appear when `conversationWindow` or `latestFocus` is relevant to the active user profile and meeting context through layered relevance.
- Keyword chips must be based only on accepted conversation context.
- Layered relevance includes concrete session terms, user profile overlap, domain context, adjacent professional knowledge, and logical macro/contextual factors.
- Generic discussion can still produce chips when it is meaningfully related to the live meeting.
- True out-of-scope context should produce no keyword chips.
- Keyword chips should remain discoverable when a response shell is open.
- Auto-expand is allowed only when relevant keywords are surfaced while the overlay is mini.
- If fresh context exists but keyword chips are empty, help buttons must remain usable.

## User Comfort

- Do not make audio setup noisy in the overlay. Use short status text.
- Do not surprise the user with sudden full panel changes while they are reading.
- Keep response text short, scannable, and safe to say during a live meeting.
- System notices, such as no fresh conversation context, should not be saved into recent help.
