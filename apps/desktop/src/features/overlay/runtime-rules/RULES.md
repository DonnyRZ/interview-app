# Overlay Runtime Rules

Folder ini menyimpan rule runtime overlay yang berhubungan dengan AI, transcript, keyword, dan response copy.

## Prinsip

- `InterviewOverlay.tsx` harus tetap fokus pada UI state, event wiring, dan rendering.
- Prompt, response copy, transcript heuristics, keyword heuristics, dan rule AI lain tidak boleh ditaruh langsung di `InterviewOverlay.tsx`.
- Jika ada kebutuhan baru yang cukup berbeda, buat file rule baru di folder ini.
- Jangan menumpuk semua use case ke satu file besar hanya karena lebih cepat.
- Boleh extend file yang sudah ada hanya jika use case-nya benar-benar masih satu domain tanggung jawab.

## Pembagian Saat Ini

- `realtime-action-prompt.ts`: prompt/action instruction untuk tombol live Realtime.
- `overlay-response-copy.ts`: copy notice, formatting response, dan parser response text.
- `runtime-keyword-rules.ts`: rule keyword chips runtime.
- `transcript-focus-rules.ts`: rule transcript, conversation focus, relevance, dan noise filtering.

## Saat Menambah Use Case

- Buat nama file yang spesifik terhadap tanggung jawabnya.
- Hindari hardcode contoh domain, company, device, atau skenario testing lokal.
- Pastikan rule tetap generic untuk semua CV + JD.
- Signal keyword/transcript harus role-neutral. Jangan membuat daftar yang terlalu condong ke satu use case seperti data/ML, sales, design, legal, atau domain tertentu.
- Keyword chips harus evidence-based dari transcript terbaru + domain profile. Jangan jadikan daftar vocabulary global sebagai sumber utama chip.
- Jika konteks fresh ada tetapi tidak ada keyword konkret, tampilkan empty state dan biarkan tombol bantuan tetap dipakai.
- Noise filter boleh mengenali pola umum iklan, tetapi jangan hardcode nama produk/company dari video atau test manual.
- Setelah edit, minimal jalankan `npm.cmd run typecheck`.
