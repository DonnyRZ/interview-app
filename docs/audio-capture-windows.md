# Windows Audio Capture

Dokumen ini menjelaskan status current build untuk audio meeting live di Windows.

## Current State

Runtime live saat ini memakai native Windows WASAPI loopback helper:

`apps/desktop/native/windows-loopback/WasapiLoopbackProbe.cs`

Helper ini dipakai untuk menangkap system audio lawan bicara, misalnya audio dari browser, YouTube, Zoom, Meet, Teams, atau aplikasi meeting lain yang keluar lewat output Windows.

Target utama current build:

- tangkap suara peserta meeting dari active system output
- stream PCM mono 24 kHz ke Electron
- Electron meneruskan audio chunk ke OpenAI Realtime
- `gpt-realtime-mini` menjadi satu-satunya live runtime model

## Capture Paths

### 1. Native WASAPI Loopback

Status: implemented dan menjadi jalur utama live runtime Windows.

Behavior yang diharapkan:

- enumerate active render endpoints Windows
- cari output device yang benar-benar punya signal audio
- pilih device dengan peak tertinggi di atas threshold
- jangan hardcode nama device, brand headset, browser, atau device id development
- simpan rolling prebuffer sekitar 2 detik saat scan
- flush prebuffer saat device dipilih agar awal ucapan tidak hilang
- emit `selected_device`, `level`, `waiting_for_audio`, dan `audio_chunk`
- jika device selected menjadi silent beberapa detik, helper rescan output aktif lain

### 2. Microphone Input

Status: diagnostic readiness only.

Mic input masih berguna untuk mengecek device input, tetapi bukan jalur utama untuk menangkap lawan bicara.

Catatan penting:

- mic bisa menangkap bocoran speaker dari ruangan, tapi itu bukan capture system audio yang reliable
- mic user belum menjadi bagian utama patch runtime live saat ini
- desain dual-source audio user + meeting participant adalah tahap berikutnya, bukan asumsi current build

### 3. Virtual/System Input

Status: fallback/diagnostic, bukan jalur produk utama.

Contoh:

- Stereo Mix
- What U Hear
- VB-Audio Virtual Cable / CABLE Output

Catatan:

- boleh muncul sebagai device input di Chromium/Electron
- naming berbeda-beda tergantung driver/vendor
- jangan jadikan label matching sebagai product truth

## Device Selection Rules

Rule current build:

- pilih active render endpoint berdasarkan signal nyata
- tie-breaker boleh mempertimbangkan default Windows role hanya jika signal setara
- jangan pilih device hanya karena dia default
- jangan hardcode device development seperti Realtek, headset tertentu, browser tertentu, atau endpoint id lokal

Jika tidak ada signal:

- helper emit `waiting_for_audio`
- overlay tidak boleh mengaku `Listening`
- helper tetap hidup dan terus scan

## Runtime Status UX

Overlay status harus jujur.

Status yang valid secara konsep:

- `Menghubungkan Realtime`
- `Mencari audio meeting`
- `Listening via <device>`
- `Menangkap ucapan`
- `Konteks siap`
- `Audio tidak tertangkap`

Jangan tampilkan status listening hanya karena WebSocket Realtime sudah terbuka.

## Realtime Audio Flow

Flow current build:

```text
Mulai Meeting
-> Electron open overlay
-> backend create OpenAI Realtime client secret
-> overlay connect WebSocket ke OpenAI Realtime
-> Electron main start WASAPI helper stream
-> helper auto-select active output
-> helper stream audio_chunk PCM 24k
-> overlay append audio ke input_audio_buffer
-> OpenAI Realtime emits transcription events
-> overlay builds rolling conversation context
```

OpenAI Realtime config saat ini:

- live model: `gpt-realtime-mini`
- output modality: text
- input audio format: PCM 24 kHz
- transcription: `gpt-4o-mini-transcribe`
- language hint: Indonesian with mixed English technical terms
- server VAD enabled
- automatic response disabled

## Important Guardrails

- Do not fallback silently to `gpt-5-mini` for live meeting buttons.
- Do not fallback to `gpt-realtime-1.5`.
- Do not treat local mic signal as proof that system audio is captured.
- Do not require user to manually understand Windows audio routing for normal meeting flow.
- Do not stop the helper just because audio becomes silent.

## Known Limitations

- Current runtime focuses on system audio lawan bicara.
- User mic is not yet part of the primary live context.
- Public Windows distribution should go through Microsoft Store packaging/submission. Local packaged builds are only for engineering QA.

## Verification Checklist

Manual QA should verify:

- playing YouTube produces system audio signal
- speaker laptop output is detected
- wired headset output is detected
- Bluetooth stereo output is detected when active
- no audio produces `waiting_for_audio`, not fake listening
- switching output device during session triggers rescan
- transcript starts near the beginning of speech, not only the final few words
- latest conversation focus follows the newest topic
- `Jawab Pertanyaan`, `Tanggapi`, `Pertanyaan Follow-up`, and `Jelaskan Maksudnya` use fresh conversation context
