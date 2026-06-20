# AI Prompting Rules

Dokumen ini adalah aturan ringkas untuk semua prompt di modul AI backend.

## Prinsip Utama

- Default: prompt harus dikelola di backend, bukan di desktop UI, route, controller, overlay, atau helper runtime biasa.
- Setiap use case AI harus dimodelkan sebagai `ActionSpec` dengan kontrak input, task, policy, output, dan context builder yang jelas.
- Stable instruction harus dipisah dari runtime payload. Prompt berisi aturan yang relatif stabil; payload berisi data request seperti profil user, konteks meeting, transcript, domain profile, dan metadata.
- Prompt harus dirakit lewat `prompt-builder.ts`. File lain boleh memilih spec dan menjalankan action, tapi jangan merakit prompt sendiri.
- Validasi tidak boleh hanya mengandalkan prompt. Output tetap harus dicek lewat schema, policy, dan guardrail kode.
- Catatan current build: live Realtime action text masih dirakit di `apps/desktop/src/features/overlay/realtime-action-prompt.ts` untuk trigger `gpt-realtime-mini`. Ini adalah pengecualian sementara untuk jalur WebSocket live, bukan pola ideal untuk prompt backend baru.

## Struktur File

Default untuk use case baru: tambah 1 file action spec baru.

```txt
ai/
  action-specs.ts
  prompt-builder.ts
  action-runner.ts
  action-schemas.ts
  actions/
    response/
      generate-meeting-response.ts
      meeting-response-router.ts
      qna/
      convo/
    followup/
      generate-meeting-followup.ts
    explanation/
      generate-meeting-explanation.ts
    keywords/
      surface-meeting-keywords.ts
      generate-meeting-keyword-help.ts
    preprocessing/
      preprocess-user-profile.ts
      preprocess-meeting-context.ts
    realtime/
      realtime-meeting-session.ts
      realtime-meeting-transcription.ts
    shared/
      meeting-context-format.ts
```

`action-specs.ts` hanya menjadi public export/barrel. Jangan jadikan file ini tempat menumpuk semua prompt.

Jika ada banyak instruksi yang benar-benar reusable, boleh tambah folder/module khusus, misalnya:

```txt
ai/modules/
  confidence-policy.ts
  output-contracts.ts
```

Tapi jangan membuat abstraction terlalu awal. Untuk tahap sekarang, satu use case satu file action spec sudah cukup.

## Aturan Menambah Prompt Baru

Saat menambah kebutuhan AI baru:

1. Buat file baru di `actions/`.
2. Definisikan `Input` type untuk payload action itu.
3. Export satu `ActionSpec`.
4. Tambahkan output schema di `action-schemas.ts`.
5. Export spec lewat `action-specs.ts`.
6. Jalankan action melalui `action-runner.ts`.

Jangan menaruh prompt/instruksi model di:

- React component
- Electron preload/main process
- API route
- service bisnis non-AI
- realtime context builder
- database seed/mock UI

Pengecualian sementara:

- `apps/api/src/modules/ai/actions/realtime/realtime-meeting-session.ts` dan `apps/api/src/modules/ai/actions/realtime/realtime-meeting-transcription.ts` boleh berupa builder instruksi Realtime, bukan `ActionSpec`, karena konfigurasi Realtime session/client secret tidak berjalan lewat `action-runner.ts`.
- Prompt Realtime backend tetap harus berada di `ai/actions/`, bukan di `openai.client.ts`, route, atau service meeting legacy.
- `apps/desktop/src/features/overlay/realtime-action-prompt.ts` boleh memiliki action instruction pendek untuk live Realtime trigger selama runtime live masih langsung berbicara dengan OpenAI Realtime WebSocket dari desktop.
- React component seperti `InterviewOverlay.tsx` tidak boleh menampung prompt/instruksi model; component hanya boleh memanggil builder prompt yang sudah dipisahkan.
- Instruksi di `realtime-action-prompt.ts` harus terbatas pada action live seperti `JAWAB_PERTANYAAN`, `TANGGAPI`, `BANTU_FOLLOWUP`, `JELASKAN_MAKSUDNYA`, dan `EXPLAIN_KEYWORD`.
- Free-text harus dirutekan ke `JELASKAN_MAKSUDNYA` dengan sumber `USER_TEXT`; teks user menjadi subjek utama dan bukan pengganti transcript atau `latestQuestion`.
- Jangan menambahkan prompt preprocessing profil user/konteks meeting, summary, scoring, atau business logic AI baru ke overlay/desktop.
- Jika realtime action prompt makin besar atau kompleks, pindahkan ke modul bersama/backend agar governance prompt kembali terpusat.

## Runtime Context

Runtime context seperti `realtimeContext`, `domainProfile`, user profile summary, meeting context summary, dan transcript harus diperlakukan sebagai data, bukan prompt.

Contoh yang benar:

```txt
primaryDomain: meeting topic/domain inferred from user profile + meeting context
inScopeConcepts: concrete concepts relevant to the active meeting context
outOfScopeConcepts: topics unrelated to the user profile, meeting context, or latest accepted transcript
```

Contoh yang harus dihindari di runtime data:

```txt
Tampilkan keyword hanya jika...
Jangan jawab...
Kamu harus...
```

Instruksi seperti itu masuk ke `ActionSpec`, bukan ke payload.

## Near Real-Time Meeting

Untuk meeting near real-time:

- Profil user + konteks meeting diproses sebelum sesi live menjadi identity reference dan meeting context.
- Saat meeting berjalan, transcript hanya menjadi runtime payload.
- Keyword atau bantuan meeting harus diputuskan oleh action khusus yang membaca transcript + domain profile.
- Runtime keyword chips bersifat transcript-first term extraction: ambil kata/topik penting yang disebut peserta meeting terbaru, bukan jenis pertanyaan, seed concept, atau label kompetensi generik.
- Runtime keyword chips bersifat opsional dan evidence-based. Jangan memunculkan chip hanya dari profil user, konteks meeting, seed/domain profile jika transcript terbaru belum memunculkan atau menyiratkan konsep konkret.
- Profil user/konteks meeting/domain profile hanya boleh menjadi filter atau ranking ringan untuk keyword chips, bukan sumber chip utama.
- Prompt dan heuristic keyword harus role-neutral; jangan default ke vocabulary satu bidang tertentu ketika profil/konteks meeting tidak mendukungnya.
- Jangan hardcode contoh spesifik dari dokumen, mockup, seed, test case, brand, platform, metric, domain, company, atau role ke prompt/heuristic produksi. Contoh hanya boleh menjadi test fixture atau acceptance scenario.
- Prompt dan heuristic produksi boleh menyebut kategori umum seperti platform, metric, acronym, product term, atau problem phrase, tetapi jangan menjadikan contoh spesifik sebagai whitelist, regex khusus, vocabulary prior, atau pattern produksi.
- Overlay live saat ini boleh mengirim trigger/action text pendek ke Realtime session melalui `realtime-action-prompt.ts`, tetapi tidak boleh menjadi tempat prompt besar atau preprocessing logic.
- Default arah jangka panjang tetap: stable AI rules dikelola di backend/module AI, runtime payload tetap data.

Target desainnya: prompt tetap terkontrol, sementara data meeting bisa mengalir cepat.
