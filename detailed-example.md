# Contoh Behavior Orviko: QnA Mode & Convo Mode

Dokumen ini menjelaskan contoh behavior Orviko untuk konteks meeting online umum. Contoh di sini adalah acceptance scenario/test fixture, bukan vocabulary produksi yang boleh di-hardcode ke prompt.

Orviko memiliki 2 mode respons utama:

1. **QnA Mode**
   Dipakai saat user ingin menjawab pertanyaan, implied question, request for opinion, decision, clarification, atau situasi user diminta memberi jawaban.

2. **Convo Mode**
   Dipakai saat user ingin menanggapi statement, cerita, opini, concern, feedback, update, konteks, atau insight dari lawan bicara.

## Tombol Yang Digunakan

1. **Jawab Pertanyaan**
   Menghasilkan respons QnA-style. Output boleh berupa jawaban langsung, reasoning singkat, trade-off, klarifikasi aman, atau next step yang relevan.

2. **Tanggapi**
   Menghasilkan respons Convo-style. Output harus natural dan siap diucapkan, biasanya berisi acknowledge, useful angle, dan optional next step.

3. **Pertanyaan Follow-up**
   Menghasilkan pertanyaan balik yang relevan.

4. **Jelaskan Maksudnya**
   Menjelaskan maksud ucapan lawan bicara agar user memahami konteks.

5. **Keyword chips**
   Menjelaskan topik konkret yang muncul dari transcript terbaru.

6. **Ask**
   Bantuan bebas berdasarkan instruksi pendek dari user.

## Prinsip Umum

- Orviko tidak menjawab otomatis tanpa trigger user.
- User memilih mode lewat tombol, bukan classifier AI yang menebak diam-diam.
- `Jawab Pertanyaan` wajib memakai QnA mode walaupun transcript ambigu.
- `Tanggapi` wajib memakai Convo mode walaupun transcript mengandung tanda tanya.
- Output harus singkat, natural, dan siap diucapkan saat meeting.
- Jangan mengarang data. Jika data tidak tersedia, beri respons aman.
- Jangan bias ke use case, relasi bisnis, atau domain tertentu kecuali runtime data memang menyebutnya.

## Contoh QnA Mode

### Adegan 1: Pertanyaan Prioritas

Lawan bicara:

```txt
Menurut kamu bagian mana yang harus kita prioritaskan minggu ini?
```

User klik:

```txt
Jawab Pertanyaan
```

Output yang baik:

1. Saya akan prioritaskan bagian yang paling dekat dengan risiko keputusan.
2. Kalau ada dependency yang menahan tim lain, itu perlu dinaikkan dulu.
3. Setelah itu baru kita urutkan pekerjaan berdasarkan dampak dan effort.
4. Jadi fokus minggu ini bukan menyelesaikan semuanya, tapi mengunci hal yang paling menentukan progress.

Kenapa baik:

- menjawab pertanyaan langsung
- memberi reasoning singkat
- tidak mengarang status project spesifik

### Adegan 2: Implied Question Tanpa Tanda Tanya

Lawan bicara:

```txt
Aku masih belum yakin pendekatan ini cukup aman untuk timeline sekarang.
```

User klik:

```txt
Jawab Pertanyaan
```

Output yang baik:

1. Kekhawatirannya valid, jadi saya akan pisahkan dulu antara scope wajib dan scope tambahan.
2. Untuk timeline sekarang, opsi paling aman adalah mengunci versi minimal yang tetap memberi value.
3. Bagian yang belum kritikal bisa kita siapkan sebagai follow-up supaya tidak mengganggu delivery utama.
4. Dengan begitu risikonya lebih terkendali tanpa menghentikan progress.

Kenapa baik:

- memperlakukan statement sebagai permintaan pendapat karena user memilih QnA
- memberi jawaban keputusan/trade-off
- tetap aman tanpa detail palsu

### Adegan 3: Pertanyaan Teknis Umum

Lawan bicara:

```txt
Kenapa proses ini bisa lambat kalau jumlah request naik?
```

User klik:

```txt
Jawab Pertanyaan
```

Output yang baik:

1. Biasanya bottleneck muncul di query, proses blocking, antrean job, atau resource yang tidak cukup.
2. Saya akan cek dulu latency per endpoint, query paling berat, dan penggunaan CPU/memory.
3. Kalau bottleneck-nya database, solusinya bisa indexing, query rewrite, atau caching.
4. Kalau bottleneck-nya worker, kita perlu lihat concurrency dan queue depth.

Kenapa baik:

- menjawab secara teknis tetapi tetap general
- tidak memaksakan profil user atau konteks yang tidak tersedia

## Contoh Convo Mode

### Adegan 4: Concern Timeline

Lawan bicara:

```txt
Timeline minggu ini kelihatannya cukup padat, dan tim juga sedang banyak parallel work.
```

User klik:

```txt
Tanggapi
```

Output yang baik:

1. Iya, concern itu masuk akal.
2. Supaya tetap realistis, kita bisa pisahkan dulu mana yang benar-benar harus selesai minggu ini dan mana yang bisa menjadi follow-up.
3. Dengan begitu tim tetap punya arah yang jelas tanpa memaksakan semua hal selesai sekaligus.

Kenapa baik:

- mengakui concern
- memberi angle praktis
- tidak berubah menjadi jawaban QnA kaku
- tidak default bertanya balik

### Adegan 5: Feedback Umum

Lawan bicara:

```txt
Versi terakhirnya sudah jauh lebih jelas, cuma masih ada beberapa bagian yang terasa terlalu ramai.
```

User klik:

```txt
Tanggapi
```

Output yang baik:

1. Noted, berarti arahnya sudah membaik tapi kita masih perlu sederhanakan bagian yang terlalu padat.
2. Saya akan fokus merapikan elemen yang mengganggu scanning dulu, lalu menjaga bagian yang sudah membantu clarity tetap dipertahankan.
3. Jadi revisinya tidak perlu mengubah semuanya, cukup mengurangi noise di area yang paling terasa ramai.

Kenapa baik:

- respons natural terhadap feedback
- siap diucapkan
- tidak menjadi artikel panjang

### Adegan 6: Update Urgensi

Lawan bicara:

```txt
Kita baru dapat update, deadline-nya dimajukan dua hari.
```

User klik:

```txt
Tanggapi
```

Output yang baik:

1. Oke, berarti kita perlu langsung menyesuaikan scope dengan deadline baru.
2. Saya akan lihat dulu item yang paling kritikal untuk tetap dipertahankan, lalu turunkan prioritas bagian yang tidak menghambat keputusan utama.
3. Dengan deadline lebih pendek, fokusnya harus ke versi yang paling aman untuk dikirim, bukan versi yang paling lengkap.

Kenapa baik:

- menanggapi update
- memberi next step
- tidak bertanya balik secara default

## Contoh Tombol Lain

### Pertanyaan Follow-up

Lawan bicara:

```txt
Ada beberapa hal yang masih belum align antara kebutuhan user dan batasan teknis.
```

User klik:

```txt
Pertanyaan Follow-up
```

Output yang baik:

1. Bagian mana yang paling besar gap-nya saat ini?
2. Apakah gap itu lebih banyak karena scope, timeline, atau constraint teknis?
3. Keputusan apa yang paling perlu kita kunci supaya alignment-nya lebih jelas?

### Jelaskan Maksudnya

Lawan bicara:

```txt
Kita perlu memastikan keputusan ini tidak cuma optimal secara lokal.
```

User klik:

```txt
Jelaskan Maksudnya
```

Output yang baik:

1. Maksudnya, keputusan ini jangan hanya terlihat bagus untuk satu bagian kecil.
2. Perlu dicek juga dampaknya ke proses, tim, atau sistem lain yang terkait.
3. Intinya mereka ingin keputusan yang lebih menyeluruh, bukan optimasi yang menimbulkan masalah di tempat lain.

## Anti-Pattern

Untuk `Tanggapi`, hindari:

- membuka dengan “Berikut adalah...”
- membuat list terlalu formal seperti artikel
- default memberi pertanyaan balik
- berubah menjadi jawaban QnA meskipun user memilih Convo
- memakai framing use case, relasi bisnis, atau domain tertentu jika tidak ada di transcript

Untuk `Jawab Pertanyaan`, hindari:

- meta-intro seperti “Berikut adalah jawaban...”
- jawaban yang terlalu panjang
- mengarang angka, status, atau fakta eksternal
- memaksa user profile ketika konteksnya tidak relevan

## Search

Search adalah capability terpisah dan tidak menjadi tombol utama di current build. Jika fakta eksternal/current facts dibutuhkan tetapi tool search belum tersedia di flow tersebut, output harus aman dan tidak mengarang.

## Acceptance Ringkas

- Klik `Jawab Pertanyaan` selalu menghasilkan QnA-style.
- Klik `Tanggapi` selalu menghasilkan Convo-style.
- `Tanggapi` tidak default menjadi pertanyaan follow-up.
- `Jawab Pertanyaan` tidak memakai meta-intro.
- Keyword chips hanya muncul dari konteks meeting terbaru yang accepted.
- Output tetap general dan tidak bias domain.
