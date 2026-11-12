# Rencana Kapkup

Kapkup adalah editor video multi-track yang berjalan di komputer sendiri, dirancang supaya bisa diedit dengan dua cara sekaligus: lewat tampilan editor, dan oleh Claude lewat file project. Tujuan utamanya: mengedit footage mengikuti gaya video referensi.

## Status (12 November 2026)

Keputusan yang sudah diambil: mesin video memakai **Remotion** (bukan OpenCut, bukan mesin buatan sendiri), aplikasi web lokal, tampilan gelap dengan susunan panel ala editor video.

**Sudah jadi dan diuji:**

- Daftar project, buat project, simpan otomatis ke `workspace/<id>/project.json`.
- Editor memuat ulang sendiri saat `project.json` diubah dari luar (jalur edit oleh Claude).
- Impor video/audio/gambar (info media, thumbnail, gelombang audio).
- Timeline multi-track: geser, potong tepi, belah, hapus, tempel otomatis, zoom, undo/redo, shortcut.
- Menu Media, Audio, Teks, Efek, Transisi, Penyesuaian; panel bisa digeser ukurannya.
- 24 efek dan 30 transisi (termasuk kilau cahaya, kedip kamera, bocoran cahaya, VHS, glitch, sapuan cepat), dengan kategori "Populer"; lapisan penyesuaian warna, warna per klip.
- Keyframe (posisi, skala, rotasi, opasitas) dengan tombol Zoom masuk/keluar.
- Caption per kata dari file `.srt`/`.vtt` dengan sorotan kata.
- Ukuran kanvas bebas, variabel teks `{{nama}}`.
- Hapus media dari panel Media (bisa di-undo; file di disk tetap ada).
- Kotak seleksi di timeline, Ctrl+A, dan menggeser banyak klip sekaligus.
- Memilih, menggeser, dan mengubah ukuran teks/video/gambar langsung di player.
- Animasi masuk, keluar, dan kombinasi untuk teks, video, dan gambar (33 jenis, 3 di antaranya khusus teks); ubin memperagakan gerakannya saat disorot.
- Latar buram untuk video horizontal di kanvas vertikal.
- Panel Properti bertab: Video (Dasar, Mask), Audio, Kecepatan, Animasi, Penyesuaian; tombol keyframe di tiap baris.
- Mask (6 bentuk), balik/cermin, mode campuran, rona warna, rapat ke tepi/tengah.
- Pisahkan suara dari video, kecepatan untuk klip audio, volume dalam dB.
- Media bisa dipilih dan dihapus dengan Delete.
- Toolbar: buang kiri/kanan garis waktu, gandakan, cerminkan, putar 90°.
- Deretan frame (filmstrip) pada klip video dan tombol Sampul.
- Kanvas player bisa digeser dan di-zoom.
- Export MP4 (pilihan resolusi dan kualitas) lewat editor dan CLI.
- CLI: `list`, `new`, `add-media`, `validate`, `still`, `export`, `transcribe`.

**Sudah ditulis tetapi belum diuji:**

- Caption otomatis dari suara (Whisper): butuh unduhan sekitar 500 MB saat pertama dipakai.
- Export GIF dan MP3.
- Proxy otomatis untuk video HEVC/ProRes (belum ada file uji).

**Belum dikerjakan:**

- Analisis video referensi (`analyze-ref`, `recipe.json`): FFmpeg bawaan Remotion tidak punya deteksi adegan, jadi perlu FFmpeg lengkap atau deteksi buatan sendiri.
- Kolase frame (`snapshot`); sementara pakai `still` per frame.
- Memutar elemen langsung di player (rotasi masih lewat panel Properti), mengurutkan ulang track, hapus project dari tampilan.
- Font tambahan (saat ini font bawaan Windows), stiker, template.
- Fitur berbasis AI atau pengolahan piksel: hapus latar, chroma key, retouch, stabilisasi, pengubah suara, peredam bising, kurva kecepatan, HSL/kurva warna, LUT.
- Keyframe masih satu untuk seluruh transformasi (posisi, skala, rotasi, opasitas sekaligus), belum per properti.
- Warna dan logo brand Kapkup (aksen cyan masih sementara).

Bagian di bawah adalah rencana awal; yang berbeda dari kenyataan: perubahan file dipantau dengan pemeriksaan berkala (bukan `chokidar`), komponen UI ditulis sendiri (bukan shadcn/ui), dan FFmpeg yang dipakai adalah bawaan Remotion.

---

## 1. Gambaran cara kerja

```
 Anda di editor  ──┐                         ┌──> Preview (player di browser)
                    ├──> project.json  <──────┤
 Claude (file)   ──┘    (satu sumber)        └──> Export MP4 (render lokal)
                              │
                     server lokal memantau file,
                     editor dimuat ulang otomatis
```

- **Satu sumber kebenaran:** setiap project adalah satu folder berisi `project.json` + folder `media/`. Editor dan Claude sama-sama membaca dan menulis file ini.
- **Berjalan lokal:** Kapkup dijalankan dengan `npm run dev` / `npm start` di komputer Anda dan dibuka di browser (`localhost`). Tidak di-hosting di internet, karena server perlu membaca file video di disk Anda.
- **Preview = hasil export:** preview dan export memakai kode tampilan yang sama, jadi yang terlihat di editor itulah yang keluar di MP4.

---

## 2. Tools yang dibutuhkan

### Software di komputer

| Tool | Status | Fungsi |
|------|--------|--------|
| Node.js LTS | Terpasang (v24.22) | Menjalankan aplikasi dan render |
| npm | Terpasang (v11.19) | Package manager |
| Git | Terpasang (v2.54) | Riwayat perubahan kode, bisa kembali ke versi sebelumnya |
| **FFmpeg + FFprobe** | **Belum terpasang** | Membaca info video, thumbnail, waveform, proxy, analisis referensi |
| Python 3.12 | Terpasang (v3.12.3) | Skrip analisis referensi (beat, warna) |
| Chrome atau Edge | Perlu dicek | Browser untuk membuka editor (codec dan performa paling baik) |

Cara pasang FFmpeg di Windows:

```bash
winget install Gyan.FFmpeg
```

### Library aplikasi

| Kebutuhan | Pilihan | Alasan |
|-----------|---------|--------|
| Framework | Next.js (App Router) + TypeScript strict | Standar proyek web Anda; satu aplikasi berisi UI dan server lokal |
| Styling & UI | Tailwind CSS + shadcn/ui + `lucide-react` | Sesuai design system Anda |
| Mesin video | **Remotion** (`remotion`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/transitions`) | Preview dan export dari kode yang sama, akurat per frame, sudah termasuk FFmpeg untuk render. **Perlu cek lisensi**, lihat Keputusan #1 |
| State editor | `zustand` + `immer` + `zundo` | State timeline yang cepat, plus undo/redo |
| Validasi project | `zod` | Memastikan `project.json` selalu valid, termasuk setelah diedit Claude |
| Pantau perubahan file | `chokidar` | Mendeteksi saat `project.json` berubah, lalu memberi tahu editor (via Server-Sent Events) |
| ID unik | `nanoid` | ID klip, track, aset |
| Notifikasi | `sonner` | Pesan "tersimpan", "export selesai", error |
| Testing | Vitest (logika timeline) + Playwright (alur editor) | Operasi trim/split/snap harus teruji karena paling rawan bug |

Timeline (drag, trim, zoom, snap) **dibangun sendiri** dengan pointer events. Library drag-and-drop umum tidak cocok untuk timeline video.

### Skrip Python untuk analisis referensi

| Library | Fungsi |
|---------|--------|
| `librosa` | Deteksi beat dan tempo musik |
| `Pillow` | Ekstrak palet warna dari frame |
| `faster-whisper` *(fase lanjut)* | Transkrip suara untuk auto-caption |

Deteksi potongan adegan memakai filter bawaan FFmpeg (`scdet`), jadi tidak perlu library tambahan.

---

## 3. Struktur folder

```
Kamkup-video-editor/
├─ src/
│  ├─ app/                  # halaman (daftar project, editor) + API lokal
│  ├─ components/
│  │  ├─ ui/                # komponen dasar (shadcn/ui)
│  │  └─ editor/            # panel media, preview, inspector, timeline
│  ├─ remotion/             # komposisi video (dipakai preview DAN export)
│  ├─ lib/
│  │  ├─ project/           # skema zod, baca/tulis project, migrasi versi
│  │  └─ timeline/          # logika murni: trim, split, snap, overlap
│  └─ store/                # zustand + undo/redo
├─ scripts/
│  ├─ render.ts             # worker export MP4 (proses Node terpisah)
│  └─ kapkup-cli.ts         # perintah untuk Claude: validate, probe, snapshot
├─ tools/analysis/          # skrip Python analisis referensi
├─ workspace/               # project Anda (tidak masuk Git)
│  └─ <nama-project>/
│     ├─ project.json
│     ├─ media/             # file asli
│     ├─ cache/             # proxy, thumbnail, waveform
│     └─ exports/           # hasil MP4
├─ references/              # video referensi + hasil analisisnya
├─ CLAUDE.md                # panduan singkat untuk Claude: format project & cara edit
└─ RENCANA.md
```

---

## 4. Format project (`project.json`)

Ringkasan bentuknya (final ditentukan di Fase 1):

```jsonc
{
  "version": 1,
  "settings": { "width": 1080, "height": 1920, "fps": 30, "background": "#000000" },
  "assets": [
    { "id": "a1", "type": "video", "path": "media/klip1.mp4",
      "durationMs": 12400, "width": 1920, "height": 1080, "proxy": "cache/a1-proxy.mp4" }
  ],
  "tracks": [
    { "id": "t1", "kind": "video", "muted": false, "locked": false, "items": [
      { "id": "c1", "assetId": "a1", "startMs": 0, "inMs": 1200, "outMs": 3400,
        "speed": 1, "volume": 1,
        "transform": { "x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1 },
        "transitionIn": { "type": "fade", "durationMs": 200 } }
    ]},
    { "id": "t2", "kind": "text", "items": [
      { "id": "x1", "startMs": 0, "durationMs": 2000, "text": "Judul",
        "style": "bold-center" }
    ]}
  ]
}
```

- **Waktu dalam milidetik (bilangan bulat)**, supaya tidak ada pembulatan desimal yang menggeser potongan.
- **Diberi nomor versi**, supaya project lama tetap bisa dibuka setelah format berkembang.
- **Divalidasi zod** setiap kali dibaca. Kalau Claude menulis sesuatu yang salah, editor menampilkan pesan error yang jelas, bukan crash.

---

## 5. Jalur kerja Claude

Ini yang membuat Kapkup berbeda dari editor biasa.

| Perintah | Fungsi |
|----------|--------|
| `npm run kapkup -- probe <project>` | Mengisi info media (durasi, resolusi) dan membuat proxy/thumbnail |
| `npm run kapkup -- validate <project>` | Mengecek `project.json` setelah diedit |
| `npm run kapkup -- snapshot <project>` | Merender beberapa frame hasil edit jadi **satu gambar kolase**, supaya Claude bisa memeriksa hasilnya sendiri dengan hemat token |
| `npm run kapkup -- analyze-ref <video>` | Menganalisis video referensi dan menulis `recipe.json` |

**Isi `recipe.json` dari referensi:** rasio layar, durasi, daftar waktu potongan, panjang rata-rata shot, tempo/beat musik, posisi cut terhadap beat, palet warna per adegan, gaya teks (diisi Claude setelah melihat kolase frame).

**Alur mengedit sesuai referensi:**

1. Anda taruh video referensi di `references/` dan footage di project.
2. Claude menjalankan `analyze-ref`, melihat kolase frame, lalu melengkapi resepnya.
3. Claude melihat kolase footage Anda, memilih shot, dan menulis timeline ke `project.json`.
4. Claude menjalankan `validate` dan `snapshot`, memeriksa hasilnya, memperbaiki bila perlu.
5. Anda menonton di editor, mengoreksi langsung atau meminta perubahan.
6. Export MP4.

**Hemat token:** frame dilihat sebagai satu gambar kolase berukuran kecil (bukan puluhan gambar besar), resep disimpan dan dipakai ulang, dan `CLAUDE.md` berisi ringkasan format sehingga sesi baru tidak perlu membaca seluruh kode.

---

## 6. Tahapan pembangunan

| Fase | Isi | Hasil yang bisa dicoba |
|------|-----|------------------------|
| **0. Persiapan** | Pasang FFmpeg, buat proyek Next.js, Git, token desain (sementara netral), `CLAUDE.md` awal | Aplikasi kosong bisa dibuka di browser |
| **1. Fondasi data** | Skema project, simpan/buka project di disk, impor media (salin + probe + thumbnail + waveform + proxy), pemantau file + muat ulang otomatis | Membuat project, impor video, ubah `project.json` manual dan editor ikut berubah |
| **2. Editor inti** | Layout 4 panel (media, preview, inspector, timeline), multi-track, drag, trim, split, hapus, snap, zoom, play/scrub, undo/redo, shortcut keyboard, autosave | Bisa merangkai video dari beberapa klip |
| **3. Teks & audio** | Klip teks dengan preset gaya, font, posisi; volume, fade in/out, track musik, waveform | Video dengan judul, caption, dan musik |
| **4. Export** | Render MP4 lokal, preset 16:9 / 9:16 / 1:1, 720p/1080p, progress bar, batal | **MVP selesai:** video jadi bisa diunggah |
| **5. Jalur Claude** | CLI `probe`/`validate`/`snapshot`/`analyze-ref`, format `recipe.json`, uji dengan 1 referensi asli | Claude mengedit footage Anda sesuai referensi |
| **6. Efek lanjutan** | Dipilih sesuai kebutuhan referensi: transisi, filter/warna, keyframe (zoom/pan), kecepatan, sinkron beat, auto-caption | Gaya edit makin mendekati referensi |
| *Opsional* | Bungkus jadi aplikasi desktop (Electron/Tauri), template, efek AI | — |

Fase 0–4 adalah editor yang berdiri sendiri. Fase 5 bisa dimulai lebih awal (setelah Fase 2) kalau Anda ingin segera mencoba alur dengan Claude.

Setiap fase ditutup dengan: `lint`, cek TypeScript, `build`, test, dan dicoba langsung di browser.

---

## 7. Risiko yang sudah diantisipasi

| Risiko | Antisipasi |
|--------|------------|
| Video dari iPhone (HEVC/.MOV) tidak bisa diputar di Chrome Windows | Setiap media dibuatkan proxy H.264 untuk preview; export tetap memakai file asli |
| Preview patah-patah untuk footage 4K atau banyak track | Preview memakai proxy 720p |
| Editor dan Claude mengubah project bersamaan | Nomor revisi di `project.json`; editor menyimpan otomatis sebelum Claude mengedit, dan memberi peringatan jika ada perubahan yang bertabrakan |
| Format project berubah antar versi | Field `version` + fungsi migrasi |
| Export lama untuk video panjang | Render berjalan di proses terpisah dengan progress bar, sehingga editor tetap bisa dipakai |
| Teks terlihat beda di preview dan hasil export | Preview dan render memakai komposisi dan font yang sama |

---

## 8. Keputusan yang perlu diambil

1. **Mesin video: Remotion atau buatan sendiri?**
   Remotion menghemat banyak waktu (preview, render, transisi sudah tersedia), tetapi **gratis hanya untuk perorangan dan perusahaan dengan maksimal 3 karyawan**; di atas itu wajib membeli lisensi perusahaan (cek ketentuan terbaru di remotion.dev/license). Alternatifnya, mesin buatan sendiri (canvas di browser + FFmpeg untuk export): bebas lisensi, tetapi menambah kira-kira satu sampai dua fase pekerjaan dan lebih banyak risiko bug sinkronisasi.
   *Rekomendasi:* Remotion, kalau syarat lisensinya terpenuhi.
2. **Warna dan logo Kapkup.** Design system Anda belum punya warna brand. Kalau belum ada, saya pakai warna netral sementara (tema gelap, cocok untuk editor video) dan menandainya sebagai sementara.
3. **Bahasa tampilan.** Default: Bahasa Indonesia.
4. **Lokasi folder project.** Default: `workspace/` di dalam folder aplikasi ini. Bisa dipindah ke drive lain kalau footage Anda besar.
