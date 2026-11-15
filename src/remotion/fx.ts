import type React from "react";
import { random } from "remotion";
import type { AnimationId, EffectId, TransitionId } from "../lib/project/catalog";
import type { Adjust, Mask } from "../lib/project/schema";

/**
 * Cara menggambar efek, transisi, dan penyesuaian warna.
 * Semuanya fungsi murni dari nomor frame, supaya preview dan hasil render identik.
 */

// --- Penyesuaian warna ---

export function scaleAdjust(adjust: Adjust, k: number): Adjust {
  if (k >= 1) return adjust;
  return {
    brightness: adjust.brightness * k,
    contrast: adjust.contrast * k,
    saturation: adjust.saturation * k,
    hue: adjust.hue * k,
    temperature: adjust.temperature * k,
    tint: adjust.tint * k,
    blur: adjust.blur * k,
    vignette: adjust.vignette * k,
  };
}

/** Matriks warna untuk suhu: hangat menaikkan merah & menurunkan biru, dingin sebaliknya. */
export function temperatureMatrix(temperature: number, tint = 0): string | null {
  if (Math.abs(temperature) < 0.001 && Math.abs(tint) < 0.001) return null;
  // Tint: positif menambah merah-biru (magenta) dan mengurangi hijau, negatif sebaliknya.
  const r = 1 + temperature * 0.22 + tint * 0.1;
  const g = 1 + temperature * 0.04 - tint * 0.18;
  const b = 1 - temperature * 0.22 + tint * 0.1;
  return `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
}

/** Nilai CSS `filter` untuk sebuah penyesuaian. `svgFilterId` dipakai bila suhu tidak nol. */
export function adjustFilter(adjust: Adjust, svgFilterId: string): string {
  const parts: string[] = [];
  if (temperatureMatrix(adjust.temperature, adjust.tint)) parts.push(`url(#${svgFilterId})`);
  if (adjust.brightness !== 0) parts.push(`brightness(${1 + adjust.brightness})`);
  if (adjust.contrast !== 0) parts.push(`contrast(${1 + adjust.contrast})`);
  if (adjust.saturation !== 0) parts.push(`saturate(${1 + adjust.saturation})`);
  if (adjust.hue !== 0) parts.push(`hue-rotate(${adjust.hue}deg)`);
  if (adjust.blur > 0) parts.push(`blur(${adjust.blur}px)`);
  return parts.join(" ");
}

export function vignetteStyle(amount: number): React.CSSProperties | null {
  if (amount <= 0) return null;
  return {
    backgroundImage: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${amount.toFixed(3)}) 100%)`,
  };
}

// --- Efek ---

export type EffectResult = {
  filter?: string;
  transform?: string;
  /** Lapisan di atas gambar (mis. vinyet). */
  overlay?: React.CSSProperties;
};

type EffectContext = { frame: number; fps: number; intensity: number; seed: string };

const TAU = Math.PI * 2;

export const EFFECT_RENDERERS: Record<EffectId, (context: EffectContext) => EffectResult> = {
  mono: ({ intensity }) => ({ filter: `grayscale(${intensity})` }),
  sepia: ({ intensity }) => ({ filter: `sepia(${intensity})` }),
  invert: ({ intensity }) => ({ filter: `invert(${intensity})` }),
  retro: ({ intensity: i }) => ({
    filter: `sepia(${0.5 * i}) contrast(${1 + 0.2 * i}) saturate(${1 + 0.4 * i}) hue-rotate(${-10 * i}deg)`,
  }),
  rainbow: ({ frame, fps, intensity }) => ({
    filter: `hue-rotate(${((frame / fps) * 180 * Math.max(0.2, intensity)) % 360}deg)`,
  }),
  blur: ({ intensity }) => ({ filter: `blur(${intensity * 24}px)` }),
  dreamy: ({ intensity: i }) => ({ filter: `blur(${3 * i}px) brightness(${1 + 0.15 * i}) saturate(${1 + 0.2 * i})` }),
  vignette: ({ intensity }) => ({ overlay: vignetteStyle(intensity) ?? undefined }),
  shake: ({ frame, intensity: i, seed }) => {
    const x = (random(`${seed}-x-${frame}`) - 0.5) * 2 * 28 * i;
    const y = (random(`${seed}-y-${frame}`) - 0.5) * 2 * 28 * i;
    // Sedikit diperbesar supaya tepi kanvas tidak terlihat saat bergetar.
    return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${1 + 0.06 * i})` };
  },
  pulse: ({ frame, fps, intensity: i }) => ({
    transform: `scale(${(1 + 0.12 * i * (0.5 - 0.5 * Math.cos((frame / fps) * 2 * TAU))).toFixed(4)})`,
  }),
  glitch: ({ frame, intensity: i, seed }) => {
    const slot = Math.floor(frame / 3);
    if (random(`${seed}-g-${slot}`) < 0.55) return {};
    const shift = (random(`${seed}-gx-${slot}`) - 0.5) * 2 * 60 * i;
    const hue = random(`${seed}-gh-${slot}`) * 360 * i;
    return {
      transform: `translateX(${shift.toFixed(1)}px) skewX(${(shift / 12).toFixed(2)}deg)`,
      filter: `hue-rotate(${hue.toFixed(0)}deg) contrast(${1 + 0.5 * i}) saturate(${1 + i})`,
    };
  },
  flash: ({ frame, fps, intensity: i }) => {
    // Satu kilatan per detik, cepat naik lalu meredup.
    const phase = ((frame / fps) % 1 + 1) % 1;
    const glow = Math.max(0, 1 - phase * 5);
    return { filter: `brightness(${(1 + 1.6 * i * glow).toFixed(3)})` };
  },
  "lens-flare": ({ frame, fps, intensity: i }) => {
    // Garis cahaya menyapu dari kiri ke kanan setiap 2 detik.
    const x = (((frame / fps) % 2) / 2) * 200 - 50;
    return {
      overlay: {
        backgroundImage:
          `linear-gradient(105deg, rgba(255,255,255,0) ${n(x - 18)}%, rgba(255,247,225,${n(0.9 * i)}) ${n(x)}%, rgba(255,255,255,0) ${n(x + 18)}%), ` +
          `radial-gradient(circle at ${n(x)}% 35%, rgba(255,255,255,${n(0.7 * i)}), rgba(255,255,255,0) 30%)`,
        mixBlendMode: "screen",
      },
    };
  },
  "light-leak": ({ frame, fps, intensity: i }) => {
    const t = frame / fps;
    const cx = 30 + 25 * Math.sin(t * 0.9);
    const cy = 30 + 20 * Math.cos(t * 0.7);
    return {
      overlay: {
        backgroundImage:
          `radial-gradient(circle at ${n(cx)}% ${n(cy)}%, rgba(255,170,60,${n(0.75 * i)}), rgba(255,60,90,${n(0.4 * i)}) 35%, rgba(255,0,80,0) 65%), ` +
          `radial-gradient(circle at ${n(100 - cx)}% ${n(100 - cy)}%, rgba(255,220,120,${n(0.5 * i)}), rgba(255,160,0,0) 55%)`,
        mixBlendMode: "screen",
      },
    };
  },
  paparazzi: ({ frame, fps, intensity: i, seed }) => {
    // Empat kesempatan kilat per detik; sebagian saja yang menyala, ditentukan oleh benih klip.
    const beat = (frame / fps) * 4;
    const slot = Math.floor(beat);
    const lit = random(`${seed}-p-${slot}`) > 0.72;
    const glow = lit ? Math.max(0, 1 - (beat - slot) * 2.5) : 0;
    return { overlay: { backgroundColor: "#fff", opacity: glow * i } };
  },
  glow: ({ intensity: i }) => ({
    filter: `brightness(${n(1 + 0.18 * i)}) contrast(${n(1 + 0.08 * i)}) saturate(${n(1 + 0.25 * i)})`,
    overlay: {
      backgroundImage: `radial-gradient(circle at 50% 40%, rgba(255,255,255,${n(0.28 * i)}), rgba(255,255,255,0) 65%)`,
      mixBlendMode: "screen",
    },
  }),
  flicker: ({ frame, intensity: i, seed }) => ({
    filter: `brightness(${n(1 - 0.32 * i * random(`${seed}-f-${Math.floor(frame / 2)}`))})`,
  }),
  spotlight: ({ intensity: i }) => ({
    overlay: {
      backgroundImage: `radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 28%, rgba(0,0,0,${n(0.88 * i)}) 72%)`,
    },
  }),
  blink: ({ frame, fps, intensity: i }) => {
    // Sekali kedip (0,35 detik) setiap 2,5 detik.
    const phase = (frame / fps) % 2.5;
    return { overlay: eyelids(phase < 0.35 ? peak(phase / 0.35) * i : 0) };
  },
  "zoom-punch": ({ frame, fps, intensity: i }) => {
    const phase = ((frame / fps) % 0.5) / 0.5;
    return { transform: `scale(${(1 + 0.14 * i * Math.max(0, 1 - phase * 4)).toFixed(4)})` };
  },
  handheld: ({ frame, fps, intensity: i }) => {
    const t = frame / fps;
    const x = (Math.sin(t * 1.7) * 10 + Math.sin(t * 3.1) * 4) * i;
    const y = (Math.cos(t * 1.3) * 8 + Math.sin(t * 2.7) * 3) * i;
    return {
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${n(Math.sin(t * 0.9) * 0.6 * i)}deg) scale(${n(1 + 0.04 * i)})`,
    };
  },
  letterbox: ({ intensity: i }) => {
    const bar = 13 * i;
    return {
      overlay: {
        backgroundImage: `linear-gradient(to bottom, #000 0%, #000 ${n(bar)}%, rgba(0,0,0,0) ${n(bar)}%, rgba(0,0,0,0) ${n(100 - bar)}%, #000 ${n(100 - bar)}%, #000 100%)`,
      },
    };
  },
  vhs: ({ frame, fps, intensity: i, seed }) => {
    const y = ((frame / fps) * 35) % 110 - 5;
    const jitter = random(`${seed}-v-${Math.floor(frame / 4)}`) > 0.8 ? (random(`${seed}-vx-${frame}`) - 0.5) * 16 * i : 0;
    return {
      filter: `saturate(${n(1 + 0.5 * i)}) contrast(${n(1 + 0.15 * i)}) hue-rotate(${n(-8 * i)}deg)`,
      transform: jitter ? `translateX(${jitter.toFixed(1)}px)` : undefined,
      overlay: {
        backgroundImage:
          `linear-gradient(to bottom, rgba(255,255,255,0) ${n(y)}%, rgba(255,255,255,${n(0.14 * i)}) ${n(y + 2)}%, rgba(255,255,255,0) ${n(y + 6)}%), ` +
          `repeating-linear-gradient(to bottom, rgba(0,0,0,${n(0.3 * i)}) 0, rgba(0,0,0,${n(0.3 * i)}) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 6px)`,
      },
    };
  },
  grain: ({ frame, intensity: i, seed }) => ({
    overlay: {
      backgroundImage: GRAIN,
      backgroundSize: "512px 512px",
      // Pola digeser acak tiap frame supaya butirannya tampak hidup.
      backgroundPosition: `${Math.round(random(`${seed}-gx-${frame}`) * 512)}px ${Math.round(random(`${seed}-gy-${frame}`) * 512)}px`,
      mixBlendMode: "overlay",
      opacity: 0.6 * i,
    },
  }),
};

// --- Transisi ---

export type TransitionResult = {
  /** Gaya untuk klip yang masuk. */
  incoming?: React.CSSProperties;
  /** Gaya untuk klip yang keluar (frame terakhirnya, dibekukan). */
  outgoing?: React.CSSProperties;
  /** Lapisan warna di atas keduanya. */
  overlay?: React.CSSProperties;
};

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

/** Angka ringkas untuk CSS (paling banyak tiga angka di belakang koma). */
function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** 0 → 1 → 0, puncaknya di tengah. */
function peak(p: number): number {
  return 1 - Math.abs(2 * p - 1);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Dua bar hitam dari atas dan bawah seperti kelopak mata; `amount` 1 = tertutup penuh. */
function eyelids(amount: number): React.CSSProperties {
  const edge = 50 * clamp01(amount);
  return {
    backgroundImage: `linear-gradient(to bottom, #000 0%, #000 ${n(edge)}%, rgba(0,0,0,0) ${n(edge)}%, rgba(0,0,0,0) ${n(100 - edge)}%, #000 ${n(100 - edge)}%, #000 100%)`,
  };
}

/** Pola bintik acak (SVG feTurbulence) untuk efek butiran film. */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
)}")`;

/** Titik-titik bintang lima sudut dalam persen kanvas (sama dengan STAR untuk mask). */
const STAR_POINTS: [number, number][] = [
  [50, 2], [61, 38], [98, 38], [68, 60], [79, 96], [50, 74], [21, 96], [32, 60], [2, 38], [39, 38],
];

/** `p` = kemajuan transisi 0–1 (sudah dilengkungkan). */
export const TRANSITION_RENDERERS: Record<TransitionId, (p: number) => TransitionResult> = {
  fade: (p) => ({ incoming: { opacity: p } }),
  "dip-black": (p) => ({
    incoming: { opacity: p < 0.5 ? 0 : 1 },
    overlay: { backgroundColor: "#000", opacity: 1 - Math.abs(2 * p - 1) },
  }),
  flash: (p) => ({
    incoming: { opacity: p < 0.5 ? 0 : 1 },
    overlay: { backgroundColor: "#fff", opacity: 1 - Math.abs(2 * p - 1) },
  }),
  blur: (p) => ({
    incoming: { opacity: p, filter: `blur(${((1 - p) * 40).toFixed(1)}px)` },
    outgoing: { filter: `blur(${(p * 40).toFixed(1)}px)` },
  }),
  "slide-left": (p) => ({
    incoming: { transform: `translateX(${pct(1 - p)})` },
    outgoing: { transform: `translateX(${pct(-p)})` },
  }),
  "slide-right": (p) => ({
    incoming: { transform: `translateX(${pct(p - 1)})` },
    outgoing: { transform: `translateX(${pct(p)})` },
  }),
  "slide-up": (p) => ({
    incoming: { transform: `translateY(${pct(1 - p)})` },
    outgoing: { transform: `translateY(${pct(-p)})` },
  }),
  "slide-down": (p) => ({
    incoming: { transform: `translateY(${pct(p - 1)})` },
    outgoing: { transform: `translateY(${pct(p)})` },
  }),
  "zoom-in": (p) => ({
    incoming: { opacity: p, transform: `scale(${(0.6 + 0.4 * p).toFixed(4)})` },
    outgoing: { transform: `scale(${(1 + 0.8 * p).toFixed(4)})`, opacity: 1 - p },
  }),
  "zoom-out": (p) => ({
    incoming: { opacity: p, transform: `scale(${(1.6 - 0.6 * p).toFixed(4)})` },
    outgoing: { transform: `scale(${(1 - 0.3 * p).toFixed(4)})`, opacity: 1 - p },
  }),
  spin: (p) => ({
    incoming: { opacity: p, transform: `rotate(${((1 - p) * -90).toFixed(2)}deg) scale(${(0.5 + 0.5 * p).toFixed(4)})` },
    outgoing: { opacity: 1 - p, transform: `rotate(${(p * 90).toFixed(2)}deg) scale(${(1 + p).toFixed(4)})` },
  }),
  "wipe-left": (p) => ({ incoming: { clipPath: `inset(0 0 0 ${pct(1 - p)})` } }),
  "wipe-down": (p) => ({ incoming: { clipPath: `inset(0 0 ${pct(1 - p)} 0)` } }),
  circle: (p) => ({ incoming: { clipPath: `circle(${pct(p * 0.75)} at 50% 50%)` } }),
  glare: (p) => {
    const x = -30 + p * 160;
    return {
      incoming: { opacity: clamp01((p - 0.35) / 0.3) },
      overlay: {
        backgroundImage: `linear-gradient(115deg, rgba(255,255,255,0) ${n(x - 30)}%, rgba(255,244,214,0.96) ${n(x)}%, rgba(255,255,255,0) ${n(x + 30)}%)`,
        mixBlendMode: "screen",
        opacity: 0.35 + 0.65 * peak(p),
      },
    };
  },
  "camera-flash": (p) => ({
    incoming: { opacity: p < 0.5 ? 0 : 1, transform: `scale(${(1 + 0.12 * (1 - p)).toFixed(4)})` },
    outgoing: { transform: `scale(${(1 + 0.08 * p).toFixed(4)})` },
    overlay: { backgroundColor: "#fff", opacity: Math.pow(peak(p), 0.6) },
  }),
  "film-burn": (p) => ({
    incoming: { opacity: clamp01((p - 0.3) / 0.4) },
    overlay: {
      backgroundImage: `radial-gradient(circle at ${n(20 + 60 * p)}% 40%, rgba(255,214,120,0.96), rgba(255,98,0,0.82) 35%, rgba(180,20,0,0) 72%)`,
      mixBlendMode: "screen",
      opacity: peak(p),
    },
  }),
  strobe: (p) => ({ incoming: { opacity: p >= 0.75 || Math.floor(p * 8) % 2 === 1 ? 1 : 0 } }),
  blink: (p) => ({
    incoming: { opacity: p < 0.5 ? 0 : 1, filter: `blur(${n(peak(p) * 6)}px)` },
    outgoing: { filter: `blur(${n(peak(p) * 6)}px)` },
    overlay: eyelids(peak(p)),
  }),
  "whip-left": (p) => ({
    incoming: { transform: `translateX(${pct(1 - p)})`, filter: `blur(${n(peak(p) * 24)}px)` },
    outgoing: { transform: `translateX(${pct(-p)})`, filter: `blur(${n(peak(p) * 24)}px)` },
  }),
  "whip-right": (p) => ({
    incoming: { transform: `translateX(${pct(p - 1)})`, filter: `blur(${n(peak(p) * 24)}px)` },
    outgoing: { transform: `translateX(${pct(p)})`, filter: `blur(${n(peak(p) * 24)}px)` },
  }),
  "whip-up": (p) => ({
    incoming: { transform: `translateY(${pct(1 - p)})`, filter: `blur(${n(peak(p) * 24)}px)` },
    outgoing: { transform: `translateY(${pct(-p)})`, filter: `blur(${n(peak(p) * 24)}px)` },
  }),
  "zoom-blur": (p) => ({
    incoming: { opacity: p, transform: `scale(${(0.4 + 0.6 * p).toFixed(4)})`, filter: `blur(${n((1 - p) * 24)}px)` },
    outgoing: { opacity: 1 - p, transform: `scale(${(1 + 2.2 * p).toFixed(4)})`, filter: `blur(${n(p * 24)}px)` },
  }),
  "spin-blur": (p) => ({
    incoming: {
      opacity: p,
      transform: `rotate(${n((1 - p) * -120)}deg) scale(${(1.8 - 0.8 * p).toFixed(4)})`,
      filter: `blur(${n((1 - p) * 20)}px)`,
    },
    outgoing: {
      opacity: 1 - p,
      transform: `rotate(${n(p * 120)}deg) scale(${(1 + 0.8 * p).toFixed(4)})`,
      filter: `blur(${n(p * 20)}px)`,
    },
  }),
  shake: (p) => {
    const amount = peak(p);
    const transform = `translate(${n(Math.sin(p * 40) * amount * 4)}%, ${n(Math.cos(p * 33) * amount * 3)}%) scale(${n(1 + 0.08 * amount)})`;
    return { incoming: { opacity: p < 0.5 ? 0 : 1, transform }, outgoing: { transform } };
  },
  glitch: (p) => {
    const jitter = Math.sin(p * 90) * peak(p);
    return {
      incoming: {
        opacity: p >= 0.5 || Math.sin(p * 80) > 0.5 ? 1 : 0,
        transform: `translateX(${n(jitter * 6)}%) skewX(${n(jitter * 10)}deg)`,
        filter: `hue-rotate(${n(jitter * 120)}deg) saturate(${n(1 + peak(p) * 1.5)})`,
      },
      outgoing: {
        transform: `translateX(${n(-jitter * 6)}%) skewX(${n(-jitter * 10)}deg)`,
        filter: `hue-rotate(${n(-jitter * 120)}deg)`,
      },
    };
  },
  split: (p) => ({ incoming: { clipPath: `inset(0 ${n(50 * (1 - p))}% 0 ${n(50 * (1 - p))}%)` } }),
  shutter: (p) => {
    // Delapan bilah mendatar yang melebar sampai menutup penuh.
    const image = `repeating-linear-gradient(to bottom, #000 0%, #000 ${n(p * 12.5)}%, rgba(0,0,0,0) ${n(p * 12.5)}%, rgba(0,0,0,0) 12.5%)`;
    return { incoming: p >= 1 ? {} : { maskImage: image, WebkitMaskImage: image } };
  },
  flip: (p) => ({
    incoming: { opacity: p < 0.5 ? 0 : 1, transform: `perspective(1600px) rotateY(${n(Math.min(0, (p - 1) * 180))}deg)` },
    outgoing: { opacity: p < 0.5 ? 1 : 0, transform: `perspective(1600px) rotateY(${n(Math.min(90, p * 180))}deg)` },
  }),
  pop: (p) => ({
    incoming: {
      opacity: Math.min(1, p * 3),
      transform: `scale(${(0.6 + 0.4 * (1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2))).toFixed(4)})`,
    },
  }),
  "wipe-right": (p) => ({ incoming: { clipPath: `inset(0 ${pct(1 - p)} 0 0)` } }),
  "wipe-up": (p) => ({ incoming: { clipPath: `inset(${pct(1 - p)} 0 0 0)` } }),
  diagonal: (p) => {
    // Garis miring 45° yang menyapu dari sudut kiri atas sampai kanan bawah.
    const edge = n(p * 200);
    return { incoming: { clipPath: `polygon(0% 0%, ${edge}% 0%, 0% ${edge}%)` } };
  },
  clock: (p) => {
    const image = `conic-gradient(from 0deg at 50% 50%, #000 ${n(p * 360)}deg, rgba(0,0,0,0) ${n(p * 360)}deg)`;
    return { incoming: p >= 1 ? {} : { maskImage: image, WebkitMaskImage: image } };
  },
  corner: (p) => ({ incoming: { clipPath: `circle(${pct(p * 1.5)} at 0% 0%)` } }),
  diamond: (p) => {
    // Belah ketupat dari tengah; pada jarak 100% keempat sudut kanvas ikut tertutup.
    const near = n(50 - p * 100);
    const far = n(50 + p * 100);
    return { incoming: { clipPath: `polygon(50% ${near}%, ${far}% 50%, 50% ${far}%, ${near}% 50%)` } };
  },
  star: (p) => {
    // Titik bintang diperbesar dari tengah; pada 4,5x lekukan dalamnya sudah melewati sudut kanvas.
    const size = p * 4.5;
    const points = STAR_POINTS.map(([x, y]) => `${n(50 + (x - 50) * size)}% ${n(50 + (y - 50) * size)}%`).join(", ");
    return { incoming: p >= 1 ? {} : { clipPath: `polygon(${points})` } };
  },
  blinds: (p) => {
    // Sepuluh bilah tegak yang melebar sampai menutup penuh.
    const image = `repeating-linear-gradient(to right, #000 0%, #000 ${n(p * 10)}%, rgba(0,0,0,0) ${n(p * 10)}%, rgba(0,0,0,0) 10%)`;
    return { incoming: p >= 1 ? {} : { maskImage: image, WebkitMaskImage: image } };
  },
  "cube-left": (p) => ({
    incoming: { transformOrigin: "0% 50%", transform: `perspective(1800px) translateX(${pct(1 - p)}) rotateY(${n((1 - p) * 90)}deg)` },
    outgoing: { transformOrigin: "100% 50%", transform: `perspective(1800px) translateX(${pct(-p)}) rotateY(${n(p * -90)}deg)` },
  }),
  "cube-up": (p) => ({
    incoming: { transformOrigin: "50% 0%", transform: `perspective(1800px) translateY(${pct(1 - p)}) rotateX(${n((1 - p) * -90)}deg)` },
    outgoing: { transformOrigin: "50% 100%", transform: `perspective(1800px) translateY(${pct(-p)}) rotateX(${n(p * 90)}deg)` },
  }),
  door: (p) => ({
    incoming: {
      transformOrigin: "0% 50%",
      opacity: Math.min(1, p * 4),
      transform: `perspective(1800px) rotateY(${n((1 - p) * 90)}deg)`,
    },
    outgoing: { filter: `brightness(${n(1 - 0.6 * p)})`, transform: `scale(${n(1 - 0.08 * p)})` },
  }),
  squeeze: (p) => ({
    incoming: { transformOrigin: "100% 50%", transform: `scaleX(${n(p)})` },
    outgoing: { transformOrigin: "0% 50%", transform: `scaleX(${n(1 - p)})` },
  }),
  bounce: (p) => ({
    incoming: { transform: `translateY(${pct(bounceOut(p) - 1)})` },
    outgoing: { filter: `brightness(${n(1 - 0.5 * p)})` },
  }),
  elastic: (p) => ({
    incoming: { transform: `translateX(${pct(1 - backOut(p))})` },
    outgoing: { transform: `translateX(${pct(-backOut(p))})` },
  }),
  "zoom-rotate": (p) => ({
    incoming: {
      opacity: clamp01(p * 1.5),
      transform: `scale(${n(1.9 - 0.9 * p)}) rotate(${n((1 - p) * 14)}deg)`,
      filter: `blur(${n((1 - p) * 10)}px)`,
    },
    outgoing: { opacity: 1 - p, transform: `scale(${n(1 - 0.35 * p)}) rotate(${n(p * -14)}deg)` },
  }),
  tv: (p) => {
    // Paruh pertama: klip lama menyempit jadi garis. Paruh kedua: klip baru membuka dari garis.
    const closing = clamp01(p * 2);
    const opening = clamp01(p * 2 - 1);
    return {
      incoming: { opacity: p < 0.5 ? 0 : 1, transform: `scaleY(${n(Math.max(0.006, opening))})`, filter: `brightness(${n(1 + (1 - opening) * 1.5)})` },
      outgoing: {
        opacity: p < 0.5 ? 1 : 0,
        transform: `scale(${n(1 - 0.15 * closing)}, ${n(Math.max(0.006, 1 - closing))})`,
        filter: `brightness(${n(1 + closing * 2)})`,
      },
      overlay: { backgroundColor: "#fff", opacity: Math.pow(peak(p), 6) * 0.5 },
    };
  },
  "hue-spin": (p) => ({
    incoming: { opacity: p, filter: `hue-rotate(${n((1 - p) * -180)}deg) saturate(${n(1 + peak(p))})` },
    outgoing: { filter: `hue-rotate(${n(p * 180)}deg) saturate(${n(1 + peak(p))})` },
  }),
};

// --- Animasi masuk/keluar ---

export type AnimationResult = {
  opacity?: number;
  transform?: string;
  filter?: string;
  clipPath?: string;
  /** Jarak antarhuruf (khusus teks). */
  letterSpacing?: string;
  /** Bagian teks yang sudah tampil per huruf (0–1), untuk mesin ketik. */
  reveal?: number;
  /** Bagian teks yang sudah tampil per kata (0–1). */
  revealWords?: number;
};

/** Lengkung yang melewati target lalu kembali, untuk kesan memantul. */
const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/** Lengkung bola jatuh: memantul beberapa kali sebelum diam. */
function bounceOut(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
  if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
  return n * (t - 2.625 / d) ** 2 + 0.984375;
}

const f2 = (value: number) => value.toFixed(2);
const f4 = (value: number) => value.toFixed(4);

/** `p` = seberapa "hadir" klipnya: 0 = belum/tidak terlihat, 1 = tampil penuh. Dipakai untuk masuk dan keluar. */
export const ANIMATION_RENDERERS: Record<AnimationId, (p: number) => AnimationResult> = {
  fade: (p) => ({ opacity: p }),
  pop: (p) => ({ opacity: Math.min(1, p * 3), transform: `scale(${f4(Math.max(0, backOut(p)))})` }),
  bounce: (p) => ({ opacity: Math.min(1, p * 4), transform: `scale(${f4(0.3 + 0.7 * bounceOut(p))})` }),
  "flash-in": (p) => ({ opacity: Math.min(1, p * 2), filter: `brightness(${(1 + (1 - p) * 4).toFixed(3)})` }),
  blur: (p) => ({ opacity: p, filter: `blur(${((1 - p) * 30).toFixed(1)}px)` }),
  "slide-up": (p) => ({ opacity: p, transform: `translateY(${f2((1 - p) * 18)}%)` }),
  "slide-down": (p) => ({ opacity: p, transform: `translateY(${f2((p - 1) * 18)}%)` }),
  "slide-left": (p) => ({ opacity: p, transform: `translateX(${f2((1 - p) * 18)}%)` }),
  "slide-right": (p) => ({ opacity: p, transform: `translateX(${f2((p - 1) * 18)}%)` }),
  "fly-up": (p) => ({ transform: `translateY(${f2((1 - p) * 110)}%)` }),
  "fly-down": (p) => ({ transform: `translateY(${f2((p - 1) * 110)}%)` }),
  "fly-left": (p) => ({ transform: `translateX(${f2((1 - p) * 110)}%)` }),
  "fly-right": (p) => ({ transform: `translateX(${f2((p - 1) * 110)}%)` }),
  drop: (p) => ({ opacity: Math.min(1, p * 4), transform: `translateY(${f2((bounceOut(p) - 1) * 60)}%)` }),
  "zoom-in": (p) => ({ opacity: p, transform: `scale(${f4(0.5 + 0.5 * p)})` }),
  "zoom-out": (p) => ({ opacity: p, transform: `scale(${f4(1.6 - 0.6 * p)})` }),
  stretch: (p) => ({ opacity: p, transform: `scaleX(${f4(0.1 + 0.9 * p)})` }),
  squash: (p) => ({ opacity: p, transform: `scaleY(${f4(0.1 + 0.9 * p)})` }),
  spin: (p) => ({ opacity: p, transform: `rotate(${f2((1 - p) * -180)}deg) scale(${f4(0.4 + 0.6 * p)})` }),
  "spin-zoom": (p) => ({ opacity: p, transform: `rotate(${f2((1 - p) * -540)}deg) scale(${f4(p)})` }),
  "flip-x": (p) => ({ opacity: Math.min(1, p * 2), transform: `perspective(1200px) rotateY(${f2((1 - p) * 90)}deg)` }),
  "flip-y": (p) => ({ opacity: Math.min(1, p * 2), transform: `perspective(1200px) rotateX(${f2((1 - p) * -90)}deg)` }),
  swing: (p) => ({ opacity: Math.min(1, p * 3), transform: `rotate(${f2(Math.sin(p * Math.PI * 3) * (1 - p) * 25)}deg)` }),
  roll: (p) => ({ opacity: p, transform: `translateX(${f2((p - 1) * 40)}%) rotate(${f2((p - 1) * 180)}deg)` }),
  tilt: (p) => ({ opacity: p, transform: `translateY(${f2((1 - p) * 12)}%) rotate(${f2((1 - p) * -14)}deg)` }),
  "wipe-right": (p) => ({ clipPath: `inset(0 ${f2((1 - p) * 100)}% 0 0)` }),
  "wipe-up": (p) => ({ clipPath: `inset(${f2((1 - p) * 100)}% 0 0 0)` }),
  iris: (p) => ({ clipPath: `circle(${f2(p * 75)}% at 50% 50%)` }),
  shake: (p) => ({ opacity: Math.min(1, p * 3), transform: `translateX(${f2(Math.sin(p * Math.PI * 10) * (1 - p) * 6)}%)` }),
  glitch: (p) => {
    const jitter = Math.sin(p * 47) * (1 - p);
    return {
      opacity: Math.min(1, p * 2.5),
      transform: `translateX(${f2(jitter * 8)}%) skewX(${f2(jitter * 20)}deg)`,
      filter: `hue-rotate(${(jitter * 90).toFixed(0)}deg)`,
    };
  },
  typewriter: (p) => ({ reveal: p }),
  words: (p) => ({ revealWords: p }),
  tracking: (p) => ({ opacity: p, letterSpacing: `${((1 - p) * 0.6).toFixed(3)}em` }),
};

/** Teks yang sudah tampil pada animasi mesin ketik atau kata demi kata. */
export function revealText(text: string, result: AnimationResult | null): string {
  if (!result) return text;
  if (result.reveal !== undefined) return text.slice(0, Math.round(text.length * result.reveal));
  if (result.revealWords !== undefined) {
    // Dipecah dengan menyimpan spasinya: [kata, spasi, kata, ...].
    const parts = text.split(/(\s+)/);
    const words = Math.ceil(parts.length / 2);
    return parts.slice(0, Math.round(words * result.revealWords) * 2).join("");
  }
  return text;
}
// --- Mask ---

const STAR = "50,2 61,38 98,38 68,60 79,96 50,74 21,96 32,60 2,38 39,38";
const HEART = "M50 92 C20 68 4 50 4 30 C4 14 16 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C84 4 96 14 96 30 C96 50 80 68 50 92 Z";

/**
 * Mask sebagai gambar SVG (data URL) untuk CSS `mask-image`. Digambar dalam
 * piksel kanvas; `width`/`height` adalah ukuran kanvas.
 */
export function maskStyle(mask: Mask, width: number, height: number): React.CSSProperties {
  const cx = width / 2 + mask.x;
  const cy = height / 2 + mask.y;
  const w = mask.width;
  const h = mask.height;
  const far = Math.max(width, height) * 6;
  let shape: string;
  switch (mask.shape) {
    case "circle":
      shape = `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}"/>`;
      break;
    case "split":
      shape = `<rect x="${cx - far}" y="${cy}" width="${far * 2}" height="${far}"/>`;
      break;
    case "filmstrip":
      shape = `<rect x="${cx - far}" y="${cy - h / 2}" width="${far * 2}" height="${h}"/>`;
      break;
    case "star":
      shape = `<polygon points="${STAR}" transform="translate(${cx - w / 2} ${cy - h / 2}) scale(${w / 100} ${h / 100})"/>`;
      break;
    case "heart":
      shape = `<path d="${HEART}" transform="translate(${cx - w / 2} ${cy - h / 2}) scale(${w / 100} ${h / 100})"/>`;
      break;
    default:
      shape = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${(mask.radius * Math.min(w, h)) / 2}"/>`;
  }
  const blur =
    mask.feather > 0
      ? `<filter id="f" filterUnits="userSpaceOnUse" x="${-far}" y="${-far}" width="${far * 2}" height="${far * 2}"><feGaussianBlur stdDeviation="${mask.feather / 2}"/></filter>`
      : "";
  const group = (fill: string) =>
    `<g fill="${fill}" transform="rotate(${mask.rotation} ${cx} ${cy})"${mask.feather > 0 ? ' filter="url(#f)"' : ""}>${shape}</g>`;
  const body = mask.invert
    ? `<mask id="m"><rect x="0" y="0" width="${width}" height="${height}" fill="white"/>${group("black")}</mask><rect x="0" y="0" width="${width}" height="${height}" fill="white" mask="url(#m)"/>`
    : group("white");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${blur}${body}</svg>`;
  const image = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return {
    maskImage: image,
    maskSize: "100% 100%",
    maskRepeat: "no-repeat",
    WebkitMaskImage: image,
    WebkitMaskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
  };
}