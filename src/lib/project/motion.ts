import type { Easing, Keyframe, Transform } from "./schema";

/**
 * Preset gerak: sekali klik menghasilkan deretan keyframe (murni, tanpa React).
 * Hasilnya keyframe biasa, jadi masih bisa diubah satu per satu di panel Gerak.
 */

export const MOTION_IDS = [
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "ken-burns",
  "tilt",
  "pop-in",
  "drop-in",
  "elastic-in",
  "slide-in-left",
  "slide-in-right",
  "wiggle",
  "float",
  "pulse",
  "swing",
  "spin",
] as const;
export type MotionId = (typeof MOTION_IDS)[number];

export const MOTION_CATEGORIES = [
  { id: "kamera", label: "Kamera" },
  { id: "masuk", label: "Masuk" },
  { id: "berulang", label: "Berulang" },
] as const;

export const MOTIONS: { id: MotionId; label: string; hint: string; category: (typeof MOTION_CATEGORIES)[number]["id"] }[] = [
  { id: "zoom-in", label: "Zoom masuk", hint: "Membesar pelan sepanjang klip", category: "kamera" },
  { id: "zoom-out", label: "Zoom keluar", hint: "Mengecil pelan sepanjang klip", category: "kamera" },
  { id: "pan-left", label: "Geser ke kiri", hint: "Kamera bergeser pelan ke kiri", category: "kamera" },
  { id: "pan-right", label: "Geser ke kanan", hint: "Kamera bergeser pelan ke kanan", category: "kamera" },
  { id: "pan-up", label: "Geser ke atas", hint: "Kamera bergeser pelan ke atas", category: "kamera" },
  { id: "pan-down", label: "Geser ke bawah", hint: "Kamera bergeser pelan ke bawah", category: "kamera" },
  { id: "ken-burns", label: "Ken Burns", hint: "Zoom sambil bergeser serong, cocok untuk foto", category: "kamera" },
  { id: "tilt", label: "Miring pelan", hint: "Berputar sedikit dari kiri ke kanan", category: "kamera" },
  { id: "pop-in", label: "Pop", hint: "Muncul membesar lalu sedikit melewati ukurannya", category: "masuk" },
  { id: "drop-in", label: "Jatuh memantul", hint: "Jatuh dari atas lalu memantul", category: "masuk" },
  { id: "elastic-in", label: "Kenyal", hint: "Membesar lalu bergetar seperti karet", category: "masuk" },
  { id: "slide-in-left", label: "Dari kiri", hint: "Meluncur dari kiri lalu sedikit melewati tempatnya", category: "masuk" },
  { id: "slide-in-right", label: "Dari kanan", hint: "Meluncur dari kanan lalu sedikit melewati tempatnya", category: "masuk" },
  { id: "wiggle", label: "Goyang", hint: "Bergetar acak terus-menerus (seperti wiggle)", category: "berulang" },
  { id: "float", label: "Melayang", hint: "Naik-turun pelan", category: "berulang" },
  { id: "pulse", label: "Denyut", hint: "Membesar-mengecil berirama", category: "berulang" },
  { id: "swing", label: "Ayun", hint: "Berayun kiri-kanan", category: "berulang" },
  { id: "spin", label: "Putar terus", hint: "Berputar penuh tiap 4 detik", category: "berulang" },
];

/** Nama lengkung gerak untuk ditampilkan di editor (daftarnya: EASINGS di schema.ts). */
export const EASING_LABELS: Record<Easing, string> = {
  linear: "Rata (linear)",
  "ease-in": "Pelan di awal",
  "ease-out": "Pelan di akhir",
  "ease-in-out": "Pelan di awal dan akhir",
  "cubic-in": "Tegas, pelan di awal",
  "cubic-out": "Tegas, pelan di akhir",
  "cubic-in-out": "Tegas di awal dan akhir (Easy Ease)",
  "back-in": "Mundur dulu (antisipasi)",
  "back-out": "Melewati lalu kembali (overshoot)",
  "back-in-out": "Antisipasi dan overshoot",
  "elastic-out": "Kenyal (elastis)",
  "bounce-out": "Memantul",
  hold: "Tahan lalu lompat",
};

type Canvas = { width: number; height: number };

/** Angka semu-acak yang selalu sama untuk indeks yang sama, antara -1 dan 1. */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function frame(base: Transform, atMs: number, easing: Easing, patch: Partial<Transform> = {}): Keyframe {
  return { ...base, ...patch, atMs: Math.round(atMs), easing };
}

/** Dua keyframe: awal dan akhir klip. */
function span(base: Transform, durationMs: number, from: Partial<Transform>, to: Partial<Transform>, easing: Easing = "ease-in-out"): Keyframe[] {
  return [frame(base, 0, easing, from), frame(base, durationMs, easing, to)];
}

/** Gerak masuk: dari `from` ke posisi dasar dalam `inMs`, lalu diam. */
function entrance(base: Transform, durationMs: number, from: Partial<Transform>, easing: Easing, wantedMs = 700): Keyframe[] {
  const inMs = Math.max(1, Math.min(wantedMs, Math.round(durationMs / 2)));
  return [frame(base, 0, easing, from), frame(base, inMs, "linear")];
}

/** Gerak bolak-balik: keyframe tiap `stepMs`, bergantian antara dua keadaan. */
function loop(base: Transform, durationMs: number, stepMs: number, make: (index: number) => Partial<Transform>): Keyframe[] {
  const result: Keyframe[] = [];
  for (let index = 0, atMs = 0; ; index++, atMs += stepMs) {
    const last = atMs >= durationMs;
    result.push(frame(base, Math.min(atMs, durationMs), "ease-in-out", make(index)));
    if (last) break;
  }
  // Klip yang lebih pendek dari satu langkah tetap perlu dua keyframe berbeda waktu.
  return result.length > 1 && result[result.length - 1].atMs === result[result.length - 2].atMs ? result.slice(0, -1) : result;
}

/**
 * Keyframe untuk preset `id` pada klip sepanjang `durationMs`, bertolak dari
 * `base` (posisi/ukuran klip saat ini). Geseran dihitung dari ukuran kanvas.
 */
export function buildMotion(id: MotionId, base: Transform, durationMs: number, canvas: Canvas): Keyframe[] {
  const duration = Math.max(2, Math.round(durationMs));
  const dx = canvas.width * 0.06;
  const dy = canvas.height * 0.06;
  // Sedikit diperbesar supaya tepi klip tidak terlihat saat digeser atau digoyang.
  const cover = base.scale * 1.15;

  switch (id) {
    case "zoom-in":
      return span(base, duration, {}, { scale: base.scale * 1.3 });
    case "zoom-out":
      return span(base, duration, { scale: base.scale * 1.3 }, {});
    case "pan-left":
      return span(base, duration, { scale: cover, x: base.x + dx }, { scale: cover, x: base.x - dx });
    case "pan-right":
      return span(base, duration, { scale: cover, x: base.x - dx }, { scale: cover, x: base.x + dx });
    case "pan-up":
      return span(base, duration, { scale: cover, y: base.y + dy }, { scale: cover, y: base.y - dy });
    case "pan-down":
      return span(base, duration, { scale: cover, y: base.y - dy }, { scale: cover, y: base.y + dy });
    case "ken-burns":
      return span(
        base,
        duration,
        { scale: base.scale * 1.1, x: base.x - dx * 0.6, y: base.y + dy * 0.4 },
        { scale: base.scale * 1.32, x: base.x + dx * 0.6, y: base.y - dy * 0.4 },
      );
    case "tilt":
      return span(base, duration, { scale: cover, rotation: base.rotation - 3 }, { scale: cover, rotation: base.rotation + 3 });
    case "pop-in":
      return entrance(base, duration, { scale: 0.01, opacity: 0 }, "back-out", 500);
    case "drop-in":
      return entrance(base, duration, { y: base.y - canvas.height }, "bounce-out", 900);
    case "elastic-in":
      return entrance(base, duration, { scale: base.scale * 0.3 }, "elastic-out", 1000);
    case "slide-in-left":
      return entrance(base, duration, { x: base.x - canvas.width }, "back-out");
    case "slide-in-right":
      return entrance(base, duration, { x: base.x + canvas.width }, "back-out");
    case "wiggle":
      return loop(base, duration, 140, (index) => ({
        scale: base.scale * 1.06,
        x: base.x + noise(index, 1) * canvas.width * 0.012,
        y: base.y + noise(index, 2) * canvas.height * 0.012,
        rotation: base.rotation + noise(index, 3) * 1.2,
      }));
    case "float":
      return loop(base, duration, 1000, (index) => ({ y: base.y + (index % 2 === 0 ? 1 : -1) * canvas.height * 0.015 }));
    case "pulse":
      return loop(base, duration, 400, (index) => ({ scale: base.scale * (index % 2 === 0 ? 1 : 1.07) }));
    case "swing":
      return loop(base, duration, 700, (index) => ({ rotation: base.rotation + (index % 2 === 0 ? -4 : 4) }));
    case "spin":
      return span(base, duration, {}, { rotation: base.rotation + 360 * (duration / 4000) }, "linear");
  }
}
