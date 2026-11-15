import { describe, expect, it } from "vitest";
import { ease, keyframeIndexNear, rebaseKeyframes, scaleKeyframes, transformAt } from "./animate";
import { EASINGS, NEUTRAL_TRANSFORM, type Keyframe } from "./schema";

const kf = (atMs: number, scale: number, easing: Keyframe["easing"] = "linear"): Keyframe => ({
  ...NEUTRAL_TRANSFORM,
  scale,
  atMs,
  easing,
});

describe("transformAt", () => {
  it("memakai transform dasar bila tidak ada keyframe", () => {
    const transform = { ...NEUTRAL_TRANSFORM, scale: 2 };
    expect(transformAt({ transform, keyframes: [] }, 500)).toBe(transform);
  });

  it("menghitung nilai di antara dua keyframe dan menahan di luar rentang", () => {
    const item = { transform: NEUTRAL_TRANSFORM, keyframes: [kf(1000, 1), kf(3000, 2)] };
    expect(transformAt(item, 0).scale).toBe(1);
    expect(transformAt(item, 2000).scale).toBeCloseTo(1.5);
    expect(transformAt(item, 9000).scale).toBe(2);
  });

  it("melengkungkan gerak sesuai easing keyframe awal segmen", () => {
    const item = { transform: NEUTRAL_TRANSFORM, keyframes: [kf(0, 1, "ease-in"), kf(1000, 2)] };
    expect(transformAt(item, 500).scale).toBeCloseTo(1.25);
  });
});

describe("ease", () => {
  it("selalu mulai di 0 dan berakhir di 1 untuk semua lengkung", () => {
    for (const kind of EASINGS) {
      expect(ease(kind, 0), kind).toBeCloseTo(0);
      expect(ease(kind, 1), kind).toBeCloseTo(1);
    }
  });

  it("back-out melewati tujuan, hold menahan sampai akhir", () => {
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((t) => ease("back-out", t)))).toBeGreaterThan(1);
    expect(ease("back-in", 0.2)).toBeLessThan(0);
    expect(ease("hold", 0.99)).toBe(0);
    const item = { transform: NEUTRAL_TRANSFORM, keyframes: [kf(0, 1, "hold"), kf(1000, 2)] };
    expect(transformAt(item, 900).scale).toBe(1);
    expect(transformAt(item, 1000).scale).toBe(2);
  });
});

describe("rebaseKeyframes", () => {
  const item = { transform: NEUTRAL_TRANSFORM, keyframes: [kf(0, 1), kf(4000, 2)] };

  it("menambah keyframe tepi supaya gerak tidak melompat saat klip dibelah", () => {
    const left = rebaseKeyframes(item, 0, 1000);
    expect(left.map((k) => [k.atMs, k.scale])).toEqual([
      [0, 1],
      [1000, 1.25],
    ]);
    const right = rebaseKeyframes(item, 1000, 3000);
    expect(right.map((k) => [k.atMs, k.scale])).toEqual([
      [0, 1.25],
      [3000, 2],
    ]);
  });

  it("membiarkan keyframe yang masih di dalam rentang", () => {
    expect(rebaseKeyframes(item, 0, 5000)).toHaveLength(2);
  });
});

describe("keyframeIndexNear / scaleKeyframes", () => {
  it("menemukan keyframe dalam toleransi saja", () => {
    const keyframes = [kf(0, 1), kf(1000, 2)];
    expect(keyframeIndexNear(keyframes, 990, 20)).toBe(1);
    expect(keyframeIndexNear(keyframes, 900, 20)).toBe(-1);
  });

  it("menskalakan waktu saat panjang klip berubah", () => {
    expect(scaleKeyframes([kf(0, 1), kf(4000, 2)], 0.5, 2000).map((k) => k.atMs)).toEqual([0, 2000]);
  });
});
