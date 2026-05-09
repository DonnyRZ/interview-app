# AI Prompting Rules

Dokumen ini adalah aturan ringkas untuk semua prompt di modul AI backend.

## Prinsip Utama

- Default: prompt harus dikelola di backend, bukan di desktop UI, route, controller, overlay, atau helper runtime biasa.
- Setiap use case AI harus dimodelkan sebagai `ActionSpec` dengan kontrak input, task, policy, output, dan context builder yang jelas.
- Stable instruction harus dipisah dari runtime payload. Prompt berisi aturan yang relatif stabil; payload berisi data request seperti CV, JD, transcript, domain profile, dan metadata.
- Prompt harus dirakit lewat `prompt-builder.ts`. File lain boleh memilih spec dan menjalankan action, tapi jangan merakit prompt sendiri.
- Validasi tidak boleh hanya mengandalkan prompt. Output tetap harus dicek lewat schema, policy, dan guardrail kode.
- Catatan current build: live Realtime action text masih dirakit di desktop overlay untuk trigger `gpt-realtime-mini`. Ini adalah pengecualian sementara untuk jalur WebSocket live, bukan pola ideal untuk prompt backend baru.

## Struktur File

Default untuk use case baru: tambah 1 file action spec baru.

```txt
ai/
  action-specs.ts
  prompt-builder.ts
  action-runner.ts
  action-schemas.ts
  actions/
    generate-interview-answer.ts
    preprocess-cv.ts
    preprocess-application-jd.ts
    surface-realtime-keywords.ts
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

- `InterviewOverlay.tsx` boleh memiliki action instruction pendek untuk live Realtime trigger selama runtime live masih langsung berbicara dengan OpenAI Realtime WebSocket dari desktop.
- Instruksi di overlay harus terbatas pada action live seperti `BANTU_JAWAB`, `BANTU_FOLLOWUP`, `JELASKAN_MAKSUDNYA`, `EXPLAIN_KEYWORD`, dan `ASK`.
- Jangan menambahkan prompt preprocessing CV/JD, summary, scoring, atau business logic AI baru ke overlay.
- Jika realtime action prompt makin besar atau kompleks, pindahkan ke modul bersama/backend agar governance prompt kembali terpusat.

## Runtime Context

Runtime context seperti `realtimeContext`, `domainProfile`, CV summary, JD summary, dan transcript harus diperlakukan sebagai data, bukan prompt.

Contoh yang benar:

```txt
primaryDomain: Role-specific domain from the CV + JD
inScopeConcepts: core role skills, business domain, adjacent interview topics
outOfScopeConcepts: topics unrelated to the role, JD, candidate context, or business domain
```

Contoh yang harus dihindari di runtime data:

```txt
Tampilkan keyword hanya jika...
Jangan jawab...
Kamu harus...
```

Instruksi seperti itu masuk ke `ActionSpec`, bukan ke payload.

## Near Real-Time Interview

Untuk interview near real-time:

- CV + JD diproses sebelum interview menjadi domain/niche context.
- Saat interview berjalan, transcript hanya menjadi runtime payload.
- Keyword atau bantuan interview harus diputuskan oleh action khusus yang membaca transcript + domain profile.
- Overlay live saat ini boleh mengirim trigger/action text pendek ke Realtime session, tetapi tidak boleh menjadi tempat prompt besar atau preprocessing logic.
- Default arah jangka panjang tetap: stable AI rules dikelola di backend/module AI, runtime payload tetap data.

Target desainnya: prompt tetap terkontrol, sementara data interview bisa mengalir cepat.
