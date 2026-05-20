# Contoh Help Button

## Adegan 1 (08.45)
Saya buka link zoom meeting, menunggu meeting dimulai pukul 09.00

## Adegan 2 (08.55)
Meeting sudah mau dimulai, saya membuka MVP yang application nya sudah terisi sejak kemarin. Saya klik start interview, tidak apa-apa lebih baik klik sekarang daripada tunggu 09.00

## Adegan 3 (09.02)
Interview dimulai

HR / Interviewer:
“Halo Donny, makasih udah join hari ini. Bisa perkenalkan diri singkat dan cerita pengalaman yang paling relevan untuk posisi Data Scientist ini?”

Behavior MVP:
mengambil informasi dari CV dan JD terkait data relevan yang ditanyakan “pengalaman yang paling relevan untuk posisi Data Scientist”

MVP akan memastikan:
1. Apakah ada data relevan di CV
2. Apakah ada data relevan di JD

Catatan: 
Bisa saja masih ada ketidaksempurnaan dari metode CV dan JD pada MVP eksisting, bukan karena datanya tidak ada, kalau tidak ada ya mau gimana lagi.
1. Untuk CV, harus jelas pengalaman di masing-masing perusahaan sebelumnya, range tanggal (berapa lama), posisinya sebagai apa, project yang dikerjakan apa aja. Selain itu, harus di list juga kuliahnya dimana, jurusan apa, pengalaman organisasi dan posisinya apa. Kalau ada, pernah magang dimana, berapa lama, apa tanggung jawab utamanya
2. Job Description (JD) seminimalnya adalah nama perusahaan, posisi yang dilamar sebagai apa, tanggung jawab utamanya apa, kalau ada list juga nice to have nya yang disebutkan
Data relevan yang sudah diambil kemudian ditahan dulu, hingga kemudian dimanfaatkan pada saat kandidat klik salah satu tombol

Kandidat klik “Bantu Jawab”

Output MVP:
1. Halo kak, saya Donny. 
2. Background saya fokus di data dan AI. 
3. Sebelumnya saya bekerja di PT INALUM sebagai data scientist, tugas saya adalah membuat model prediksi harga Alumunium yang akan digunakan untuk mempermudah pengambilan Keputusan tim marketing INALUM.
4.  Selain itu, saya juga pernah menjadi Data Scientsit RS Bundamedik, tugas saya adalah membuat aplikasi Speech to Text untuk membantu dokter dalam proses Anamnesis.

Catatan:
1.  Jawaban ini dibuat dalam bentuk points
2. Jawaban ini dibuat berdasarkan konteks dari CV (mayoritas) dan JD
3. Data JD yang digunakan untuk perkenalan harus hati-hati, jangan terlalu niche focus di perkenalan, cukup tau aja di JD role yang diminta itu apa, misalkan Data Scientist, dah cukup itu aja yang dipakai buat perkenalan, gak perlu sampai fokus kedalam detail JD hingga nice to have nya

## Adegan 4 (pertanyaan teknis)
Interviewer:
“Oke mas Donny, sekarang aku mau nanya. Kalau ada tabel transaksi e-commerce, gimana cara mencari top 5 customer dengan total pembelian terbesar bulan lalu?”

Behavior MVP:
AI dapat menilai, pertanyaan ini tidak membutuhkan konteks CV dan JD, jadi tidak ada pengambilan data.

Jadi AI hanya akan memahami intent pertanyaan dan memberikan respon terbaik untuk digunakan kandidat tergantung tombol apa yang di klik kandidat.

Kandidat klik “Bantu Jawab”

Output MVP:
1. Pertama saya filter transaksi bulan lalu menggunakan WHERE pada tanggal transaksi
2. Setelah itu GROUP BY customer_id lalu SUM(amount)
3. Kemudian ORDER BY total DESC dan LIMIT 5

Catatan:
Hampir semua pertanyaan teknis, baik itu terkait coding, manajemen inventori, supply chain, sales, konten kreasi, dll biasanya gak perlu ambil data dari CV dan JD, cukup AI berikan jawaban terbaiknya aja yang sesuai.

## Adegan 5 (Behavioral + Technical Combination)
Interviewer:
“Ceritakan project paling sulit.”

Behavior MVP:
Ini akan tricky, karena informasi terkait “mana yang paling susah” tidak ada di CV (di CV ada pengalamannya tapi tidak ada yang menyebutkan yang paling sulit mana). Jadi best practice kandidat adalah menjawabnya sendiri tanpa bantuan MVP.

Tapi jika kandidat kebingungan, karena misal, CV yang dia buat itu fake, kandidat bisa meminta bantuan MVP dengan klik “Bantu Jawab” (best option) atau “Jelaskan Makdusnya”.

AI akan mengambil data dari CV lalu menilainya, kemdian AI akan membuatkan cerita masuk akal. Dalam cerita ini harus jelas di Perusahaan apa, project nya apa, dan secara spesifik apa yang bikin susah/blocker nya.

Tidak boleh hanya menyebutkan bagian dari proses secara general yang sulit seperti: “Salah satu tantangan terbesar saya adalah data yang sangat kotor dan inconsistent antar source. Saya harus membuat pipeline cleaning dan validasi sebelum modeling. Setelah data stabil, performa model meningkat cukup signifikan.”
Harus personalized jawabannya.

Ouput MVP:
1. Pengalaman paling sulit saya adalah di INALUM
2. Pada dasarnya, data financial timeseries itu tidak siap langsung dipakai karena tipe datanya itu random walk
3. Jadi saya membutuhkan dataset exogenous
4. Masalahnya disini adalah saya juga harus memahami ilmu ekonomi domain supaya bisa menentukan dataset exogenous apa yang sebaiknya digunakan
5. Solusi saya adalah menggunakan dataset inventori Alumunium karena akan berpengaruh langsung terhadap supply Alumunium tersebut

Catatan:
Jangan cuman berikan masalahnya, jelaskan juga solusinya apa

## Adegan 6 (Penutup)
Interviewer:
“Ada pertanyaan?”

Behavior AI:
AI akan mengambil data dari JD, yaitu job description dan terutama PENTING jika ada adalah nice to have nya. Lalu dikaitkan CV tapi jangan dipaksakan, INI HARUS HATI-HATI kalau dipaksakan akan terlihat bohongnya.

Kandidat klik “Pertanyaan Follow-up”

Ouput MVP:
Saya melihat pada poin nice to have job posting, bagus jika ada pengalaman di Rumah Sakit. Kebetulan saya punya pengalaman sebagai Data Scietist Bundamedik. Kalau boleh tau, produk apa yang sedang digarap untuk rumah sakit ya?

# Contoh Bantuan Keywords
Keywords diambil dari kata/topik penting yang disebut interviewer, bukan dari “jenis pertanyaan”

## Contoh 1
Interviewer:
“Saya dulu handle campaign TikTok Ads untuk produk skincare.”

Keywords: campaign, TikTok Ads, skincare

## Contoh 2
Interviewer:
“Biasanya saya lihat dulu CAC dan conversion rate sebelum scale budget.”

Keywords: CAC, conversion rate, scale budget

## Contoh 3
Interviewer:
“Kalau konten organik, saya lebih fokus ke hook dan retention.”

Keywords: konten organik, hook, retention

## Contoh 4
Interviewer:
“Di perusahaan sebelumnya, masalah terbesar kami adalah leads banyak tapi kualitasnya rendah.”

Keywords: leads, lead quality

## Contoh 5
Interviewer:
“Saya pernah pegang campaign Ramadan, tapi ROAS-nya kurang bagus.”

Keywords: campaign Ramadan, ROAS