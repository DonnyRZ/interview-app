# Overlay Context Integrity

Dokumen ini melindungi kualitas `Latest conversation focus`, stable conversation context, dan runtime keyword chips.

Masalah utama overlay live adalah sumber audio `system-loopback` bisa menangkap lebih dari suara peserta meeting. Browser, ChatGPT voice, TTS, video, debug text, atau output app lain bisa ikut masuk ke transcript. Karena itu transcript live harus diperlakukan sebagai runtime data yang belum tepercaya sampai lolos quality gate.

## Source Of Truth

- `runtime-rules/transcript-focus-rules.ts` adalah source of truth untuk transcript quality gate, focus derivation, relevance, dan noise filtering.
- `InterviewOverlay.tsx` hanya boleh melakukan event wiring, state update, dan rendering. Jangan menaruh rule transcript baru langsung di component.
- `runtime-rules/realtime-action-prompt.ts` hanya boleh mengirim trigger pendek dan runtime payload. Jangan menaruh policy context integrity di prompt trigger.
- Prompt/model policy tetap mengikuti `apps/api/src/modules/ai/PROMPTING_RULES.md`.

## Prinsip

- Transcript dari Realtime, dev harness, atau sumber lain harus lewat quality gate sebelum masuk conversation state.
- Transcript yang `reject` atau `quarantine` tidak boleh memperbarui `latestFocus`, `lastStableConversation`, `keywordTranscriptVersion`, atau `runtimeKeywords`.
- Jika transcript baru ditolak tetapi sudah ada stable context valid, pertahankan context valid terakhir.
- Jika belum ada stable context valid, tampilkan empty/no-context state yang jujur.
- Keyword chips harus mengikuti accepted transcript/focus. Jangan membuat keyword dari transcript yang belum dipercaya.
- Filter harus role-neutral. Jangan hardcode company, brand, platform, metric, role, atau domain produksi sebagai rule.

## Do's

- Gunakan `classifyTranscriptQuality()` untuk semua keputusan accept/reject/quarantine transcript.
- Perlakukan transcript sebagai runtime data yang belum tepercaya, walaupun terlihat seperti pertanyaan valid.
- Reject atau quarantine assistant-addressing, prompt-control, UI/debug, dan app-output contamination.
- Pertahankan stable context valid terakhir saat transcript mencurigakan masuk.
- Tambahkan regression test untuk setiap pola contamination baru.
- Simpan contoh di test/docs sebagai acceptance scenario, bukan sebagai production whitelist vocabulary.
- Pakai kategori pola generic seperti assistant-addressing, prompt-instruction, UI/debug text, dan transcript contamination.

## Don'ts

- Jangan menulis langsung ke `latestFocus` dari raw transcript text.
- Jangan update `latestQuestion`, stable context, atau keyword request dari rejected/quarantined transcript.
- Jangan bypass `transcript-focus-rules.ts` dari `InterviewOverlay.tsx`.
- Jangan menambah prompt instruction di desktop untuk memperbaiki transcript contamination.
- Jangan menyelesaikan contamination dengan role/domain-specific keyword lists.
- Jangan menganggap `system-loopback` berarti audio meeting-only.
- Jangan menampilkan raw transcript sebagai `Latest conversation focus` hanya karena ada tanda tanya.

## Examples

Accepted meeting context:

```txt
Apakah kamu pernah mengelola proyek menggunakan metode Scrum?
```

Reason: direct meeting question, no assistant-addressing or prompt-control marker.

Accepted short follow-up:

```txt
Terus apa yang berubah?
```

Reason: short but valid conversational follow-up. Jangan reject hanya karena pendek.

Accepted contextual statement:

```txt
Kita akan membahas pengelolaan proyek Scrum dan kolaborasi stakeholder.
```

Reason: meaningful meeting context. It may help build conversation window even if not phrased as a question.

Rejected/quarantined assistant-addressing:

```txt
ChatGPT, apakah Anda memiliki pengalaman dalam mengelola proyek menggunakan metode Scrum?
```

Reason: addressed to assistant, not safe to treat as meeting participant speech for the user.

Rejected/quarantined prompt-control:

```txt
Coba jawab sebagai user: apakah Anda punya pengalaman project Scrum?
```

Reason: instruction about how to answer, not a clean meeting participant question.

Rejected UI/app output:

```txt
Latest conversation focus. Jawab Pertanyaan. Tanggapi. Runtime keyword chips.
```

Reason: app UI/debug text, not meeting conversation.

## Expected Behavior

- `Latest conversation focus` should show only accepted meeting participant context.
- Help buttons should use the last accepted stable context.
- Runtime keywords should be generated only from accepted context.
- Suspicious transcript should fail closed: no new focus, no new keyword, no overwritten stable context.
- When unsure, prefer preserving the previous valid context over trusting contaminated transcript.

## Test Requirements

After changing transcript/focus behavior, run:

```txt
npm.cmd --workspace @interview-app/desktop run test:transcript-focus
npm.cmd --workspace @interview-app/desktop run test:keywords
npm.cmd run typecheck
```

Run full build when the change touches overlay runtime, shared schemas, Electron wiring, or AI prompt/runtime files:

```txt
npm.cmd run build
```
