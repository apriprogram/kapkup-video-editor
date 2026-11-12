import { rebaseKeyframes } from "../project/animate";
import { isVisual, itemEnd, type Asset, type Item, type Project, type Track } from "../project/schema";

/** Logika timeline murni (tanpa React/DOM) supaya mudah diuji. */

export const MIN_ITEM_MS = 100;

export function findItem(project: Project, id: string): { track: Track; item: Item } | null {
  for (const track of project.tracks) {
    const item = track.items.find((candidate) => candidate.id === id);
    if (item) return { track, item };
  }
  return null;
}

export function isFree(track: Track, startMs: number, durationMs: number, ignoreId?: string): boolean {
  const end = startMs + durationMs;
  return track.items.every(
    (other) => other.id === ignoreId || other.startMs >= end || itemEnd(other) <= startMs,
  );
}

/**
 * Posisi mulai terdekat dari `desired` yang tidak menabrak klip lain di track.
 * Selalu ada hasilnya, karena setelah klip terakhir selalu kosong.
 */
export function resolveStart(track: Track, desired: number, durationMs: number, ignoreId?: string): number {
  const wanted = Math.max(0, Math.round(desired));
  if (isFree(track, wanted, durationMs, ignoreId)) return wanted;
  const candidates: number[] = [];
  for (const other of track.items) {
    if (other.id === ignoreId) continue;
    candidates.push(itemEnd(other));
    if (other.startMs - durationMs >= 0) candidates.push(other.startMs - durationMs);
  }
  let best = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!isFree(track, candidate, durationMs, ignoreId)) continue;
    const distance = Math.abs(candidate - wanted);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Batas kiri dan kanan yang ditentukan klip tetangga di track yang sama. */
export function neighbors(track: Track, item: Item): { prevEnd: number; nextStart: number } {
  let prevEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const other of track.items) {
    if (other.id === item.id) continue;
    if (itemEnd(other) <= item.startMs) prevEnd = Math.max(prevEnd, itemEnd(other));
    else if (other.startMs >= itemEnd(item)) nextStart = Math.min(nextStart, other.startMs);
  }
  return { prevEnd, nextStart };
}

export function speedOf(item: Item): number {
  return item.type === "video" || item.type === "audio" ? item.speed : 1;
}

/** Panjang maksimum di timeline yang masih tercakup file sumber. */
export function maxDurationMs(item: Item, asset: Asset | undefined): number {
  if (item.type !== "video" && item.type !== "audio") return Number.POSITIVE_INFINITY;
  if (!asset || asset.durationMs <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(MIN_ITEM_MS, Math.floor((asset.durationMs - item.inMs) / speedOf(item)));
}

/** Titik-titik yang bisa "ditempel": awal timeline, tepi semua klip lain, dan titik tambahan. */
export function snapPoints(project: Project, ignoreIds: string[], extra: number[] = []): number[] {
  const points = new Set<number>([0, ...extra]);
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (ignoreIds.includes(item.id)) continue;
      points.add(item.startMs);
      points.add(itemEnd(item));
    }
  }
  return [...points];
}

export function snapValue(value: number, points: number[], thresholdMs: number): number {
  let best = value;
  let bestDistance = thresholdMs;
  for (const point of points) {
    const distance = Math.abs(point - value);
    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/** Membelah klip di `atMs` (waktu timeline). null bila titiknya terlalu dekat ke tepi. */
export function splitItem(item: Item, atMs: number, newId: string): [Item, Item] | null {
  const at = Math.round(atMs);
  if (at < item.startMs + MIN_ITEM_MS || at > itemEnd(item) - MIN_ITEM_MS) return null;
  const leftDuration = at - item.startMs;
  const rightDuration = itemEnd(item) - at;
  const left = {
    ...item,
    durationMs: leftDuration,
    fadeInMs: Math.min(item.fadeInMs, leftDuration),
    fadeOutMs: 0,
  } as Item;
  const right = {
    ...item,
    id: newId,
    startMs: at,
    durationMs: rightDuration,
    fadeInMs: 0,
    fadeOutMs: Math.min(item.fadeOutMs, rightDuration),
  } as Item;
  if (right.type === "video" || right.type === "audio" || right.type === "captions") {
    right.inMs = Math.round(right.inMs + leftDuration * speedOf(item));
  }
  // Animasi keyframe diteruskan tanpa lompatan di titik belah.
  if (isVisual(item) && isVisual(left) && isVisual(right)) {
    left.keyframes = rebaseKeyframes(item, 0, leftDuration);
    right.keyframes = rebaseKeyframes(item, leftDuration, rightDuration);
  }
  // Transisi masuk hanya milik potongan pertama.
  if (right.type === "video" || right.type === "image") right.transitionIn = null;
  return [left, right];
}

/**
 * Menggeser beberapa klip sekaligus sejauh `deltaMs`, masing-masing tetap di track-nya.
 * Mengembalikan false (tanpa mengubah apa pun) bila ada yang akan menabrak klip lain
 * atau melewati awal timeline. `origins` = posisi awal tiap klip saat mulai diseret.
 */
export function shiftItems(project: Project, origins: Map<string, number>, deltaMs: number): boolean {
  const delta = Math.round(deltaMs);
  for (const track of project.tracks) {
    for (const item of track.items) {
      const origin = origins.get(item.id);
      if (origin === undefined) continue;
      const start = origin + delta;
      if (start < 0) return false;
      const end = start + item.durationMs;
      for (const other of track.items) {
        if (origins.has(other.id)) continue;
        if (other.startMs < end && itemEnd(other) > start) return false;
      }
    }
  }
  for (const track of project.tracks) {
    for (const item of track.items) {
      const origin = origins.get(item.id);
      if (origin !== undefined) item.startMs = origin + delta;
    }
  }
  return true;
}