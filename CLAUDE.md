# Kapkup

Editor video lokal (Next.js 16 + Remotion 4). Setiap project adalah folder berisi `project.json` + media; editor dan Claude mengedit file yang sama, dan editor memuat ulang otomatis saat file berubah.

@AGENTS.md

## Menjalankan

```bash
npm run dev        # editor di http://localhost:3000
npm run lint && npm run typecheck && npm test
```

Jangan menjalankan `next dev` kedua di folder ini: Next menolak. Kalau port 3000 sudah dipakai server milik pengguna, pakai server itu.

## Mengedit video lewat file

Project ada di `workspace/<id>/project.json`. Alur kerja:

1. `npm run kapkup -- list` untuk melihat id project.
2. Tambah media dengan `npm run kapkup -- add-media <id> <file...>` (menyalin file, membaca durasi/resolusi, membuat thumbnail). Jangan menulis entri `assets` dengan tangan.
3. Edit `project.json` (bagian `tracks`). Field yang punya default boleh dihilangkan.
4. `npm run kapkup -- validate <id>` harus mengeluarkan `OK`.
5. Periksa hasilnya dengan `npm run kapkup -- still <id> <ms> 0.2` lalu baca PNG di `workspace/<id>/cache/still-<ms>.png`. Skala 0.2 cukup dan hemat token.
6. Export: `npm run kapkup -- export <id> [nama=nilai ...] [--format mp4|gif|mp3] [--out nama]`.

Perintah lain: `new "Nama" [9:16|16:9|1:1|4:5]`, `transcribe <id> <idKlip> [model] [bahasa]` (caption otomatis; pemakaian pertama mengunduh Whisper, minta izin pengguna dulu).

### Aturan format

Sumber kebenaran: `src/lib/project/schema.ts` (zod) dan `checkProject()` di file yang sama.

- Semua waktu dalam milidetik bulat.
- `tracks` berurutan dari atas ke bawah; track pertama tampil paling depan.
- Jenis track dan isinya: `text` (item `text`, `captions`), `fx` (item `effect`, `adjustment`; berlaku untuk semua track di bawahnya), `video` (item `video`, `image`), `audio` (item `audio`).
- Item dalam satu track tidak boleh tumpang tindih. Pakai track kedua untuk menumpuk.
- `startMs`/`durationMs` adalah posisi di timeline. Untuk video/audio, `inMs` adalah titik mulai di file sumber, dan `inMs + durationMs × speed` tidak boleh melebihi durasi aset.
- `transform.x/y` adalah geseran dari tengah kanvas dalam piksel kanvas; `scale` 1 = ukuran pas.
- `keyframes` (video, gambar, teks, caption): daftar `{ atMs, x, y, scale, rotation, opacity, easing }` terurut, `atMs` relatif terhadap awal klip. Bila ada keyframe, `transform` diabaikan. Zoom masuk = dua keyframe dengan `scale` 1 lalu 1.3.
- `transitionIn` (video, gambar): transisi di awal klip dari klip sebelumnya yang menempel persis (`akhir = startMs`) di track yang sama.
- `animationIn` / `animationOut` (video, gambar, teks): `{ type, durationMs }`, animasi saat klip muncul dan menghilang.
- `backdropBlur` (video, gambar): angka > 0 menaruh salinan klip yang diburamkan memenuhi kanvas di belakangnya. Dipakai untuk video horizontal di kanvas vertikal: `fit: "contain"` + `backdropBlur: 40`.
- `mask` (video, gambar): `{ shape, x, y, width, height, rotation, feather, radius, invert }` dalam piksel kanvas relatif terhadap tengah klip; bentuk: `rectangle`, `circle`, `split`, `filmstrip`, `star`, `heart`.
- `flipX` / `flipY`, `blendMode` (video, gambar); `adjust.tint` (hijau–magenta) di samping `temperature`.
- Klip `audio` punya `speed`, dan boleh memakai aset video yang bersuara (hasil "Pisahkan suara"; klip videonya diberi `volume: 0`).
- `coverMs`: waktu frame sampul; gambarnya `cover.png` di folder project (dibuat lewat tombol Sampul).
- Daftar id efek, transisi, animasi, dan preset warna: `src/lib/project/catalog.ts`.
- `captions.words`: `{ text, startMs, endMs }` per kata; `pageMs` mengatur berapa lama kata dikelompokkan.
- `variables`: `{{nama}}` di dalam teks diganti nilainya.

## Struktur kode

- `src/remotion/` — komposisi video. Dipakai preview (Player) **dan** render. Hanya boleh impor relatif, karena dibundel terpisah oleh Remotion. `fx.ts` berisi cara menggambar efek/transisi sebagai fungsi murni dari nomor frame.
- `src/lib/project/` — skema, katalog, animasi keyframe, caption (murni, tanpa React). Ikut dibundel render.
- `src/lib/timeline/ops.ts` — logika timeline murni (tabrakan, snap, belah).
- `src/lib/server/` — akses disk, FFmpeg, transkripsi. Hanya untuk route handler dan skrip.
- `src/store/editor.ts` — state editor (zustand + immer) dengan undo/redo.
- `src/components/editor/` — panel editor. `scripts/` — render dan CLI (dijalankan dengan `tsx`).

## Hal yang mudah salah

- FFmpeg yang dipakai adalah bawaan Remotion (`ffBin()` di `src/lib/server/media.ts`). Ia tidak punya filter `scdet`/`select`/`tile` dan tidak bisa menulis PCM mentah (`-f s16le`); pakai `-f wav`. JPEG perlu `format=yuvj420p`.
- Jangan menamai token warna dengan awalan `clip-`: `bg-clip-text` adalah utilitas Tailwind dan membuat latar hilang. Token klip memakai awalan `item-`.
- Preview dan render harus identik: efek tidak boleh memakai `Math.random()` atau waktu nyata, hanya nomor frame (`random(seed)` dari Remotion).
- Elemen video tidak boleh dibuat ulang saat state berubah: jaga susunan JSX tetap sama (lihat `TransitionLayer`).
- Kotak seleksi di player (`StageOverlay.tsx`) membaca posisi dari atribut `data-kapkup-item` dan `data-kapkup-root` di komposisi. Jangan menghapus atribut itu.
- Server dev kadang tetap memakai versi lama sebuah modul server setelah file diubah (terjadi pada `src/lib/server/media.ts`: ekspor baru "is not a function"). Kalau route memberi error seperti itu padahal kodenya benar, minta pengguna menjalankan ulang `npm run dev`; jangan mematikan server milik pengguna.
- Di Windows, `rename` ke `project.json` bisa gagal sesaat; `writeProject()` sudah mencoba ulang. Jangan menulis file itu dengan cara lain dari kode server.
- Di PowerShell, path berisi `[id]` harus memakai `-LiteralPath`.
- Lebar/tinggi kanvas dan hasil export H.264 harus genap.
- Bundel render di-cache di `.kapkup/bundle` berdasarkan isi `src/remotion` dan `src/lib/project`.

## Tampilan

Tema gelap dengan token di `src/app/globals.css`; pakai kelas token (`bg-surface`, `text-muted-foreground`), bukan warna mentah. Editor memakai aksen cyan (`primary`); pengguna memutuskan mempertahankannya pada 12 November 2026, jadi jangan diganti ke kobalt tanpa diminta. Teks UI berbahasa Indonesia.

Halaman depan memakai tema Garuda Nexa (kelas `.theme-garuda` di `globals.css`, menimpa token yang sama): kanvas `#08090b`, kartu `rounded-[20px]` dengan `ring-1 ring-inset ring-border` tanpa bayangan, tombol dan input `h-11 rounded-xl`, aksen kobalt `#5553ff`. Sumbernya panel admin di `..\Garuda Nexa\src\styles\admin.css`. Editor tetap memakai token dasar (aksen cyan). Footer: "© tahun PT. Garuda Nexa Bahtera. Semua hak dilindungi." dengan tautan ke garudanexa.com.

Logo: `public/brand/logo.svg` (satu warna, dipangkas pas). Tampilkan lewat komponen `Logo` (`src/components/brand/Logo.tsx`), yang mewarnainya mengikuti warna teks. Favicon: `src/app/icon.svg` (logo putih di atas kotak gelap).

## Lisensi

Remotion gratis untuk perorangan dan perusahaan sampai 3 karyawan; di atas itu perlu lisensi perusahaan (remotion.dev/license).
