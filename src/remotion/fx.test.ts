import { describe, expect, it } from "vitest";
import { ANIMATION_IDS, ANIMATIONS, EFFECT_IDS, EFFECTS, TRANSITION_IDS, TRANSITIONS } from "../lib/project/catalog";
import { ANIMATION_RENDERERS, EFFECT_RENDERERS, TRANSITION_RENDERERS, revealText } from "./fx";

/** Semua nilai teks/angka di dalam hasil renderer, termasuk yang bersarang. */
function leaves(value: unknown): (string | number)[] {
  if (typeof value === "string" || typeof value === "number") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [];
}

function expectClean(result: unknown, where: string) {
  for (const leaf of leaves(result)) {
    if (typeof leaf === "number") expect(Number.isFinite(leaf), `${where}: angka tidak valid`).toBe(true);
    else expect(leaf, `${where}: "${leaf}"`).not.toMatch(/NaN|undefined|Infinity/);
  }
}

const STEPS = [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9, 1];

describe("katalog dan renderer", () => {
  it("setiap id punya entri katalog, dan sebaliknya", () => {
    expect(EFFECTS.map((entry) => entry.id).sort()).toEqual([...EFFECT_IDS].sort());
    expect(TRANSITIONS.map((entry) => entry.id).sort()).toEqual([...TRANSITION_IDS].sort());
    expect(ANIMATIONS.map((entry) => entry.id).sort()).toEqual([...ANIMATION_IDS].sort());
  });

  it("ada pilihan populer di efek dan transisi", () => {
    expect(EFFECTS.filter((entry) => entry.popular).length).toBeGreaterThan(4);
    expect(TRANSITIONS.filter((entry) => entry.popular).length).toBeGreaterThan(4);
  });
});

describe("transisi", () => {
  it.each(TRANSITION_IDS)("%s menghasilkan gaya yang valid di sepanjang transisi", (id) => {
    for (const p of STEPS) expectClean(TRANSITION_RENDERERS[id](p), `${id} @ ${p}`);
  });

  it.each(TRANSITION_IDS)("%s menampilkan klip baru secara penuh di akhir", (id) => {
    const { incoming } = TRANSITION_RENDERERS[id](1);
    if (incoming?.opacity !== undefined) expect(Number(incoming.opacity)).toBeCloseTo(1);
  });
});

describe("efek", () => {
  it.each(EFFECT_IDS)("%s valid di tiga detik pertama dan sama untuk frame yang sama", (id) => {
    for (let frame = 0; frame <= 90; frame += 3) {
      const context = { frame, fps: 30, intensity: 0.8, seed: "uji" };
      const result = EFFECT_RENDERERS[id](context);
      expectClean(result, `${id} @ frame ${frame}`);
      // Preview dan render harus identik, jadi hasilnya tidak boleh acak.
      expect(EFFECT_RENDERERS[id](context)).toEqual(result);
    }
  });

  it.each(EFFECT_IDS)("%s tidak mengubah apa pun yang berarti pada kekuatan 0", (id) => {
    const { overlay } = EFFECT_RENDERERS[id]({ frame: 12, fps: 30, intensity: 0, seed: "uji" });
    if (overlay?.opacity !== undefined) expect(Number(overlay.opacity)).toBe(0);
  });
});

describe("animasi", () => {
  it.each(ANIMATION_IDS)("%s valid dari tak terlihat sampai tampil penuh", (id) => {
    for (const p of STEPS) expectClean(ANIMATION_RENDERERS[id](p), `${id} @ ${p}`);
  });

  it("mesin ketik dan kata demi kata menampilkan teks bertahap", () => {
    expect(revealText("Halo dunia baru", { reveal: 0.5 })).toBe("Halo dun");
    expect(revealText("Halo dunia baru", { revealWords: 0.34 })).toBe("Halo ");
    expect(revealText("Halo dunia baru", { revealWords: 1 })).toBe("Halo dunia baru");
    expect(revealText("Halo", null)).toBe("Halo");
  });
});
