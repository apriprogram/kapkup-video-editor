import { describe, expect, it } from "vitest";
import { transformAt } from "./animate";
import { MOTIONS, MOTION_IDS, buildMotion } from "./motion";
import { NEUTRAL_TRANSFORM, keyframeSchema } from "./schema";

const canvas = { width: 1080, height: 1920 };

describe("buildMotion", () => {
  it("punya label untuk setiap preset", () => {
    expect(MOTIONS.map((motion) => motion.id).sort()).toEqual([...MOTION_IDS].sort());
  });

  it("menghasilkan keyframe yang sah dan terurut untuk klip panjang maupun sangat pendek", () => {
    for (const id of MOTION_IDS) {
      for (const duration of [5000, 320, 40]) {
        const keyframes = buildMotion(id, NEUTRAL_TRANSFORM, duration, canvas);
        expect(keyframes.length, `${id} ${duration}`).toBeGreaterThanOrEqual(2);
        expect(keyframes[0].atMs).toBe(0);
        expect(keyframes[keyframes.length - 1].atMs).toBeLessThanOrEqual(duration);
        keyframes.forEach((keyframe, index) => {
          expect(() => keyframeSchema.parse(keyframe), `${id} #${index}`).not.toThrow();
          if (index > 0) expect(keyframe.atMs, `${id} #${index}`).toBeGreaterThan(keyframes[index - 1].atMs);
        });
      }
    }
  });

  it("bertolak dari posisi klip saat ini", () => {
    const base = { ...NEUTRAL_TRANSFORM, x: 100, scale: 0.5 };
    const zoom = buildMotion("zoom-in", base, 2000, canvas);
    expect(zoom[0]).toMatchObject({ x: 100, scale: 0.5 });
    expect(zoom[1].scale).toBeCloseTo(0.65);
    // Gerak masuk berakhir tepat di posisi dasar dan diam di sana.
    const pop = { transform: base, keyframes: buildMotion("pop-in", base, 3000, canvas) };
    expect(transformAt(pop, 2500)).toMatchObject({ x: 100, scale: 0.5, opacity: 1 });
  });

  it("goyang selalu sama untuk masukan yang sama", () => {
    expect(buildMotion("wiggle", NEUTRAL_TRANSFORM, 1000, canvas)).toEqual(buildMotion("wiggle", NEUTRAL_TRANSFORM, 1000, canvas));
  });
});
