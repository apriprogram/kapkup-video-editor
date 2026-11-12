import type { Easing, Keyframe, Transform } from "./schema";

/** Perhitungan animasi keyframe (murni, dipakai editor dan mesin render). */

const PROPS = ["x", "y", "scale", "rotation", "opacity"] as const;

export function ease(kind: Easing, p: number): number {
  const t = Math.min(1, Math.max(0, p));
  switch (kind) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}

function pick(keyframe: Keyframe): Transform {
  return {
    x: keyframe.x,
    y: keyframe.y,
    scale: keyframe.scale,
    rotation: keyframe.rotation,
    opacity: keyframe.opacity,
  };
}

/** Indeks keyframe terakhir yang waktunya <= localMs, atau -1. */
function segmentIndex(keyframes: Keyframe[], localMs: number): number {
  let index = -1;
  for (let i = 0; i < keyframes.length; i++) {
    if (keyframes[i].atMs <= localMs) index = i;
    else break;
  }
  return index;
}

/** Posisi/ukuran klip pada `localMs` (waktu sejak awal klip). */
export function transformAt(item: { transform: Transform; keyframes: Keyframe[] }, localMs: number): Transform {
  const keyframes = item.keyframes;
  if (keyframes.length === 0) return item.transform;
  const index = segmentIndex(keyframes, localMs);
  if (index < 0) return pick(keyframes[0]);
  if (index >= keyframes.length - 1) return pick(keyframes[keyframes.length - 1]);
  const a = keyframes[index];
  const b = keyframes[index + 1];
  const p = ease(a.easing, (localMs - a.atMs) / (b.atMs - a.atMs));
  const result = {} as Transform;
  for (const prop of PROPS) result[prop] = a[prop] + (b[prop] - a[prop]) * p;
  return result;
}

/** Keyframe yang berada dalam `toleranceMs` dari `localMs`, atau -1. */
export function keyframeIndexNear(keyframes: Keyframe[], localMs: number, toleranceMs: number): number {
  let best = -1;
  let bestDistance = toleranceMs;
  keyframes.forEach((keyframe, index) => {
    const distance = Math.abs(keyframe.atMs - localMs);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Menyesuaikan keyframe saat klip dipotong: bagian [shiftMs, shiftMs + newDurationMs]
 * dari klip lama menjadi klip baru. Gerak di dalam rentang itu dipertahankan dengan
 * menambahkan keyframe di tepi bila ada keyframe yang terbuang.
 */
export function rebaseKeyframes(
  item: { transform: Transform; keyframes: Keyframe[] },
  shiftMs: number,
  newDurationMs: number,
): Keyframe[] {
  const keyframes = item.keyframes;
  if (keyframes.length === 0) return keyframes;
  const end = shiftMs + newDurationMs;
  const inside = keyframes
    .filter((keyframe) => keyframe.atMs >= shiftMs && keyframe.atMs <= end)
    .map((keyframe) => ({ ...keyframe, atMs: Math.round(keyframe.atMs - shiftMs) }));
  if (keyframes[0].atMs < shiftMs && inside[0]?.atMs !== 0) {
    const before = keyframes[Math.max(0, segmentIndex(keyframes, shiftMs))];
    inside.unshift({ ...transformAt(item, shiftMs), atMs: 0, easing: before.easing });
  }
  const last = keyframes[keyframes.length - 1];
  if (last.atMs > end && inside[inside.length - 1]?.atMs !== Math.round(newDurationMs)) {
    inside.push({ ...transformAt(item, end), atMs: Math.round(newDurationMs), easing: "ease-in-out" });
  }
  return inside;
}

/** Skala waktu keyframe saat panjang klip berubah karena kecepatan. */
export function scaleKeyframes(keyframes: Keyframe[], factor: number, maxMs: number): Keyframe[] {
  const scaled: Keyframe[] = [];
  for (const keyframe of keyframes) {
    const atMs = Math.min(maxMs, Math.round(keyframe.atMs * factor));
    if (scaled.length > 0 && scaled[scaled.length - 1].atMs >= atMs) continue;
    scaled.push({ ...keyframe, atMs });
  }
  return scaled;
}
