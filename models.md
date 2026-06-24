# Model AI Orviko

Dokumen ini menjelaskan pembagian model untuk MVP Web App.

## `gpt-5-mini`

Dipakai hanya untuk workflow backend non-live:

- preprocessing profil user;
- preprocessing konteks meeting;
- pembentukan summary dan domain profile.

Model ini bukan response engine tombol live.

Konfigurasi:

```env
OPENAI_TEXT_MODEL=gpt-5-mini
```

## `gpt-realtime-mini`

Dipakai untuk sesi meeting live:

- menerima audio browser;
- menyediakan runtime transcription session;
- menghasilkan quick action, keyword help, dan free Ask.

Konfigurasi:

```env
OPENAI_REALTIME_MODEL=gpt-realtime-mini
```

Backend menolak model live lain agar tidak terjadi fallback diam-diam.

## `gpt-4o-mini-transcribe`

Dipakai untuk mengubah audio meeting menjadi transcript. Model ini tidak menyusun jawaban user.

Konfigurasi berada di payload Realtime session:

```txt
audio.input.transcription.model = gpt-4o-mini-transcribe
```

## Batas Konteks MVP

Setiap response bantuan bersifat stateless:

- memakai latest accepted conversation focus;
- memakai explicit user text untuk free Ask atau keyword yang dipilih;
- tetap mempunyai akses ke profil user, konteks meeting, dan domain profile dari action-specific response instructions;
- tidak memakai transcript lama, keyword request lama, trigger lama, atau output bantuan sebelumnya.

Web App membuat response out-of-band dengan `conversation: "none"` dan custom `input`. Output response tidak ditambahkan ke default Realtime Conversation.

Instruksi sesi audio dibuat minimal. Setiap tombol memakai instruksi response khusus action tersebut agar request tidak membawa seluruh aturan semua tombol.

## Ringkasan

- preprocessing: `gpt-5-mini`;
- live response: `gpt-realtime-mini`;
- live transcription: `gpt-4o-mini-transcribe`;
- memori percakapan panjang: tidak tersedia pada MVP.
