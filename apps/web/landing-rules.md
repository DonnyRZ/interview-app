# Landing Page Rules

Dokumen ini menjadi aturan kerja untuk landing page web Orviko agar halaman tetap mudah dikembangkan saat kebutuhan baru bertambah.

## Prinsip Utama

- Jangan menumpuk seluruh HTML, CSS, dan JavaScript di `index.html`.
- `index.html` hanya boleh menjadi struktur utama halaman dan entry point asset/script.
- CSS halaman harus dipindahkan ke file stylesheet terpisah.
- JavaScript interaksi harus dipindahkan ke file script terpisah.
- Perubahan baru harus mengikuti struktur yang sudah dipisah, bukan menambah inline style atau inline script besar lagi.

## Struktur Minimum yang Diinginkan

Tahap refactor pertama cukup gunakan struktur ringan ini:

```text
apps/web/
  index.html
  src/
    styles.css
    main.js
  public/
    assets/
```

Aturan per file:

- `index.html`
  Berisi markup utama landing page, metadata, link stylesheet, dan script entry.

- `src/styles.css`
  Berisi seluruh styling landing page, termasuk responsive styling dan media query.

- `src/main.js`
  Berisi seluruh logic interaksi seperti demo overlay, drag behavior, timer, response dummy, dan floating CTA.

## Aturan Pengembangan Section Baru

- Jika hanya menambah section statis kecil, tambahkan markup di `index.html` dan styling di `src/styles.css`.
- Jika section punya interaksi, simpan logic interaksinya di `src/main.js`.
- Jangan menulis JavaScript inline di dalam `index.html` kecuali sangat kecil dan benar-benar tidak reusable.
- Jangan menulis CSS inline pada elemen HTML.
- Jangan membuat file baru untuk setiap hal kecil. Pecah file hanya ketika section atau logic sudah cukup besar.

## Aturan Menambah File Baru

File baru hanya boleh dibuat jika ada alasan struktural yang jelas. Tujuannya adalah mengurangi tumpukan di satu file, bukan membuat banyak file kecil tanpa batas.

Boleh membuat file baru jika:

- section baru punya markup panjang, styling khusus, atau interaksi sendiri
- logic mulai sulit dibaca jika tetap digabung di `main.js`
- data/copy berulang perlu dikelola sebagai konfigurasi
- asset atau helper dipakai oleh lebih dari satu section
- satu file sudah mulai terlalu besar untuk direview dengan nyaman

Jangan membuat file baru jika:

- isinya hanya 1-2 fungsi kecil yang hanya dipakai sekali
- isinya hanya beberapa konstanta yang masih jelas berada dekat dengan logic pemakainya
- file dibuat hanya untuk mengikuti pola "satu komponen satu file" tanpa kebutuhan nyata
- pemisahan membuat pembaca harus lompat-lompat file untuk memahami satu section kecil

Panduan praktis:

- Jika sebuah section melewati sekitar 150-200 baris markup/template, pertimbangkan file section sendiri.
- Jika sebuah interaksi melewati sekitar 80-120 baris JavaScript, pertimbangkan module sendiri.
- Jika CSS untuk satu section melewati sekitar 150 baris dan sering berubah, pertimbangkan file CSS section sendiri.
- Jika file baru dibuat, namanya harus menjelaskan isi, bukan tipe generik seperti `utils.js` kecuali benar-benar berisi helper lintas section.

Penamaan file:

```text
src/
  main.js
  styles.css
  sections/
    compatibility.js
    interactive-demo.js
  data/
    demo-responses.js
  lib/
    dom.js
```

Aturan penamaan:

- Gunakan lowercase kebab-case untuk file: `interactive-demo.js`, bukan `InteractiveDemo.js`.
- Gunakan nama berbasis domain/section: `compatibility.js`, bukan `section-4.js`.
- Hindari `misc.js`, `helpers.js`, atau `common.js` sampai benar-benar ada kebutuhan lintas section.
- Jangan membuat folder baru jika satu file masih cukup jelas.

Setiap file baru harus punya tanggung jawab tunggal:

- file section mengurus satu section
- file data hanya berisi data/copy/config
- file lib hanya berisi helper reusable tanpa ketergantungan ke section tertentu
- file style section hanya berisi styling section tersebut

Jika menambah file baru, pastikan file itu di-import dari entry yang jelas (`main.js` atau stylesheet utama) dan tidak menjadi file yatim yang tidak dipakai.

## Kapan Perlu Pecah Per Section

Jika landing page makin besar, boleh lanjut ke struktur section-based:

```text
src/
  main.js
  styles.css
  sections/
    hero.js
    interactive-demo.js
    how-it-works.js
    comic.js
    compatibility.js
```

Gunakan struktur ini hanya kalau section mulai punya markup, data, atau interaksi yang besar. Jangan over-engineer sejak awal.

## Kapan Perlu Migrasi ke React

Pertimbangkan migrasi ke React jika landing page mulai membutuhkan:

- komponen reusable yang banyak
- state lintas section
- form download/waitlist dengan validasi
- pricing/FAQ interaktif
- analytics event yang kompleks
- eksperimen copy atau layout
- variasi section yang sering berubah

Jika belum ada kebutuhan seperti itu, static Vite dengan HTML/CSS/JS terpisah sudah cukup.

## Aturan Responsive

- Perubahan mobile harus dicek terhadap desain/sketsa mobile, bukan hanya dibuat "lebih kecil".
- Jangan mengubah desktop ketika memperbaiki mobile, kecuali memang diminta.
- Jika desktop sudah punya sistem visual yang baik, mobile harus menurunkan sistem itu secara konsisten.
- Untuk elemen badge/logo, jaga relasi posisi dengan frame, bukan hanya ukuran elemennya.

## Checklist Sebelum Selesai

- Build web berhasil dengan `npm --workspace @interview-app/web run build`.
- Tidak ada CSS besar atau JS besar yang baru ditambahkan inline ke `index.html`.
- Perubahan mobile dicek di viewport mobile.
- Perubahan desktop dicek jika CSS default atau breakpoint desktop ikut tersentuh.
- Asset baru disimpan di `public/assets` dan diberi nama yang jelas.
