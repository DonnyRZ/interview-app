# Contoh Behavior Orviko: QnA Mode & Convo Mode

Dokumen ini menjelaskan contoh behavior Orviko untuk konteks **meeting online umum**, bukan interview.

Orviko memiliki 2 mode utama:

1. **QnA Mode**  
   Digunakan saat lawan bicara mengajukan pertanyaan langsung kepada user.

2. **Convo Mode**  
   Digunakan saat lawan bicara tidak bertanya, tetapi sedang bercerita, menyampaikan opini, memberi konteks, atau menjelaskan sesuatu. Orviko tetap membantu user memberi respons yang nyambung.

---

# Prinsip Tombol

Tombol jangan ditambah terlalu banyak agar scope MVP tetap aman dan sederhana.

## Tombol yang Digunakan

1. **Bantu Jawab**  
   Tombol utama untuk membantu user merespons lawan bicara.

   Tombol ini dipakai untuk:
   - menjawab pertanyaan langsung
   - menanggapi cerita/opini/pernyataan
   - memberi insight tambahan
   - membuat respons lebih rapi
   - mengambil konteks meeting
   - menggunakan search jika memang dibutuhkan

2. **Jelaskan Maksudnya**  
   Dipakai saat user tidak paham maksud ucapan lawan bicara.

3. **Pertanyaan Follow-up**  
   Dipakai saat user ingin bertanya balik secara relevan.

## Catatan Penting

1. Jangan tambah tombol seperti “Tambah Insight”, “Bantu Tanggapi”, “Cari Data”, atau “Buat Lebih Profesional”.
2. Jika niatnya menambah insight, user tetap klik **Bantu Jawab**.
3. Jika butuh search, proses search terjadi di belakang layar setelah user klik **Bantu Jawab**.
4. Keywords bukan tombol utama. Keywords hanya chip/topik bantu yang muncul dari ucapan lawan bicara.
5. Output harus singkat, natural, dan siap diucapkan saat meeting.

---

# Shared Behavior

Behavior ini berlaku untuk QnA Mode dan Convo Mode.

Orviko akan:
1. Mendengar percakapan meeting.
2. Memahami apakah lawan bicara sedang bertanya atau hanya menyampaikan pernyataan.
3. Menahan konteks tersebut.
4. Menunggu user klik tombol.
5. Memberikan output sesuai tombol yang diklik user.

Catatan:
1. Orviko tidak perlu otomatis menjawab tanpa trigger user.
2. Orviko boleh mengambil konteks meeting sebelumnya jika tersedia.
3. Orviko boleh memakai search jika ucapan lawan bicara membutuhkan data eksternal.
4. Orviko tidak boleh mengarang data.
5. Jika data tidak tersedia, Orviko harus memberi jawaban aman.

---

# Contoh QnA Mode

QnA Mode digunakan saat lawan bicara bertanya langsung.

---

## Adegan 1 — Client Bertanya Kenapa Campaign Turun

Lawan bicara:
“Menurut kamu, kenapa performa campaign bulan ini turun padahal budget-nya sama?”

Behavior MVP:
Orviko menilai bahwa ini adalah pertanyaan analitis.  
Orviko perlu membantu user menjawab dengan kemungkinan penyebab umum, tanpa mengarang data spesifik yang tidak disebutkan.

User klik “Bantu Jawab”

Output MVP:
1. Kemungkinan utamanya ada di audience fatigue, creative yang mulai jenuh, atau perubahan kualitas traffic.
2. Saya akan cek dulu metrik per channel, terutama CTR, conversion rate, dan cost per lead.
3. Kalau CTR turun, masalahnya kemungkinan di creative.
4. Kalau CTR masih bagus tapi conversion turun, berarti masalahnya mungkin di landing page atau kualitas audience.

Catatan:
1. Jawaban harus berbentuk poin.
2. Jangan langsung menyimpulkan penyebab tunggal.
3. Jawaban harus menunjukkan cara berpikir yang sistematis.

---

## Adegan 2 — Manager Bertanya Progress Project

Lawan bicara:
“Progress project minggu ini sudah sampai mana?”

Behavior MVP:
Orviko memahami bahwa user perlu menjawab progress secara profesional.  
Jika ada konteks meeting sebelumnya atau catatan project, Orviko boleh mengambil konteks tersebut.  
Jika tidak ada, Orviko memberi struktur jawaban yang aman.

User klik “Bantu Jawab”

Output MVP:
1. Saat ini progress utama sudah masuk tahap eksekusi dan validasi awal.
2. Fokus minggu ini adalah menyelesaikan bagian yang paling berdampak dulu.
3. Blocker utama masih di sinkronisasi kebutuhan dan beberapa detail teknis.
4. Target saya, update yang lebih final bisa dibawa di meeting berikutnya.

Catatan:
1. Jawaban tidak boleh terlalu spesifik jika datanya tidak tersedia.
2. Jika ada data task/project, jawaban harus lebih spesifik.
3. Jangan terdengar defensif.

---

## Adegan 3 — Client Bertanya Kenapa Harga Mahal

Lawan bicara:
“Kenapa harga layanan ini lebih mahal dibanding vendor lain?”

Behavior MVP:
Orviko menilai bahwa user butuh jawaban sales/consultative.  
Jawaban harus membela value, bukan sekadar minta maaf.

User klik “Bantu Jawab”

Output MVP:
1. Betul, secara harga kami mungkin bukan yang paling murah.
2. Tapi yang kami tawarkan bukan hanya eksekusi, melainkan juga analisis, arahan strategi, dan monitoring hasil.
3. Jadi perbandingannya bukan hanya dari biaya awal, tapi dari value dan risiko yang bisa dikurangi.
4. Kalau diperlukan, kita bisa breakdown scope supaya lebih sesuai dengan prioritas budget.

Catatan:
1. Jangan menyerang vendor lain.
2. Jawaban harus tetap sopan.
3. Berikan opsi fleksibilitas, bukan diskon langsung.

---

## Adegan 4 — Tim Bertanya Prioritas Fitur MVP

Lawan bicara:
“Menurut kamu fitur ini perlu masuk MVP pertama atau nanti aja?”

Behavior MVP:
Orviko memahami bahwa ini pertanyaan product decision.  
Jawaban harus membantu user menjelaskan trade-off.

User klik “Bantu Jawab”

Output MVP:
1. Menurut saya, fitur ini masuk kategori penting tapi belum wajib untuk versi pertama.
2. Untuk MVP, sebaiknya kita fokus dulu ke fitur yang membuktikan value utama produk.
3. Kalau fitur ini belum langsung mempengaruhi user activation atau willingness to pay, bisa kita taruh di fase berikutnya.
4. Tapi kita tetap bisa siapkan desainnya supaya nanti tidak bongkar ulang terlalu banyak.

Catatan:
1. Jawaban harus menunjukkan prioritas.
2. Gunakan bahasa product yang mudah dipahami.
3. Jangan terlalu teknis.

---

## Adegan 5 — Meeting Teknis Bertanya Kenapa Sistem Lambat

Lawan bicara:
“Kenapa sistemnya terasa lambat saat banyak user masuk bersamaan?”

Behavior MVP:
Orviko menilai ini pertanyaan teknis.  
Orviko tidak perlu data bisnis, tapi perlu menjawab dengan kemungkinan penyebab teknis umum.

User klik “Bantu Jawab”

Output MVP:
1. Kemungkinan ada beberapa titik bottleneck.
2. Bisa dari query database yang belum optimal, proses backend yang blocking, atau resource server yang tidak cukup saat traffic naik.
3. Saya akan cek dulu log, response time per endpoint, dan query yang paling berat.
4. Dari situ baru kita bisa tentukan apakah solusinya optimasi query, caching, atau scaling infrastructure.

Catatan:
1. Jangan langsung menyalahkan server.
2. Jawaban harus menunjukkan langkah diagnosis.
3. Cocok untuk konteks engineer, product, atau client teknis.

---

## Adegan 6 — Client Bertanya Strategi Naikkan Sales

Lawan bicara:
“Kalau target kami sales naik bulan depan, apa yang paling cepat bisa dilakukan?”

Behavior MVP:
Orviko memahami bahwa user butuh jawaban quick win.  
Jawaban harus praktis dan tidak terlalu teoritis.

User klik “Bantu Jawab”

Output MVP:
1. Untuk hasil cepat, saya akan fokus ke audience yang sudah warm dulu.
2. Misalnya retargeting, follow-up leads lama, dan optimasi offer yang sudah terbukti jalan.
3. Setelah itu baru kita scale channel yang performanya paling stabil.
4. Jadi bukan langsung tambah budget besar, tapi maksimalkan traffic dan leads yang sudah ada.

Catatan:
1. Jawaban harus praktis.
2. Jangan terlalu abstrak.
3. Cocok untuk sales, marketing, dan consulting meeting.

---

## Adegan 7 — Customer Bertanya Bedanya Paket Basic dan Pro

Lawan bicara:
“Apa bedanya paket Basic dan Pro?”

Behavior MVP:
Orviko perlu membantu user menjelaskan perbedaan paket secara sederhana.  
Jika data pricing/package tersedia di aplikasi, Orviko harus mengambil data tersebut.  
Jika tidak ada, Orviko memberi struktur jawaban umum.

User klik “Bantu Jawab”

Output MVP:
1. Basic cocok kalau kebutuhannya masih sederhana dan ingin mulai dulu dengan fitur utama.
2. Pro lebih cocok kalau butuh kapasitas lebih besar, fitur lanjutan, atau penggunaan yang lebih intensif.
3. Jadi kalau tujuannya testing awal, Basic sudah cukup.
4. Tapi kalau akan dipakai rutin oleh tim, Pro akan lebih masuk akal.

Catatan:
1. Jika ada data paket asli, jawaban harus mengikuti data asli.
2. Jangan mengarang fitur paket.
3. Jawaban harus membantu customer memilih.

---

## Adegan 8 — Partner Bertanya Skema Kolaborasi

Lawan bicara:
“Kalau kita kolaborasi, bentuk kerja samanya enaknya seperti apa?”

Behavior MVP:
Orviko memahami bahwa user butuh jawaban partnership.  
Jawaban harus membuka opsi, bukan langsung mengunci satu skema.

User klik “Bantu Jawab”

Output MVP:
1. Menurut saya kita bisa mulai dari skema yang ringan dulu.
2. Misalnya co-marketing, referral, atau pilot project kecil.
3. Setelah terlihat hasilnya, baru kita bahas skema yang lebih besar seperti revenue sharing atau bundle offering.
4. Jadi risikonya kecil di awal, tapi tetap ada ruang untuk scale.

Catatan:
1. Jawaban harus fleksibel.
2. Jangan langsung menyebut angka revenue sharing jika belum ada konteks.
3. Cocok untuk meeting partnership.

---

## Adegan 9 — Advisor Bertanya Risiko Terbesar

Lawan bicara:
“Menurut kamu risiko terbesar dari plan ini apa?”

Behavior MVP:
Orviko membantu user menjawab dengan jujur dan strategis.  
Jawaban tidak boleh terlalu optimistis.

User klik “Bantu Jawab”

Output MVP:
1. Risiko terbesarnya menurut saya ada di eksekusi dan validasi demand.
2. Secara ide mungkin menarik, tapi kita tetap perlu membuktikan apakah user benar-benar mau pakai dan mau bayar.
3. Risiko kedua adalah scope yang terlalu melebar sebelum core use case terbukti.
4. Jadi fokus awal sebaiknya validasi problem, bukan langsung membangun terlalu banyak fitur.

Catatan:
1. Jawaban harus realistis.
2. Jangan terlalu defensif.
3. Cocok untuk meeting founder, product, advisor, atau investor.

---

## Adegan 10 — Finance Bertanya Kenapa Budget Naik

Lawan bicara:
“Kenapa budget bulan ini naik cukup besar?”

Behavior MVP:
Orviko membantu user menjawab dengan struktur penyebab dan justifikasi.  
Jika ada data budget, Orviko harus mengambil data tersebut.  
Jika tidak ada, jawaban dibuat general.

User klik “Bantu Jawab”

Output MVP:
1. Kenaikan budget terutama perlu dilihat dari komponen biayanya dulu.
2. Biasanya kenaikan bisa berasal dari volume aktivitas yang naik, biaya tools, atau kebutuhan tambahan yang sebelumnya belum dihitung.
3. Saya sarankan kita pisahkan antara cost yang memang menghasilkan output dan cost yang bisa ditekan.
4. Dari situ kita bisa putuskan mana yang perlu dipertahankan dan mana yang bisa dioptimasi.

Catatan:
1. Jangan mengarang angka.
2. Jika ada data, sebutkan komponen spesifik.
3. Jawaban harus memberi arah analisis.

---

## Adegan 11 — Client Bertanya Cara Mengukur Keberhasilan

Lawan bicara:
“Kalau project ini jalan, metrik keberhasilannya apa?”

Behavior MVP:
Orviko memahami bahwa ini pertanyaan tentang success metric.  
Jawaban harus menyebut metrik yang relevan dengan konteks.

User klik “Bantu Jawab”

Output MVP:
1. Metriknya sebaiknya dibagi dua: output dan outcome.
2. Output mengukur apakah pekerjaan selesai sesuai scope.
3. Outcome mengukur apakah project ini benar-benar berdampak ke bisnis.
4. Misalnya peningkatan conversion, efisiensi waktu, penurunan cost, atau kenaikan revenue tergantung tujuan project-nya.

Catatan:
1. Bedakan output dan outcome.
2. Jangan menyebut metrik yang tidak relevan.
3. Cocok untuk consulting dan project meeting.

---

## Adegan 12 — Tim Bertanya Cara Menentukan Prioritas

Lawan bicara:
“Dari semua task ini, mana yang harus kita kerjakan dulu?”

Behavior MVP:
Orviko membantu user menjawab dengan framework prioritas yang sederhana.

User klik “Bantu Jawab”

Output MVP:
1. Saya akan prioritaskan berdasarkan impact dan urgency.
2. Task yang langsung mempengaruhi user atau revenue sebaiknya naik prioritas.
3. Task yang hanya nice to have bisa masuk backlog dulu.
4. Setelah itu kita cek effort-nya supaya tidak memilih task yang impact-nya kecil tapi makan waktu besar.

Catatan:
1. Jawaban harus mudah dipahami.
2. Jangan terlalu banyak framework.
3. Cocok untuk meeting internal.

---

# Contoh Convo Mode

Convo Mode digunakan saat lawan bicara tidak bertanya langsung, tapi user tetap perlu merespons.

Catatan penting:
Walaupun konteksnya bukan pertanyaan, user tetap klik **Bantu Jawab**.  
Jangan buat tombol baru seperti “Bantu Tanggapi” atau “Tambah Insight”.

---

## Adegan 13 — Lawan Bicara Cerita Batik di Jepang

Lawan bicara:
“Aku kemarin ke Jepang, kok banyak yang pakai batik ya. Keren juga.”

Behavior MVP:
Orviko memahami bahwa ini bukan pertanyaan.  
User tetap butuh tanggapan yang nyambung, ringan, dan bisa membuka percakapan lanjutan.

User klik “Bantu Jawab”

Output MVP:
1. Wah iya, menarik banget.
2. Berarti batik makin dikenal bukan cuma sebagai budaya, tapi juga sebagai fashion yang bisa masuk pasar luar negeri.
3. Ini sebenarnya peluang bagus juga buat brand lokal Indonesia.

Catatan:
1. Jawaban harus terdengar natural.
2. Jangan terlalu kaku seperti artikel.
3. Tidak perlu search jika user hanya butuh tanggapan ringan.

---

## Adegan 14 — Batik di Jepang dengan Insight Tambahan

Lawan bicara:
“Aku kemarin ke Jepang, kok banyak yang pakai batik ya. Keren juga.”

Behavior MVP:
Orviko memahami bahwa user mungkin butuh tanggapan yang lebih informatif.  
Jika tersedia fitur search dan topik membutuhkan data eksternal, Orviko boleh mencari konteks tambahan di belakang layar.  
Namun trigger user tetap **Bantu Jawab**, bukan tombol baru.

User klik “Bantu Jawab”

Output MVP:
1. Iya, menarik banget.
2. Berarti batik punya peluang bukan cuma sebagai produk budaya, tapi juga sebagai fashion yang bisa diterima pasar luar negeri.
3. Kalau mau dibahas lebih jauh, ini bisa dikaitkan dengan peluang brand lokal Indonesia masuk market Jepang.

Catatan:
1. Jangan membuat klaim spesifik tanpa data.
2. Jika search menemukan data valid, boleh tambahkan insight singkat.
3. Output tetap harus siap diucapkan.

---

## Adegan 15 — Client Bilang Budget Tahun Ini Ketat

Lawan bicara:
“Tahun ini budget kami lebih ketat, jadi agak hati-hati untuk ambil keputusan.”

Behavior MVP:
Orviko memahami bahwa lawan bicara sedang menyampaikan concern, bukan bertanya.  
User perlu menanggapi dengan empati dan tetap membuka peluang.

User klik “Bantu Jawab”

Output MVP:
1. Saya paham, berarti kita memang perlu lebih selektif.
2. Mungkin pendekatannya bukan langsung mulai besar, tapi cari scope kecil yang impact-nya paling jelas dulu.
3. Dengan begitu, risikonya lebih rendah dan hasilnya bisa lebih mudah dievaluasi.

Catatan:
1. Respons harus empatik.
2. Jangan terdengar memaksa jualan.
3. Cocok untuk sales atau consulting meeting.

---

## Adegan 16 — Lawan Bicara Bilang Tim Overwhelmed

Lawan bicara:
“Tim kami sebenarnya sudah cukup overwhelmed dengan kerjaan yang ada.”

Behavior MVP:
Orviko memahami bahwa lawan bicara memberi sinyal kapasitas tim terbatas.  
User perlu menanggapi dengan solusi yang meringankan, bukan menambah beban.

User klik “Bantu Jawab”

Output MVP:
1. Makes sense, berarti solusi yang masuk harus benar-benar mengurangi beban tim, bukan menambah proses baru.
2. Mungkin kita bisa mulai dari bagian yang paling manual atau paling sering makan waktu.
3. Jadi tim tidak perlu berubah terlalu banyak di awal.

Catatan:
1. Tanggapan harus menunjukkan user mendengar masalahnya.
2. Jangan langsung menawarkan banyak fitur.
3. Cocok untuk meeting client dan internal.

---

## Adegan 17 — Lawan Bicara Bilang Kompetitor Mulai Agresif

Lawan bicara:
“Kompetitor sekarang kelihatan makin agresif, terutama dari sisi pricing.”

Behavior MVP:
Orviko memahami bahwa ini adalah konteks market/kompetisi.  
User perlu memberi respons strategis.

User klik “Bantu Jawab”

Output MVP:
1. Iya, kalau kompetitor bermain di pricing, kita perlu hati-hati supaya tidak ikut perang harga tanpa strategi.
2. Bisa jadi yang lebih penting adalah memperjelas diferensiasi value.
3. Jadi bukan hanya menjawab dengan harga lebih murah, tapi membuat alasan kenapa customer tetap memilih kita.

Catatan:
1. Jangan terlalu panjang.
2. Tunjukkan pemikiran strategis.
3. Cocok untuk marketing, sales, atau business meeting.

---

## Adegan 18 — Lawan Bicara Bilang Data Berantakan

Lawan bicara:
“Masalahnya data kami masih berantakan dan tersebar di banyak file.”

Behavior MVP:
Orviko memahami bahwa ini adalah pain point operational/data.  
User perlu menanggapi dengan validasi masalah dan arah solusi.

User klik “Bantu Jawab”

Output MVP:
1. Itu masalah yang cukup umum, dan biasanya memang jadi blocker sebelum analisis bisa jalan.
2. Menurut saya langkah awalnya bukan langsung bikin dashboard, tapi rapikan dulu struktur data dan sumber utamanya.
3. Setelah datanya konsisten, baru insight dan reporting-nya akan lebih reliable.

Catatan:
1. Jangan langsung lompat ke solusi kompleks.
2. Tanggapan harus menunjukkan urutan kerja yang benar.
3. Cocok untuk data, analytics, dan consulting meeting.

---

## Adegan 19 — Lawan Bicara Bilang Proposal Terlalu Kompleks

Lawan bicara:
“Proposal sebelumnya sebenarnya bagus, tapi terlalu kompleks buat tim kami.”

Behavior MVP:
Orviko memahami bahwa lawan bicara memberi feedback negatif secara halus.  
User perlu merespons dengan tenang dan membuka revisi.

User klik “Bantu Jawab”

Output MVP:
1. Terima kasih feedback-nya, itu masuk akal.
2. Berarti kita perlu sederhanakan proposalnya supaya lebih mudah dieksekusi oleh tim.
3. Saya bisa bantu pecah menjadi beberapa fase, mulai dari yang paling prioritas dan paling ringan dulu.

Catatan:
1. Jangan defensif.
2. Akui feedback dengan profesional.
3. Tawarkan next step yang jelas.

---

## Adegan 20 — Lawan Bicara Bilang AI Menarik Tapi Masih Ragu

Lawan bicara:
“AI menarik sih, tapi kami masih agak ragu soal implementasinya.”

Behavior MVP:
Orviko memahami bahwa ini adalah concern, bukan pertanyaan langsung.  
User perlu menanggapi dengan edukatif dan tidak memaksa.

User klik “Bantu Jawab”

Output MVP:
1. Wajar banget, karena AI memang tidak bisa langsung dipasang tanpa konteks yang jelas.
2. Menurut saya pendekatan yang aman adalah mulai dari use case kecil dulu.
3. Misalnya bagian yang repetitif, low-risk, dan hasilnya mudah diukur.
4. Dari situ baru kita lihat apakah layak diperluas.

Catatan:
1. Jangan overpromise kemampuan AI.
2. Jawaban harus menenangkan.
3. Cocok untuk client meeting.

---

## Adegan 21 — Lawan Bicara Bilang Leads Banyak Tapi Kualitas Rendah

Lawan bicara:
“Leads kami banyak, tapi yang benar-benar serius sedikit.”

Behavior MVP:
Orviko memahami bahwa ini adalah masalah kualitas funnel.  
User perlu menanggapi dengan insight marketing/sales.

User klik “Bantu Jawab”

Output MVP:
1. Berarti masalahnya bukan hanya volume leads, tapi kualitas dan intent-nya.
2. Kita perlu lihat lagi source leads, messaging campaign, dan filtering di awal.
3. Kadang jumlah leads tinggi justru menandakan targeting terlalu luas.
4. Jadi fokusnya bukan tambah leads dulu, tapi memperbaiki kualitas leads yang masuk.

Catatan:
1. Jawaban harus nyambung dengan masalah.
2. Jangan langsung menyarankan tambah budget.
3. Cocok untuk sales dan marketing meeting.

---

## Adegan 22 — Lawan Bicara Bilang Approval Internal Lama

Lawan bicara:
“Di internal kami, approval biasanya agak lama karena banyak stakeholder.”

Behavior MVP:
Orviko memahami bahwa ini sinyal proses keputusan kompleks.  
User perlu menanggapi dengan membantu proses, bukan menekan.

User klik “Bantu Jawab”

Output MVP:
1. Saya paham, berarti kita perlu bantu supaya proses approval-nya lebih mudah.
2. Mungkin kita bisa siapkan versi ringkas untuk stakeholder yang hanya butuh high-level view.
3. Lalu detail teknis dan budget bisa dipisah di dokumen pendukung.
4. Jadi tiap pihak bisa melihat informasi sesuai kebutuhannya.

Catatan:
1. Jangan memaksa keputusan cepat.
2. Tawarkan bantuan yang memudahkan stakeholder.
3. Cocok untuk B2B sales dan consulting.

---

## Adegan 23 — Lawan Bicara Bilang Customer Sensitif Harga

Lawan bicara:
“Customer sekarang makin sensitif sama harga.”

Behavior MVP:
Orviko memahami ini sebagai insight pasar.  
User perlu menanggapi dengan perspektif bisnis.

User klik “Bantu Jawab”

Output MVP:
1. Iya, berarti positioning value jadi makin penting.
2. Kalau customer sensitif harga, mereka perlu lebih cepat paham apa manfaat langsung yang mereka dapat.
3. Jadi komunikasi offer-nya harus dibuat lebih sederhana dan lebih konkret.
4. Bukan hanya menjelaskan fitur, tapi menunjukkan hasil yang bisa mereka rasakan.

Catatan:
1. Jawaban harus strategis.
2. Jangan terlalu akademis.
3. Cocok untuk sales, marketing, dan product meeting.

---

## Adegan 24 — Lawan Bicara Bilang Keputusan Harus Minggu Ini

Lawan bicara:
“Keputusan ini harus sudah clear minggu ini.”

Behavior MVP:
Orviko memahami ada urgency.  
User perlu memberi respons yang menunjukkan kesiapan dan next step.

User klik “Bantu Jawab”

Output MVP:
1. Baik, berarti kita perlu rapikan keputusan dan action item secepat mungkin.
2. Saya sarankan kita sepakati dulu opsi yang paling realistis hari ini.
3. Setelah itu baru kita finalize detailnya agar tidak mundur lagi.
4. Saya bisa bantu susun poin keputusan yang perlu dikunci.

Catatan:
1. Respons harus tenang.
2. Tunjukkan readiness.
3. Cocok untuk internal meeting dan client meeting.

---

# Contoh Search Behavior

Search bukan tombol terpisah.

Search adalah proses di belakang layar yang bisa terjadi saat user klik **Bantu Jawab**, jika Orviko menilai topiknya membutuhkan data eksternal.

Search dipakai jika:
1. Lawan bicara menyebut topik yang membutuhkan data terbaru.
2. Jawaban akan lebih kuat jika memakai fakta eksternal.
3. Orviko tidak cukup hanya mengandalkan konteks meeting.
4. User sedang butuh insight yang faktual, bukan sekadar respons umum.

---

## Adegan 25 — Search untuk Market Trend

Lawan bicara:
“Kayaknya social commerce lagi naik lagi ya.”

Behavior MVP:
Orviko memahami bahwa ini topik yang bisa didukung data eksternal.  
Jika search tersedia, Orviko boleh mencari data terbaru di belakang layar.  
Namun user tetap klik tombol yang sama.

User klik “Bantu Jawab”

Output MVP:
1. Bisa jadi iya, tapi tetap perlu dilihat dari data terbaru dan industrinya.
2. Kalau trennya memang naik, ini bisa jadi alasan untuk mulai testing channel social commerce.
3. Tapi sebaiknya tetap mulai kecil dulu dan ukur dari conversion, bukan hanya traffic.

Catatan:
1. Jangan mengarang data.
2. Kalau search menemukan data, masukkan secara singkat.
3. Jangan membuat output terlalu panjang.

---

## Adegan 26 — Search untuk Kompetitor

Lawan bicara:
“Kompetitor kita belakangan sering muncul di LinkedIn.”

Behavior MVP:
Orviko memahami bahwa user mungkin butuh konteks kompetitor.  
Jika search tersedia, Orviko boleh membaca informasi publik terkait kompetitor.  
Namun user tetap klik tombol yang sama.

User klik “Bantu Jawab”

Output MVP:
1. Menarik, berarti mereka mungkin sedang push awareness atau employer branding.
2. Kita bisa cek pola kontennya dulu: apakah fokus ke product, hiring, thought leadership, atau customer story.
3. Dari situ baru kita tentukan apakah perlu merespons dengan campaign serupa atau pendekatan berbeda.

Catatan:
1. Search bisa digunakan untuk melihat aktivitas publik kompetitor.
2. Jangan menyimpulkan strategi internal kompetitor tanpa bukti.
3. Jawaban harus tetap aman dan profesional.

---

## Adegan 27 — Search untuk Fakta Industri

Lawan bicara:
“Industri healthcare sekarang mulai banyak pakai AI.”

Behavior MVP:
Orviko memahami bahwa ini topik industri yang bisa diperkuat data.  
Jika search tersedia, Orviko boleh mencari konteks eksternal.  
Namun user tetap klik tombol yang sama.

User klik “Bantu Jawab”

Output MVP:
1. Iya, arahnya memang banyak organisasi mulai melihat AI untuk efisiensi dan decision support.
2. Tapi untuk healthcare, implementasinya perlu hati-hati karena ada isu akurasi, privasi, dan regulasi.
3. Jadi use case yang paling aman biasanya dimulai dari admin, dokumentasi, atau workflow support dulu.

Catatan:
1. Jangan membuat klaim medis.
2. Jangan menyarankan AI menggantikan keputusan profesional.
3. Cocok untuk meeting healthcare, SaaS, dan consulting.

---

## Adegan 28 — Search untuk Benchmark

Lawan bicara:
“Normalnya conversion rate untuk landing page itu berapa?”

Behavior MVP:
Orviko memahami bahwa user butuh benchmark.  
Jika search tersedia, Orviko boleh mencari benchmark eksternal.  
Namun user tetap klik tombol yang sama.

User klik “Bantu Jawab”

Output MVP:
1. Benchmark bisa berbeda tergantung industri, channel, dan offer.
2. Jadi angka umum hanya bisa jadi pembanding kasar.
3. Yang lebih penting adalah membandingkan conversion rate saat ini dengan performa historis campaign sendiri.
4. Setelah itu baru kita lihat apakah masalahnya di traffic, offer, atau landing page.

Catatan:
1. Jangan memberi angka asal.
2. Jika search menemukan benchmark valid, sebutkan dengan konteks.
3. Tekankan bahwa benchmark tidak berlaku universal.

---

# Contoh Jelaskan Maksudnya

Tombol ini dipakai jika user tidak paham maksud ucapan lawan bicara.

---

## Adegan 29 — User Tidak Paham Istilah CAC

Lawan bicara:
“CAC kita masih terlalu tinggi untuk scale budget bulan depan.”

Behavior MVP:
Orviko memahami bahwa user mungkin tidak paham istilah CAC atau implikasinya.  
User klik tombol untuk memahami maksud ucapan lawan bicara.

User klik “Jelaskan Maksudnya”

Output MVP:
1. Maksudnya, biaya untuk mendapatkan satu customer masih dianggap terlalu mahal.
2. Jadi mereka belum nyaman menaikkan budget karena takut biaya akuisisinya makin tidak efisien.
3. Intinya mereka ingin cost per customer lebih sehat dulu sebelum scale.

Catatan:
1. Jangan menjawab seolah-olah user sedang bicara ke lawan bicara.
2. Output ini untuk membantu user memahami konteks.
3. Gunakan bahasa sederhana.

---

## Adegan 30 — User Tidak Paham Scope MVP

Lawan bicara:
“Kita jangan terlalu melebar, scope MVP-nya harus dikunci dulu.”

Behavior MVP:
Orviko memahami bahwa user perlu penjelasan maksud kalimat tersebut.

User klik “Jelaskan Maksudnya”

Output MVP:
1. Maksudnya, mereka ingin fitur awal dibatasi dulu.
2. Jangan terlalu banyak fitur sebelum value utama produk terbukti.
3. Jadi fokusnya adalah membuat versi pertama yang kecil tapi cukup untuk validasi.

Catatan:
1. Penjelasan harus ringkas.
2. Jangan memberi saran terlalu panjang.
3. Fokus menjelaskan maksud ucapan lawan bicara.

---

# Contoh Pertanyaan Follow-up

Tombol ini dipakai saat user ingin bertanya balik secara relevan.

---

## Adegan 31 — Follow-up untuk Budget Ketat

Lawan bicara:
“Tahun ini budget kami lebih ketat, jadi agak hati-hati untuk ambil keputusan.”

Behavior MVP:
Orviko membantu user membuat pertanyaan lanjutan yang natural dan berguna.

User klik “Pertanyaan Follow-up”

Output MVP:
1. Kalau boleh tahu, prioritas budget tahun ini lebih difokuskan ke efisiensi cost atau growth?
2. Dari situ kami bisa bantu sesuaikan scope agar lebih realistis dengan kebutuhan tim.

Catatan:
1. Pertanyaan follow-up harus membantu menggali kebutuhan.
2. Jangan terdengar menginterogasi.
3. Pertanyaan harus relevan dengan ucapan lawan bicara.

---

## Adegan 32 — Follow-up untuk Data Berantakan

Lawan bicara:
“Masalahnya data kami masih berantakan dan tersebar di banyak file.”

Behavior MVP:
Orviko membantu user bertanya balik untuk memperjelas masalah.

User klik “Pertanyaan Follow-up”

Output MVP:
1. Saat ini data yang paling sering dipakai untuk keputusan bisnis itu data apa?
2. Apakah masalah utamanya lebih ke format data, lokasi penyimpanan, atau konsistensi antar file?

Catatan:
1. Pertanyaan harus spesifik.
2. Bantu user menggali akar masalah.
3. Cocok untuk consulting dan discovery call.

---

# Contoh Keywords

Keywords diambil dari kata/topik penting yang disebut lawan bicara, bukan dari jenis pertanyaan.

---

## Contoh 1

Lawan bicara:
“Kami lagi coba TikTok Ads, tapi CAC-nya masih tinggi.”

Keywords:
TikTok Ads, CAC

---

## Contoh 2

Lawan bicara:
“Leads masuk banyak, tapi conversion ke meeting rendah.”

Keywords:
leads, conversion, meeting

---

## Contoh 3

Lawan bicara:
“Budget tahun ini lebih ketat, jadi harus jelas ROI-nya.”

Keywords:
budget, ROI

---

## Contoh 4

Lawan bicara:
“Tim sales butuh materi yang lebih kuat untuk follow-up customer.”

Keywords:
sales, follow-up, customer

---

## Contoh 5

Lawan bicara:
“Kami ingin dashboard yang bisa bantu decision making, bukan cuma laporan.”

Keywords:
dashboard, decision making

---

## Contoh 6

Lawan bicara:
“Masalah terbesar kami sekarang data masih berantakan.”

Keywords:
data quality, data cleaning

---

## Contoh 7

Lawan bicara:
“Approval internal biasanya lama karena stakeholder-nya banyak.”

Keywords:
approval, stakeholder

---

## Contoh 8

Lawan bicara:
“Customer makin sensitif harga, tapi kami tidak mau perang harga.”

Keywords:
price sensitivity, pricing, value proposition

---

## Contoh 9

Lawan bicara:
“Kami lagi mempertimbangkan automation untuk proses manual.”

Keywords:
automation, manual process

---

## Contoh 10

Lawan bicara:
“Campaign Ramadan kemarin traffic-nya tinggi tapi sales-nya biasa aja.”

Keywords:
campaign Ramadan, traffic, sales

---

## Contoh 11

Lawan bicara:
“Tim engineering minta scope yang lebih jelas sebelum mulai development.”

Keywords:
engineering, scope, development

---

## Contoh 12

Lawan bicara:
“Kami mau mulai dari MVP dulu, jangan terlalu banyak fitur.”

Keywords:
MVP, fitur

---

## Contoh 13

Lawan bicara:
“Brand awareness kami masih rendah di segmen B2B.”

Keywords:
brand awareness, B2B

---

## Contoh 14

Lawan bicara:
“Kami ingin masuk ke market baru, tapi belum tahu channel yang paling cocok.”

Keywords:
market baru, channel

---

## Contoh 15

Lawan bicara:
“Kami pernah pakai vendor sebelumnya, tapi responsnya lambat.”

Keywords:
vendor, response time

---

## Contoh 16

Lawan bicara:
“AI menarik, tapi kami masih khawatir soal keamanan data.”

Keywords:
AI, keamanan data

---

## Contoh 17

Lawan bicara:
“User banyak drop di proses onboarding.”

Keywords:
user drop, onboarding

---

## Contoh 18

Lawan bicara:
“Kami butuh quick win yang bisa kelihatan hasilnya dalam waktu dekat.”

Keywords:
quick win, hasil

---

## Contoh 19

Lawan bicara:
“Kompetitor mulai agresif di pricing.”

Keywords:
kompetitor, pricing

---

## Contoh 20

Lawan bicara:
“Kami ingin solusi yang gampang dijelaskan ke manajemen.”

Keywords:
solusi, manajemen

---

# Ringkasan Behavior untuk Engineer

## QnA Mode

Trigger:
Lawan bicara bertanya langsung.

Contoh:
- “Kenapa performa campaign turun?”
- “Progress project sampai mana?”
- “Fitur ini perlu masuk MVP atau tidak?”
- “Kenapa sistem lambat?”
- “Apa metrik keberhasilannya?”

Expected behavior:
1. Deteksi intent pertanyaan.
2. Ambil konteks meeting jika tersedia.
3. Jika butuh data eksternal, search boleh berjalan di belakang layar.
4. User tetap klik **Bantu Jawab**.
5. Berikan jawaban ringkas, berbentuk poin, dan siap diucapkan.

---

## Convo Mode

Trigger:
Lawan bicara menyampaikan cerita, opini, concern, insight, atau konteks tanpa bertanya langsung.

Contoh:
- “Budget kami tahun ini lebih ketat.”
- “Tim kami overwhelmed.”
- “Kompetitor makin agresif.”
- “Data kami masih berantakan.”
- “AI menarik, tapi kami masih ragu.”

Expected behavior:
1. Pahami konteks ucapan lawan bicara.
2. Tentukan respons terbaik: empati, insight, klarifikasi, atau arahan.
3. User tetap klik **Bantu Jawab**.
4. Jangan buat tombol baru hanya karena konteksnya bukan pertanyaan.
5. Output harus natural dan nyambung.

---

## Search Behavior

Trigger:
Topik membutuhkan data eksternal atau fakta terbaru.

Expected behavior:
1. Search bukan tombol baru.
2. Search boleh terjadi setelah user klik **Bantu Jawab**.
3. Jangan mengarang fakta.
4. Jika data tidak cukup, output harus aman.
5. Hasil search harus diringkas menjadi respons meeting yang natural.
6. Jangan mengubah output menjadi artikel panjang.

---

## Keywords Behavior

Trigger:
Lawan bicara menyebut topik penting.

Expected behavior:
1. Ambil keyword dari topik penting yang disebut lawan bicara.
2. Jangan ambil keyword dari tipe pertanyaan.
3. Keyword harus singkat.
4. Keyword boleh lebih dari satu.
5. Jika tidak ada topik penting, tidak perlu memunculkan keyword.

Contoh salah:
Lawan bicara:
“Menurut kamu kenapa campaign ini turun?”

Keywords:
pertanyaan analisis

Contoh benar:
Lawan bicara:
“Menurut kamu kenapa campaign TikTok Ads ini turun, padahal budget sama?”

Keywords:
campaign TikTok Ads, budget

---

# Scope yang Tidak Boleh Ditambahkan

Jangan menambahkan tombol baru seperti:
- Bantu Tanggapi
- Tambah Insight
- Cari Data
- Buat Lebih Profesional
- Analisis
- Riset
- Mode Profesional

Semua variasi bantuan utama tetap masuk ke tombol **Bantu Jawab**.

Alasannya:
1. MVP harus sederhana.
2. User tidak perlu bingung memilih terlalu banyak tombol.
3. Behavior engineer lebih mudah dikontrol.
4. Scope produk tidak melebar terlalu cepat.
