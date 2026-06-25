# Git History Remediation

Dokumen ini menjelaskan operasi terkoordinasi untuk menghapus data pengguna dan sample audio dari seluruh history Git.

## Paths yang Harus Dihapus

```text
storage/profile-documents/
Price-Calc/sample-audio/demo orviko awal.MP3
```

## Prasyarat

- Semua push ke repository dihentikan sementara.
- Perubahan Phase 0 sudah direview dan berada di remote.
- `git-filter-repo` tersedia pada mesin operator.
- Backup repository dibuat di lokasi terenkripsi dan aksesnya dibatasi.
- Seluruh maintainer mengetahui bahwa semua commit SHA akan berubah.

## Rewrite pada Mirror Clone

Jalankan dari direktori di luar working copy biasa:

```powershell
git clone --mirror https://github.com/DonnyRZ/interview-app.git interview-app-cleanup.git
Set-Location interview-app-cleanup.git

git filter-repo --force --invert-paths `
  --path storage/profile-documents `
  --path "Price-Calc/sample-audio/demo orviko awal.MP3"

git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

Verifikasi sebelum push:

```powershell
git rev-list --objects --all |
  Select-String -Pattern "storage/profile-documents|Price-Calc/sample-audio/demo orviko awal.MP3"
```

Perintah verifikasi tidak boleh menghasilkan output.

## Publish Rewrite

Setelah hasil diverifikasi:

```powershell
git remote add origin-clean https://github.com/DonnyRZ/interview-app.git
git push --force --mirror origin-clean
```

Force-push hanya dilakukan setelah approval eksplisit pemilik repository.

## Tindakan Setelah Rewrite

- Hapus atau arsipkan clone lama yang masih memiliki object sensitif.
- Semua contributor harus clone ulang; jangan merge dari clone lama.
- Minta GitHub Support membersihkan cached views atau pull-request refs jika object masih dapat diakses.
- Rotasi `SESSION_SECRET`, Google client secret, webhook secret, dan OpenAI key sebelum production deployment.
- Jalankan kembali secret scan dan object-path scan.

## Release Gate

Phase 0 belum dianggap selesai sampai:

- scan seluruh refs tidak menemukan kedua path;
- remote repository sudah menerima rewritten refs;
- clone baru tidak dapat menemukan blob sensitif;
- clone lama sudah ditangani;
- credential deployment sudah dirotasi.
