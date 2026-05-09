# Win Unpacked

`win-unpacked` adalah hasil aplikasi Windows yang sudah dipackage oleh Electron, tetapi belum dijadikan installer.

Lokasi default:

`apps/desktop/release/win-unpacked`

Isi penting di dalamnya:

- `Interview App.exe`: executable app desktop yang bisa langsung dijalankan
- `resources/app.asar`: bundle source app yang sudah dipackage
- `resources/native/...`: native helper/resource yang ikut dibawa app

## Kapan dipakai

- Pakai `desktop/dev` saat development cepat
- Pakai `win-unpacked` saat ingin tes perilaku versi packaged
- Pakai installer release saat distribusi ke customer

## Perbedaan penting

`npm run build` tidak meng-update `win-unpacked`.

`build` hanya meng-update output source seperti:

- `dist`
- `dist-electron`

Agar `win-unpacked` ikut membawa perubahan terbaru, engineer harus menjalankan packaging ulang.

## Command yang relevan

Untuk refresh `win-unpacked`:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win
```

Untuk membuat installer distribusi:

```powershell
npm.cmd --workspace @interview-app/desktop run dist:win
```

## Rule kerja

- Jika perubahan terlihat benar di mode dev tetapi tidak benar di `win-unpacked`, hal pertama yang dicek adalah apakah packaging ulang sudah dijalankan.
- Jangan audit logic runtime terlalu jauh sebelum memastikan `win-unpacked` memang fresh.
- Cocokkan timestamp file berikut saat verifikasi:
  - `release/win-unpacked/Interview App.exe`
  - `release/win-unpacked/resources/app.asar`
  - `release/win-unpacked/resources/native/windows-loopback/WasapiLoopbackProbe.exe`

## Hubungan dengan distribusi customer

`win-unpacked` berguna untuk QA versi packaged, tetapi biasanya bukan artefak final yang dibagikan ke customer.

Untuk distribusi customer, alur normalnya:

1. Build source terbaru
2. Package app
3. Buat installer release
4. Customer install dari installer

Singkatnya: `win-unpacked` adalah checkpoint penting sebelum masuk tahap distribusi.

## Preferensi distribusi saat ini

Untuk tahap sekarang, owner produk belum ingin bergantung pada solusi berbayar seperti code signing certificate komersial.

Artinya, engineer berikutnya harus paham bahwa arah sementara yang diinginkan adalah:

- optimalkan flow gratis dulu
- utamakan beta/local distribution yang masih realistis dipakai tanpa biaya certificate komersial
- jangan langsung mengasumsikan semua masalah packaging harus diselesaikan dengan membeli certificate berbayar

## Strategi gratis yang sedang diprioritaskan

Metode yang dipakai saat ini adalah pendekatan beta dengan certificate lokal/self-signed untuk testing terbatas.

Tujuannya:

- packaged app tetap bisa dites dalam bentuk yang mendekati release
- native helper bisa ikut ditandatangani untuk flow beta/internal
- user beta bisa memakai app dengan langkah trust certificate yang jelas
- tim bisa terus iterasi tanpa langsung keluar biaya certificate publisher komersial

Script yang relevan:

- `npm.cmd --workspace @interview-app/desktop run cert:beta:create`
- `npm.cmd --workspace @interview-app/desktop run cert:beta:trust`
- `npm.cmd --workspace @interview-app/desktop run package:win:beta`
- `npm.cmd --workspace @interview-app/desktop run dist:win:beta`

Folder/script terkait:

- `apps/desktop/scripts/windows-beta-cert`
- `apps/desktop/certs/beta`

## Batasan yang harus dipahami

Self-signed atau beta certificate adalah solusi gratis untuk development, QA, dan beta distribution terbatas.

Ini bukan pengganti final untuk public-scale distribution karena:

- Windows masih bisa memberi warning di mesin yang belum trust certificate
- user beta mungkin perlu trust certificate dulu
- trust level-nya tidak sama dengan publisher certificate resmi

Namun untuk niat produk saat ini, pendekatan gratis ini tetap harus dihormati dan dimaksimalkan dulu sebelum mendorong solusi berbayar.

## Aturan untuk engineer berikutnya

- Jangan buru-buru mengubah arah ke certificate berbayar kecuali owner memang sudah setuju.
- Jika ada friction Windows Security, cek dulu apakah flow beta certificate gratis sudah dijalankan dengan benar.
- Saat menjelaskan opsi ke owner, bedakan jelas antara:
  - `free beta/self-signed flow`
  - `paid commercial signing flow`
- Untuk tahap sekarang, default thinking yang benar adalah: selesaikan sebanyak mungkin lewat flow gratis dulu.
