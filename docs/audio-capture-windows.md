# Web System Audio Capture

MVP Orviko menangkap system audio melalui browser, bukan native desktop runtime.

## Jalur Runtime

```txt
Chrome getDisplayMedia
-> user memilih Entire Screen + Share system audio
-> Web Audio API mengubah audio menjadi PCM16 mono 24 kHz
-> rolling prebuffer dan short tail menjaga batas ucapan
-> WebSocket mengirim input_audio_buffer.append
-> server VAD membentuk audio turn
-> gpt-4o-mini-transcribe menghasilkan transcript
```

## Batasan Browser

- Gunakan Chrome terbaru di Windows.
- User wajib membagikan sumber yang menyertakan system audio.
- Browser tidak mempunyai akses native ke loopback output sistem operasi.
- Label track dan level lokal hanya indikator UX, bukan bukti transcript sudah benar.
- Capture berhenti jika user menghentikan screen sharing.

## Silence Policy

Web boleh menekan pengiriman PCM yang benar-benar sunyi untuk mengurangi beban audio, dengan syarat:

- rolling prebuffer dipertahankan agar awal ucapan tidak hilang;
- short tail dikirim agar server VAD dapat menutup turn;
- threshold tidak dipakai untuk menolak final transcript;
- audio pelan harus diuji agar tidak terpotong;
- metrik captured versus sent audio tersedia di development.

## Status UX

Status harus membedakan:

- meminta izin capture;
- terhubung tetapi masih sunyi;
- signal audio terdeteksi;
- Realtime connecting;
- ucapan sedang ditranskrip;
- capture berakhir atau error.

Koneksi WebSocket saja tidak boleh dianggap sebagai bukti audio meeting tertangkap.

## Verification

- Entire Screen + Share system audio menghasilkan signal.
- Awal dan akhir ucapan tidak terpotong.
- Ucapan pelan tetap menghasilkan transcript.
- Silence panjang tidak terus dikirim ke Realtime.
- `Latest conversation focus` hanya mengikuti turn accepted terbaru.
- Tombol bantuan tetap memakai latest focus dan tidak membawa memori percakapan lama.
