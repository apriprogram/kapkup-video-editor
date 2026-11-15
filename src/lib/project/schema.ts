import { z } from "zod";
import { ANIMATION_IDS, EFFECT_IDS, TRANSITION_IDS } from "./catalog";

/**
 * Format project Kapkup (project.json).
 * Semua waktu dalam milidetik (bilangan bulat). Field yang punya default boleh
 * dihilangkan saat menulis file dengan tangan.
 */
export const PROJECT_VERSION = 1;

const ms = z.number().int().min(0);

export const transformSchema = z.object({
  /** Geser dari tengah kanvas, dalam piksel kanvas. */
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().min(0.01).max(20).default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});

/**
 * Lengkung gerak antar-keyframe (rumusnya di animate.ts). Empat yang pertama lembut;
 * `cubic-*` lebih tegas (seperti Easy Ease di After Effects); `back-*` melewati
 * tujuan lalu kembali; `elastic-out` dan `bounce-out` bergetar/memantul di akhir;
 * `hold` menahan nilai sampai keyframe berikutnya lalu melompat.
 */
export const EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "cubic-in",
  "cubic-out",
  "cubic-in-out",
  "back-in",
  "back-out",
  "back-in-out",
  "elastic-out",
  "bounce-out",
  "hold",
] as const;

/**
 * Keyframe = posisi/ukuran pada satu titik waktu. Bila sebuah klip punya
 * keyframe, nilainya dihitung di antara keyframe dan `transform` diabaikan.
 */
export const keyframeSchema = transformSchema.extend({
  /** Waktu relatif terhadap awal klip. */
  atMs: ms,
  /** Lengkung gerak dari keyframe ini ke keyframe berikutnya. */
  easing: z.enum(EASINGS).default("ease-in-out"),
});

/** Penyesuaian warna. 0 = tanpa perubahan. */
export const adjustSchema = z.object({
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(-1).max(1).default(0),
  saturation: z.number().min(-1).max(1).default(0),
  /** Putar warna, dalam derajat. */
  hue: z.number().min(-180).max(180).default(0),
  /** Negatif = dingin (biru), positif = hangat (jingga). */
  temperature: z.number().min(-1).max(1).default(0),
  /** Negatif = kehijauan, positif = keunguan (magenta). */
  tint: z.number().min(-1).max(1).default(0),
  /** Buram dalam piksel kanvas. */
  blur: z.number().min(0).max(100).default(0),
  /** Tepi menggelap; hanya berlaku pada lapisan penyesuaian. */
  vignette: z.number().min(0).max(1).default(0),
});

/** Transisi di AWAL klip, dari klip sebelumnya yang menempel di track yang sama. */
export const transitionSchema = z.object({
  type: z.enum(TRANSITION_IDS),
  durationMs: z.number().int().min(100).max(5000).default(500),
});

export const MASK_SHAPES = ["rectangle", "circle", "split", "filmstrip", "star", "heart"] as const;

/** Bentuk mask dalam piksel kanvas, relatif terhadap tengah klip. */
export const maskSchema = z.object({
  shape: z.enum(MASK_SHAPES),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().min(1).max(10000).default(540),
  height: z.number().min(1).max(10000).default(540),
  rotation: z.number().default(0),
  /** Tepi memudar, dalam piksel. */
  feather: z.number().min(0).max(500).default(0),
  /** Sudut membulat untuk bentuk kotak (0–1). */
  radius: z.number().min(0).max(1).default(0),
  /** true = yang terlihat justru bagian di LUAR bentuk. */
  invert: z.boolean().default(false),
});

export const BLEND_MODES = [
  "normal",
  "screen",
  "multiply",
  "overlay",
  "soft-light",
  "hard-light",
  "lighten",
  "darken",
  "color-dodge",
  "color-burn",
  "difference",
] as const;

/** Animasi masuk atau keluar sebuah klip (lihat ANIMATIONS di catalog.ts). */
export const animationSchema = z.object({
  type: z.enum(ANIMATION_IDS),
  durationMs: z.number().int().min(100).max(5000).default(500),
});

const animationFields = {
  animationIn: animationSchema.nullable().default(null),
  animationOut: animationSchema.nullable().default(null),
};

export const textStyleSchema = z.object({
  fontFamily: z.string().default("Arial"),
  /** Ukuran dalam piksel kanvas. */
  fontSize: z.number().min(4).max(1000).default(72),
  fontWeight: z.number().min(100).max(900).default(700),
  italic: z.boolean().default(false),
  color: z.string().default("#ffffff"),
  align: z.enum(["left", "center", "right"]).default("center"),
  strokeColor: z.string().default("#000000"),
  strokeWidth: z.number().min(0).max(100).default(0),
  /** Warna kotak latar di belakang teks, atau null. */
  background: z.string().nullable().default(null),
  shadow: z.boolean().default(false),
  lineHeight: z.number().min(0.5).max(4).default(1.2),
  /** Lebar maksimum teks sebagai bagian dari lebar kanvas (0–1). */
  maxWidth: z.number().min(0.05).max(1).default(0.9),
});

const baseItem = {
  id: z.string().min(1),
  /** Posisi mulai di timeline. */
  startMs: ms,
  /** Panjang di timeline (setelah kecepatan diterapkan). */
  durationMs: z.number().int().min(1),
  fadeInMs: ms.default(0),
  fadeOutMs: ms.default(0),
};

export const videoItemSchema = z.object({
  ...baseItem,
  type: z.literal("video"),
  assetId: z.string(),
  /** Titik mulai di dalam file sumber. */
  inMs: ms.default(0),
  speed: z.number().min(0.1).max(8).default(1),
  volume: z.number().min(0).max(2).default(1),
  fit: z.enum(["contain", "cover"]).default("contain"),
  transform: transformSchema.prefault({}),
  keyframes: z.array(keyframeSchema).default([]),
  adjust: adjustSchema.prefault({}),
  transitionIn: transitionSchema.nullable().default(null),
  ...animationFields,
  /** Latar buram: salinan klip yang memenuhi kanvas di belakangnya. Nilai = kekuatan buram (px); 0 = mati. */
  backdropBlur: z.number().min(0).max(200).default(0),
  /** Mask: hanya bagian klip di dalam bentuk ini yang terlihat. */
  mask: maskSchema.nullable().default(null),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  /** Cara klip bercampur dengan lapisan di bawahnya. */
  blendMode: z.enum(BLEND_MODES).default("normal"),
});

export const imageItemSchema = z.object({
  ...baseItem,
  type: z.literal("image"),
  assetId: z.string(),
  fit: z.enum(["contain", "cover"]).default("contain"),
  transform: transformSchema.prefault({}),
  keyframes: z.array(keyframeSchema).default([]),
  adjust: adjustSchema.prefault({}),
  transitionIn: transitionSchema.nullable().default(null),
  ...animationFields,
  /** Latar buram: salinan klip yang memenuhi kanvas di belakangnya. Nilai = kekuatan buram (px); 0 = mati. */
  backdropBlur: z.number().min(0).max(200).default(0),
  /** Mask: hanya bagian klip di dalam bentuk ini yang terlihat. */
  mask: maskSchema.nullable().default(null),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  /** Cara klip bercampur dengan lapisan di bawahnya. */
  blendMode: z.enum(BLEND_MODES).default("normal"),
});

export const audioItemSchema = z.object({
  ...baseItem,
  type: z.literal("audio"),
  assetId: z.string(),
  inMs: ms.default(0),
  speed: z.number().min(0.1).max(8).default(1),
  volume: z.number().min(0).max(2).default(1),
});

export const textItemSchema = z.object({
  ...baseItem,
  type: z.literal("text"),
  text: z.string(),
  style: textStyleSchema.prefault({}),
  transform: transformSchema.prefault({}),
  keyframes: z.array(keyframeSchema).default([]),
  ...animationFields,
});

/** Satu kata caption. Waktunya relatif terhadap titik 0 sumber caption (lihat `inMs`). */
export const captionWordSchema = z.object({
  text: z.string(),
  startMs: ms,
  endMs: ms,
});

/**
 * Caption per kata (gaya karaoke): kata ditampilkan berkelompok, dan kata yang
 * sedang diucapkan disorot. Ditaruh di track "text".
 */
export const captionsItemSchema = z.object({
  ...baseItem,
  type: z.literal("captions"),
  words: z.array(captionWordSchema).default([]),
  /** Waktu kata yang tampil di awal klip; bertambah bila awal klip dipotong. */
  inMs: ms.default(0),
  /** Kata-kata dalam rentang ini ditampilkan bersama sebagai satu kelompok. */
  pageMs: z.number().int().min(200).max(10000).default(1200),
  style: textStyleSchema.prefault({ fontSize: 68, fontWeight: 800, strokeWidth: 8 }),
  /** Warna kata yang sedang diucapkan, atau null untuk tanpa sorotan. */
  highlightColor: z.string().nullable().default("#ffe14d"),
  uppercase: z.boolean().default(false),
  transform: transformSchema.prefault({}),
  keyframes: z.array(keyframeSchema).default([]),
});

/** Efek pada track "fx": berlaku untuk semua track di bawahnya selama klip ini aktif. */
export const effectItemSchema = z.object({
  ...baseItem,
  type: z.literal("effect"),
  effect: z.enum(EFFECT_IDS),
  intensity: z.number().min(0).max(1).default(0.6),
});

/** Lapisan penyesuaian warna pada track "fx": berlaku untuk semua track di bawahnya. */
export const adjustmentItemSchema = z.object({
  ...baseItem,
  type: z.literal("adjustment"),
  adjust: adjustSchema.prefault({}),
});

export const itemSchema = z.discriminatedUnion("type", [
  videoItemSchema,
  imageItemSchema,
  audioItemSchema,
  textItemSchema,
  captionsItemSchema,
  effectItemSchema,
  adjustmentItemSchema,
]);

export const trackSchema = z.object({
  id: z.string().min(1),
  /** "video" memuat klip video dan gambar; "fx" memuat efek dan lapisan penyesuaian. */
  kind: z.enum(["video", "audio", "text", "fx"]),
  name: z.string().default(""),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  items: z.array(itemSchema).default([]),
});

export const assetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["video", "image", "audio"]),
  name: z.string(),
  /** Path relatif terhadap folder project, mis. "media/klip.mp4". */
  path: z.string(),
  durationMs: ms.default(0),
  width: z.number().int().min(0).default(0),
  height: z.number().int().min(0).default(0),
  hasAudio: z.boolean().default(false),
  thumbnail: z.string().nullable().default(null),
  /** File puncak gelombang audio (JSON) untuk digambar di timeline. */
  peaks: z.string().nullable().default(null),
  /** Salinan H.264 untuk preview bila file asli tidak bisa diputar browser. */
  proxy: z.string().nullable().default(null),
});

export const settingsSchema = z.object({
  width: z.number().int().min(16).max(7680).default(1080),
  height: z.number().int().min(16).max(7680).default(1920),
  fps: z.number().int().min(1).max(120).default(30),
  background: z.string().default("#000000"),
});

export const projectSchema = z.object({
  version: z.literal(PROJECT_VERSION).default(PROJECT_VERSION),
  name: z.string().default("Tanpa judul"),
  settings: settingsSchema.prefault({}),
  /** Nilai pengganti untuk penanda {{nama}} di dalam teks. Bisa ditimpa saat export. */
  variables: z.record(z.string(), z.string()).default({}),
  /** Waktu frame yang dipakai sebagai sampul (gambarnya: cover.png di folder project), atau null. */
  coverMs: ms.nullable().default(null),
  assets: z.array(assetSchema).default([]),
  /** Urutan = dari atas ke bawah di timeline. Track paling atas tampil paling depan. */
  tracks: z.array(trackSchema).default([]),
});

export type Transform = z.infer<typeof transformSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type Easing = (typeof EASINGS)[number];
export type Adjust = z.infer<typeof adjustSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type Animation = z.infer<typeof animationSchema>;
export type Mask = z.infer<typeof maskSchema>;
export type MaskShape = (typeof MASK_SHAPES)[number];
export type TextStyle = z.infer<typeof textStyleSchema>;
export type VideoItem = z.infer<typeof videoItemSchema>;
export type ImageItem = z.infer<typeof imageItemSchema>;
export type AudioItem = z.infer<typeof audioItemSchema>;
export type TextItem = z.infer<typeof textItemSchema>;
export type CaptionWord = z.infer<typeof captionWordSchema>;
export type CaptionsItem = z.infer<typeof captionsItemSchema>;
export type EffectItem = z.infer<typeof effectItemSchema>;
export type AdjustmentItem = z.infer<typeof adjustmentItemSchema>;
export type Item = z.infer<typeof itemSchema>;
/** Klip yang punya posisi/ukuran dan bisa dianimasikan dengan keyframe. */
export type VisualItem = VideoItem | ImageItem | TextItem | CaptionsItem;
/** Klip yang memakai file media. */
export type MediaItem = VideoItem | ImageItem | AudioItem;

export function isVisual(item: Item): item is VisualItem {
  return item.type === "video" || item.type === "image" || item.type === "text" || item.type === "captions";
}

export function isMedia(item: Item): item is MediaItem {
  return item.type === "video" || item.type === "image" || item.type === "audio";
}

export const NEUTRAL_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
export const NEUTRAL_ADJUST: Adjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
  vignette: 0,
};
export type Track = z.infer<typeof trackSchema>;
export type TrackKind = Track["kind"];
export type Asset = z.infer<typeof assetSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Project = z.infer<typeof projectSchema>;

export const ASPECT_PRESETS = [
  { id: "9:16", label: "9:16 (TikTok, Reels)", width: 1080, height: 1920 },
  { id: "16:9", label: "16:9 (YouTube)", width: 1920, height: 1080 },
  { id: "1:1", label: "1:1 (Persegi)", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5 (Feed)", width: 1080, height: 1350 },
] as const;

/** Mengganti penanda {{nama}} dengan nilainya; penanda tanpa nilai dibiarkan apa adanya. */
export function applyVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (match, name: string) => variables[name] ?? match);
}

export function itemEnd(item: Pick<Item, "startMs" | "durationMs">): number {
  return item.startMs + item.durationMs;
}

export function msToFrame(value: number, fps: number): number {
  return Math.round((value / 1000) * fps);
}

export function frameToMs(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1000);
}

/** Panjang isi timeline; 0 bila kosong. */
export function contentDurationMs(project: Project): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const item of track.items) end = Math.max(end, itemEnd(item));
  }
  return end;
}

export function durationInFrames(project: Project): number {
  return Math.max(1, msToFrame(contentDurationMs(project), project.settings.fps));
}

/** Jenis track yang boleh memuat sebuah jenis item. */
export function trackKindFor(type: Item["type"]): TrackKind {
  if (type === "audio") return "audio";
  if (type === "text" || type === "captions") return "text";
  if (type === "effect" || type === "adjustment") return "fx";
  return "video";
}

export function createEmptyProject(name: string, settings?: Partial<Settings>): Project {
  return projectSchema.parse({
    name,
    settings: settings ?? {},
    tracks: [
      { id: "t-text", kind: "text", name: "Teks" },
      { id: "t-video", kind: "video", name: "Video" },
      { id: "t-audio", kind: "audio", name: "Audio" },
    ],
  });
}

/**
 * Pemeriksaan di luar bentuk data: referensi aset, jenis item per track,
 * tumpang tindih, dan batas panjang sumber. Mengembalikan daftar masalah.
 */
export function checkProject(project: Project): string[] {
  const issues: string[] = [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const seen = new Set<string>();

  for (const asset of project.assets) {
    if (seen.has(asset.id)) issues.push(`ID aset ganda: ${asset.id}`);
    seen.add(asset.id);
  }

  for (const track of project.tracks) {
    if (seen.has(track.id)) issues.push(`ID ganda: ${track.id}`);
    seen.add(track.id);

    const sorted = [...track.items].sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const where = `track "${track.id}" item "${item.id}"`;
      if (seen.has(item.id)) issues.push(`ID ganda: ${item.id}`);
      seen.add(item.id);

      if (trackKindFor(item.type) !== track.kind) {
        issues.push(`${where}: item "${item.type}" tidak boleh di track "${track.kind}"`);
      }
      if (i > 0 && itemEnd(sorted[i - 1]) > item.startMs) {
        issues.push(`${where}: tumpang tindih dengan "${sorted[i - 1].id}"`);
      }
      if (isVisual(item)) {
        for (let k = 0; k < item.keyframes.length; k++) {
          const keyframe = item.keyframes[k];
          if (keyframe.atMs > item.durationMs) {
            issues.push(`${where}: keyframe di ${keyframe.atMs} ms berada di luar klip (${item.durationMs} ms)`);
          }
          if (k > 0 && item.keyframes[k - 1].atMs >= keyframe.atMs) {
            issues.push(`${where}: keyframe harus berurutan dan tidak boleh di waktu yang sama`);
          }
        }
      }
      if ((item.type === "video" || item.type === "image") && item.transitionIn) {
        if (item.transitionIn.durationMs > item.durationMs) {
          issues.push(`${where}: transisi lebih panjang dari klip`);
        }
      }
      if (isMedia(item)) {
        const asset = assets.get(item.assetId);
        if (!asset) {
          issues.push(`${where}: aset "${item.assetId}" tidak ada`);
        } else if (asset.type !== item.type && !(item.type === "audio" && asset.type === "video" && asset.hasAudio)) {
          issues.push(`${where}: aset "${asset.id}" berjenis "${asset.type}", bukan "${item.type}"`);
        } else if (item.type !== "image") {
          const speed = item.speed;
          const sourceEnd = item.inMs + item.durationMs * speed;
          // Toleransi 1 frame pada 24 fps untuk pembulatan.
          if (asset.durationMs > 0 && sourceEnd > asset.durationMs + 42) {
            issues.push(
              `${where}: memakai sumber sampai ${Math.round(sourceEnd)} ms, padahal aset hanya ${asset.durationMs} ms`,
            );
          }
        }
      }
      if (item.fadeInMs + item.fadeOutMs > item.durationMs) {
        issues.push(`${where}: fade in + fade out lebih panjang dari klip`);
      }
    }
  }
  return issues;
}
