import { describe, expect, it } from "vitest";
import { checkProject, projectSchema, type Item, type Track } from "../project/schema";
import { isFree, maxDurationMs, neighbors, resolveStart, snapValue, splitItem } from "./ops";

function video(id: string, startMs: number, durationMs: number, extra: Partial<Item> = {}): Item {
  return {
    id,
    type: "video",
    assetId: "a1",
    startMs,
    durationMs,
    inMs: 0,
    speed: 1,
    volume: 1,
    fit: "contain",
    fadeInMs: 0,
    fadeOutMs: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    keyframes: [],
    adjust: { brightness: 0, contrast: 0, saturation: 0, hue: 0, temperature: 0, blur: 0, vignette: 0 },
    transitionIn: null,
    ...extra,
  } as Item;
}

function track(items: Item[]): Track {
  return { id: "t1", kind: "video", name: "Video", muted: false, hidden: false, items };
}

describe("isFree / resolveStart", () => {
  const t = track([video("a", 0, 1000), video("b", 2000, 1000)]);

  it("mengizinkan klip yang bersebelahan tepat", () => {
    expect(isFree(t, 1000, 1000)).toBe(true);
    expect(isFree(t, 900, 1000)).toBe(false);
  });

  it("mengabaikan klip itu sendiri", () => {
    expect(isFree(t, 100, 800, "a")).toBe(true);
  });

  it("memilih celah terdekat saat menabrak", () => {
    expect(resolveStart(t, 1100, 1000)).toBe(1000);
    expect(resolveStart(t, 2400, 500)).toBe(3000);
    expect(resolveStart(t, 1700, 500)).toBe(1500);
  });

  it("tidak pernah menghasilkan waktu negatif", () => {
    expect(resolveStart(track([]), -500, 1000)).toBe(0);
  });
});

describe("neighbors", () => {
  it("mengembalikan tepi klip sebelum dan sesudah", () => {
    const b = video("b", 2000, 1000);
    const t = track([video("a", 0, 1500), b, video("c", 4000, 500)]);
    expect(neighbors(t, b)).toEqual({ prevEnd: 1500, nextStart: 4000 });
  });
});

describe("splitItem", () => {
  it("membelah dan menggeser titik sumber sesuai kecepatan", () => {
    const parts = splitItem(video("a", 1000, 4000, { inMs: 500, speed: 2 } as Partial<Item>), 2000, "b");
    expect(parts).not.toBeNull();
    const [left, right] = parts!;
    expect(left.durationMs).toBe(1000);
    expect(right.startMs).toBe(2000);
    expect(right.durationMs).toBe(3000);
    expect(right.type === "video" && right.inMs).toBe(2500);
  });

  it("menolak titik yang terlalu dekat ke tepi", () => {
    expect(splitItem(video("a", 0, 1000), 50, "b")).toBeNull();
    expect(splitItem(video("a", 0, 1000), 1000, "b")).toBeNull();
  });
});

describe("maxDurationMs / snapValue", () => {
  it("membatasi panjang klip pada sisa sumber", () => {
    const asset = projectSchema.parse({
      assets: [{ id: "a1", type: "video", name: "x", path: "media/x.mp4", durationMs: 10000 }],
    }).assets[0];
    expect(maxDurationMs(video("a", 0, 1000, { inMs: 4000, speed: 2 } as Partial<Item>), asset)).toBe(3000);
  });

  it("menempel hanya di dalam ambang", () => {
    expect(snapValue(980, [0, 1000], 50)).toBe(1000);
    expect(snapValue(900, [0, 1000], 50)).toBe(900);
  });
});

describe("checkProject", () => {
  it("menerima project yang ditulis ringkas dan mengisi default", () => {
    const project = projectSchema.parse({
      assets: [{ id: "a1", type: "video", name: "x", path: "media/x.mp4", durationMs: 5000 }],
      tracks: [{ id: "t1", kind: "video", items: [{ id: "i1", type: "video", assetId: "a1", startMs: 0, durationMs: 2000 }] }],
    });
    expect(project.tracks[0].items[0]).toMatchObject({ speed: 1, volume: 1, transform: { scale: 1 } });
    expect(checkProject(project)).toEqual([]);
  });

  it("melaporkan tumpang tindih, aset hilang, dan sumber yang terlampaui", () => {
    const project = projectSchema.parse({
      assets: [{ id: "a1", type: "video", name: "x", path: "media/x.mp4", durationMs: 1000 }],
      tracks: [
        {
          id: "t1",
          kind: "video",
          items: [
            { id: "i1", type: "video", assetId: "a1", startMs: 0, durationMs: 2000 },
            { id: "i2", type: "video", assetId: "tidak-ada", startMs: 1500, durationMs: 500 },
          ],
        },
      ],
    });
    const issues = checkProject(project).join("\n");
    expect(issues).toContain("tumpang tindih");
    expect(issues).toContain("tidak ada");
    expect(issues).toContain("aset hanya 1000 ms");
  });
});
