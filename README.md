# Kapkup

Editor video multi-track yang berjalan di komputer sendiri, dibangun dengan Next.js 16 dan Remotion 4. Setiap project disimpan sebagai folder berisi `project.json` dan medianya, sehingga bisa diedit lewat tampilan editor maupun langsung lewat file.

## Fitur

- Timeline multi-track: geser, potong, belah, gandakan, tempel otomatis, undo/redo.
- Teks, caption per kata (impor `.srt`/`.vtt`), dan variabel teks `{{nama}}`.
- 24 efek, 30 transisi, 33 animasi masuk/keluar, mask, dan penyesuaian warna.
- Keyframe untuk posisi, skala, rotasi, dan opasitas.
- Latar buram untuk video horizontal di kanvas vertikal.
- Export MP4 (H.264) dengan pilihan resolusi dan kualitas.
- Editor memuat ulang sendiri saat `project.json` diubah dari luar.

## Menjalankan

Butuh Node.js 20 atau lebih baru. FFmpeg tidak perlu dipasang terpisah; yang dipakai adalah bawaan Remotion.

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Project tersimpan di folder `workspace/` (tidak ikut ke Git).

## Perintah lain

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Alat baris perintah untuk mengedit lewat file:

```bash
npm run kapkup -- list
npm run kapkup -- new "Nama project" 9:16
npm run kapkup -- add-media <id> <file...>
npm run kapkup -- validate <id>
npm run kapkup -- still <id> <ms> 0.2
npm run kapkup -- export <id> nama=nilai --format mp4
```

## Dokumentasi

- [CLAUDE.md](CLAUDE.md): format `project.json`, struktur kode, dan hal yang mudah salah.
- [RENCANA.md](RENCANA.md): status fitur (yang sudah diuji, belum diuji, dan belum dikerjakan).

## Lisensi pihak ketiga

Remotion gratis untuk perorangan dan perusahaan sampai 3 karyawan; di atas itu perlu lisensi perusahaan. Lihat [remotion.dev/license](https://www.remotion.dev/license).

---

© 2026 [PT. Garuda Nexa Bahtera](https://garudanexa.com). Semua hak dilindungi.
