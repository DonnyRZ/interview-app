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

Untuk QA packaged app yang akan diklik langsung di Windows, gunakan beta-signed flow:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win:beta
```

Setelah itu wajib cek signature:

```powershell
npm.cmd --workspace @interview-app/desktop run cert:beta:check
```

`package:win` biasa menghasilkan app unsigned. Jangan pakai command itu untuk artefak yang akan dites dengan cara klik `Interview App.exe`, karena Smart App Control Windows bisa memblokir app unsigned.

Command unsigned hanya boleh dipakai untuk kebutuhan engineering cepat yang tidak membutuhkan klik/run packaged app:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win
```

Untuk membuat installer distribusi:

```powershell
npm.cmd --workspace @interview-app/desktop run dist:win:beta
```

## Rule kerja

- Jika perubahan terlihat benar di mode dev tetapi tidak benar di `win-unpacked`, hal pertama yang dicek adalah apakah packaging ulang sudah dijalankan.
- Untuk testing klik app di Windows, packaging ulang harus memakai `package:win:beta`, bukan `package:win`.
- Setelah packaging beta, jalankan `cert:beta:check`; status `NotSigned` berarti artefak belum boleh dites sebagai packaged app.
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
- Jangan mengganti artefak `win-unpacked` yang biasa dites owner dengan build unsigned.
- Saat menjelaskan opsi ke owner, bedakan jelas antara:
  - `free beta/self-signed flow`
  - `paid commercial signing flow`
- Untuk tahap sekarang, default thinking yang benar adalah: selesaikan sebanyak mungkin lewat flow gratis dulu.

## Contoh kesalahan yang harus dihindari

Kasus nyata yang pernah terjadi:

1. Engineer ingin refresh `win-unpacked` setelah code berubah.
2. Engineer menjalankan command biasa:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win
```

3. `win-unpacked` memang ter-refresh, tetapi `Interview App.exe` menjadi `NotSigned`.
4. Owner klik icon/app yang sama seperti biasa.
5. Windows Smart App Control memblokir app karena tidak bisa memverifikasi publisher.

Masalahnya bukan owner salah klik. Masalahnya artefak packaged diganti menjadi unsigned.

Don't:

- Jangan pakai `package:win` untuk build yang akan diklik/test owner di Windows.
- Jangan menganggap timestamp fresh berarti packaged app sudah aman dijalankan.
- Jangan skip `cert:beta:check` setelah membuat packaged build beta.

Do:

- Pakai `package:win:beta` untuk refresh `win-unpacked` yang akan dites owner.
- Jalankan `cert:beta:check` setelah packaging beta.
- Pastikan hasil check minimal menunjukkan:
  - `Packaged app signature valid`
  - `Packaged helper signature valid`
  - certificate trusted di `CurrentUser Root`
  - certificate trusted di `CurrentUser TrustedPublisher`

Command yang benar untuk kasus ini:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win:beta
npm.cmd --workspace @interview-app/desktop run cert:beta:check
```

## Rekap blocker PFX/signing terbaru

Kasus nyata yang terjadi saat refresh `win-unpacked`:

1. Engineer sudah memperbaiki logic app dan menjalankan `npm.cmd --workspace @interview-app/desktop run build`.
2. `build` berhasil, tetapi `win-unpacked` belum ikut berubah karena `build` hanya update `dist` dan `dist-electron`.
3. Engineer lalu menjalankan `package:win` biasa untuk refresh `win-unpacked`.
4. `win-unpacked` memang fresh, tetapi app dan helper menjadi unsigned.
5. Ini melanggar rule dokumen ini, karena artefak yang akan diklik owner harus lewat beta-signed flow.
6. Saat mau memperbaiki dengan `package:win:beta`, muncul blocker PFX/password certificate.
7. PFX file ada, tetapi password lama tidak tersedia di environment.
8. Private key certificate juga awalnya tidak siap dipakai langsung dari `CurrentUser\My`.
9. Solusi akhirnya adalah membuat/mengekspor ulang beta PFX lokal, trust certificate ke `CurrentUser Root` dan `CurrentUser TrustedPublisher`, lalu menjalankan beta package/sign/check.
10. Operasi trust certificate sempat hang saat dijalankan tanpa permission cukup; command perlu dijalankan dengan elevated permission.

Hasil akhir yang benar:

- `Native helper signature valid`
- `Packaged app signature valid`
- `Packaged helper signature valid`
- certificate trusted di `CurrentUser Root`
- certificate trusted di `CurrentUser TrustedPublisher`
- `Beta certificate checks passed`

## Playbook anti-terulang

Sebelum owner mengetes `win-unpacked`, engineer wajib mengikuti urutan ini:

1. Jalankan typecheck/build sesuai kebutuhan fitur.
2. Refresh packaged artifact hanya dengan:

```powershell
npm.cmd --workspace @interview-app/desktop run package:win:beta
```

3. Verifikasi langsung dengan:

```powershell
npm.cmd --workspace @interview-app/desktop run cert:beta:check
```

4. Kalau `package:win:beta` meminta password PFX, jangan fallback ke `package:win`.
5. Kalau password PFX tidak tersedia untuk local beta, recreate/export beta cert lokal dengan password baru, trust cert, lalu package beta.
6. Kalau trust cert hang/gagal, jalankan trust/package/check dengan permission yang cukup.
7. Jangan bilang `win-unpacked` siap dites sebelum `cert:beta:check` pass.

Quick sanity check setelah packaging:

```powershell
Get-AuthenticodeSignature "apps/desktop/release/win-unpacked/Interview App.exe"
Get-AuthenticodeSignature "apps/desktop/release/win-unpacked/resources/native/windows-loopback/WasapiLoopbackProbe.exe"
```

Kedua status harus `Valid`. Jika `NotSigned`, artefak itu belum boleh dipakai untuk testing klik Windows.
