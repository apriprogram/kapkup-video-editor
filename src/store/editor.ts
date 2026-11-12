"use client";

import type { PlayerRef } from "@remotion/player";
import { current, produce } from "immer";
import { nanoid } from "nanoid";
import { create } from "zustand";
import {
  durationInFrames,
  frameToMs,
  NEUTRAL_ADJUST,
  NEUTRAL_TRANSFORM,
  captionsItemSchema,
  isMedia,
  isVisual,
  itemEnd,
  msToFrame,
  textItemSchema,
  trackKindFor,
  type Adjust,
  type Asset,
  type CaptionWord,
  type Item,
  type Keyframe,
  type Project,
  type Settings,
  type TextStyle,
  type Track,
  type TrackKind,
  type Transform,
  type Transition,
  type VisualItem,
} from "@/lib/project/schema";
import { keyframeIndexNear, rebaseKeyframes, scaleKeyframes, transformAt } from "@/lib/project/animate";
import type { EffectId } from "@/lib/project/catalog";
import { findItem, isFree as isFreeIn, maxDurationMs, neighbors, resolveStart, splitItem } from "@/lib/timeline/ops";
import { clamp } from "@/lib/utils";

const HISTORY_LIMIT = 100;
export const MIN_PX_PER_SEC = 4;
export const MAX_PX_PER_SEC = 400;

type ApplyOptions = {
  /** false = perubahan sementara saat menyeret; riwayat dicatat oleh beginGesture(). */
  history?: boolean;
  /** Perubahan beruntun dengan kunci sama (mis. menggeser slider) digabung jadi satu langkah undo. */
  coalesce?: string;
};

type EditorState = {
  projectId: string | null;
  project: Project | null;
  /** Waktu ubah project.json yang terakhir diketahui editor. */
  mtimeMs: number;
  dirty: boolean;
  saveState: "saved" | "saving" | "error";
  selectedIds: string[];
  /** Media yang dipilih di panel Media (terpisah dari klip terpilih di timeline). */
  selectedAssetIds: string[];
  frame: number;
  playing: boolean;
  pxPerSec: number;
  snap: boolean;
  past: Project[];
  future: Project[];
  historyKey: string | null;
  historyAt: number;

  load: (projectId: string, project: Project, mtimeMs: number) => void;
  replaceFromDisk: (project: Project, mtimeMs: number) => void;
  markSaving: () => void;
  markSaved: (saved: Project, mtimeMs: number) => void;
  markSaveError: () => void;

  apply: (mutator: (draft: Project) => void, options?: ApplyOptions) => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;

  select: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  setFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  setPxPerSec: (value: number) => void;
  toggleSnap: () => void;

  addAsset: (asset: Asset) => void;
  /** Menghapus media dari project beserta semua klip yang memakainya (file di disk tetap ada). */
  removeAsset: (assetId: string) => void;
  selectMany: (ids: string[]) => void;
  selectAll: () => void;
  selectAsset: (assetId: string, additive?: boolean) => void;
  removeAssets: (assetIds: string[]) => void;
  /** Menghapus apa pun yang sedang dipilih: media di panel Media, atau klip di timeline. */
  deleteAnySelection: () => void;
  /** Memindahkan suara klip video ke track audio sebagai klip sendiri. false bila tidak bisa. */
  detachAudio: (id: string) => boolean;
  /** Membuang bagian klip sebelum ("start") atau sesudah ("end") garis waktu. */
  trimToPlayhead: (side: "start" | "end") => void;
  duplicateSelected: () => void;
  setCover: (ms: number | null) => void;
  addAssetToTimeline: (assetId: string, target?: { trackId?: string; startMs?: number }) => void;
  addText: (text: string, style?: Partial<TextStyle>) => void;
  addCaptions: (words: CaptionWord[], placement: { startMs: number; inMs: number; durationMs: number }) => void;
  addFx: (
    spec: { type: "effect"; effect: EffectId } | { type: "adjustment"; adjust?: Partial<Adjust> },
    target?: { trackId?: string; startMs?: number },
  ) => void;
  setTransition: (id: string, transition: Transition | null) => void;
  /** Mengubah posisi/ukuran; bila klip punya keyframe, yang diubah adalah keyframe di garis waktu. */
  setTransform: (id: string, patch: Partial<Transform>) => void;
  toggleKeyframe: (id: string) => void;
  clearKeyframes: (id: string) => void;
  applyZoom: (id: string, mode: "in" | "out", factor?: number) => void;
  updateItem: (id: string, mutator: (item: Item) => void, coalesce?: string) => void;
  setSpeed: (id: string, speed: number) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;
  toggleTrack: (id: string, key: "muted" | "hidden") => void;
  updateSettings: (patch: Partial<Settings>) => void;
  rename: (name: string) => void;
};

function playheadMs(state: Pick<EditorState, "frame" | "project">): number {
  return state.project ? frameToMs(state.frame, state.project.settings.fps) : 0;
}

function ensureTrack(draft: Project, kind: TrackKind, preferredId?: string): Track {
  const preferred = draft.tracks.find((track) => track.id === preferredId && track.kind === kind);
  if (preferred) return preferred;
  const existing = draft.tracks.find((track) => track.kind === kind);
  if (existing) return existing;
  return insertTrack(draft, kind);
}

function insertKeyframe(item: VisualItem, keyframe: Keyframe) {
  const index = item.keyframes.findIndex((other) => other.atMs > keyframe.atMs);
  if (index < 0) item.keyframes.push(keyframe);
  else item.keyframes.splice(index, 0, keyframe);
}

function insertTrack(draft: Project, kind: TrackKind): Track {
  const names: Record<TrackKind, string> = { text: "Teks", video: "Video", audio: "Audio", fx: "Efek" };
  const count = draft.tracks.filter((track) => track.kind === kind).length;
  const track: Track = {
    id: `t-${nanoid(6)}`,
    kind,
    name: count === 0 ? names[kind] : `${names[kind]} ${count + 1}`,
    muted: false,
    hidden: false,
    items: [],
  };
  // Susunan dari atas: teks, efek, video, audio. Track baru masuk di atas kelompoknya.
  // Track efek ditaruh tepat di atas video supaya teks di atasnya tidak ikut terkena efek.
  if (kind === "audio") {
    draft.tracks.push(track);
  } else if (kind === "text") {
    draft.tracks.unshift(track);
  } else {
    const firstVideo = draft.tracks.findIndex((t) => t.kind === "video");
    const firstAudio = draft.tracks.findIndex((t) => t.kind === "audio");
    const index = firstVideo >= 0 ? firstVideo : firstAudio >= 0 ? firstAudio : draft.tracks.length;
    draft.tracks.splice(index, 0, track);
  }
  return track;
}

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  project: null,
  mtimeMs: 0,
  dirty: false,
  saveState: "saved",
  selectedIds: [],
  selectedAssetIds: [],
  frame: 0,
  playing: false,
  pxPerSec: 60,
  snap: true,
  past: [],
  future: [],
  historyKey: null,
  historyAt: 0,

  load: (projectId, project, mtimeMs) =>
    set({
      projectId,
      project,
      mtimeMs,
      dirty: false,
      saveState: "saved",
      selectedIds: [],
      frame: 0,
      playing: false,
      past: [],
      future: [],
      historyKey: null,
    }),

  replaceFromDisk: (project, mtimeMs) => {
    const state = get();
    const valid = new Set(project.tracks.flatMap((track) => track.items.map((item) => item.id)));
    set({
      project,
      mtimeMs,
      dirty: false,
      saveState: "saved",
      // Perubahan dari luar bisa di-undo seperti langkah biasa.
      past: state.project ? [...state.past, state.project].slice(-HISTORY_LIMIT) : state.past,
      future: [],
      historyKey: null,
      selectedIds: state.selectedIds.filter((id) => valid.has(id)),
      frame: clamp(state.frame, 0, durationInFrames(project) - 1),
    });
  },

  markSaving: () => set({ saveState: "saving" }),
  markSaved: (saved, mtimeMs) =>
    set((state) => ({
      mtimeMs,
      dirty: state.project !== saved,
      saveState: "saved",
    })),
  markSaveError: () => set({ saveState: "error" }),

  apply: (mutator, options = {}) => {
    const state = get();
    if (!state.project) return;
    const next = produce(state.project, mutator);
    if (next === state.project) return;
    if (options.history === false) {
      set({ project: next, dirty: true });
      return;
    }
    const now = Date.now();
    const coalesced =
      options.coalesce !== undefined && options.coalesce === state.historyKey && now - state.historyAt < 1000;
    set({
      project: next,
      dirty: true,
      past: coalesced ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
      future: [],
      historyKey: options.coalesce ?? null,
      historyAt: now,
    });
  },

  beginGesture: () => {
    const state = get();
    if (!state.project) return;
    set({ past: [...state.past, state.project].slice(-HISTORY_LIMIT), future: [], historyKey: null });
  },

  endGesture: () => {
    const state = get();
    // Seret tanpa perubahan tidak perlu meninggalkan langkah undo kosong.
    if (state.past.length > 0 && state.past[state.past.length - 1] === state.project) {
      set({ past: state.past.slice(0, -1) });
    }
  },

  undo: () => {
    const state = get();
    if (!state.project || state.past.length === 0) return;
    const previous = state.past[state.past.length - 1];
    set({
      project: previous,
      past: state.past.slice(0, -1),
      future: [state.project, ...state.future],
      dirty: true,
      historyKey: null,
      frame: clamp(state.frame, 0, durationInFrames(previous) - 1),
    });
  },

  redo: () => {
    const state = get();
    if (!state.project || state.future.length === 0) return;
    const next = state.future[0];
    set({
      project: next,
      past: [...state.past, state.project],
      future: state.future.slice(1),
      dirty: true,
      historyKey: null,
      frame: clamp(state.frame, 0, durationInFrames(next) - 1),
    });
  },

  select: (id, additive = false) =>
    set((state) => {
      if (!additive) return { selectedIds: [id], selectedAssetIds: [] };
      return {
        selectedAssetIds: [],
        selectedIds: state.selectedIds.includes(id)
          ? state.selectedIds.filter((other) => other !== id)
          : [...state.selectedIds, id],
      };
    }),
  clearSelection: () => set((state) => (state.selectedIds.length ? { selectedIds: [] } : state)),
  setFrame: (frame) => set((state) => (state.frame === frame ? state : { frame })),
  setPlaying: (playing) => set({ playing }),
  setPxPerSec: (value) => set({ pxPerSec: clamp(value, MIN_PX_PER_SEC, MAX_PX_PER_SEC) }),
  toggleSnap: () => set((state) => ({ snap: !state.snap })),

  addAsset: (asset) =>
    get().apply((draft) => {
      draft.assets.push(asset);
    }),

  removeAsset: (assetId) => {
    get().apply((draft) => {
      draft.assets = draft.assets.filter((asset) => asset.id !== assetId);
      for (const track of draft.tracks) {
        track.items = track.items.filter((item) => !(isMedia(item) && item.assetId === assetId));
      }
    });
    const project = get().project;
    if (!project) return;
    const remaining = new Set(project.tracks.flatMap((track) => track.items.map((item) => item.id)));
    set((state) => ({ selectedIds: state.selectedIds.filter((id) => remaining.has(id)) }));
  },

  selectMany: (ids) => set({ selectedIds: ids, selectedAssetIds: [] }),

  selectAsset: (assetId, additive = false) =>
    set((state) => ({
      selectedIds: [],
      selectedAssetIds: !additive
        ? [assetId]
        : state.selectedAssetIds.includes(assetId)
          ? state.selectedAssetIds.filter((other) => other !== assetId)
          : [...state.selectedAssetIds, assetId],
    })),

  removeAssets: (assetIds) => {
    const ids = new Set(assetIds);
    get().apply((draft) => {
      draft.assets = draft.assets.filter((asset) => !ids.has(asset.id));
      for (const track of draft.tracks) {
        track.items = track.items.filter((item) => !(isMedia(item) && ids.has(item.assetId)));
      }
    });
    const project = get().project;
    const remaining = new Set(project?.tracks.flatMap((track) => track.items.map((item) => item.id)) ?? []);
    set((state) => ({ selectedAssetIds: [], selectedIds: state.selectedIds.filter((id) => remaining.has(id)) }));
  },

  deleteAnySelection: () => {
    const state = get();
    // Klip terpilih di timeline didahulukan; media dihapus hanya bila tidak ada klip yang dipilih.
    if (state.selectedIds.length > 0 || state.selectedAssetIds.length === 0) {
      state.deleteSelected();
      return;
    }
    const ids = new Set(state.selectedAssetIds);
    const used = (state.project?.tracks ?? [])
      .flatMap((track) => track.items)
      .filter((item) => isMedia(item) && ids.has(item.assetId)).length;
    if (
      used > 0 &&
      !window.confirm(`${ids.size} media terpilih dipakai ${used} klip di timeline.\n\nHapus media beserta klipnya?`)
    ) {
      return;
    }
    state.removeAssets([...ids]);
  },

  detachAudio: (id) => {
    const state = get();
    const found = state.project && findItem(state.project, id);
    const source = found?.item;
    if (!source || source.type !== "video" || source.volume === 0) return false;
    const asset = state.project?.assets.find((candidate) => candidate.id === source.assetId);
    if (!asset?.hasAudio) return false;
    const audioId = `i-${nanoid(8)}`;
    state.apply((draft) => {
      const current = findItem(draft, id);
      if (!current || current.item.type !== "video") return;
      const video = current.item;
      const track =
        draft.tracks.find((candidate) => candidate.kind === "audio" && isFreeIn(candidate, video.startMs, video.durationMs)) ??
        insertTrack(draft, "audio");
      track.items.push({
        id: audioId,
        type: "audio",
        assetId: video.assetId,
        startMs: video.startMs,
        durationMs: video.durationMs,
        inMs: video.inMs,
        speed: video.speed,
        volume: video.volume,
        fadeInMs: video.fadeInMs,
        fadeOutMs: video.fadeOutMs,
      });
      video.volume = 0;
    });
    set({ selectedIds: [audioId] });
    return true;
  },

  trimToPlayhead: (side) => {
    const state = get();
    if (!state.project) return;
    const at = Math.round(playheadMs(state));
    const selected = new Set(state.selectedIds);
    state.apply((draft) => {
      for (const track of draft.tracks) {
        for (const item of track.items) {
          if (selected.size > 0 && !selected.has(item.id)) continue;
          if (at <= item.startMs + 50 || at >= itemEnd(item) - 50) continue;
          const end = itemEnd(item);
          if (side === "start") {
            const shift = at - item.startMs;
            if (isVisual(item)) item.keyframes = rebaseKeyframes(item, shift, end - at);
            if (item.type === "video" || item.type === "audio") item.inMs = Math.round(item.inMs + shift * item.speed);
            if (item.type === "captions") item.inMs += shift;
            item.startMs = at;
            item.durationMs = end - at;
          } else {
            if (isVisual(item)) item.keyframes = rebaseKeyframes(item, 0, at - item.startMs);
            item.durationMs = at - item.startMs;
          }
          item.fadeInMs = Math.min(item.fadeInMs, item.durationMs);
          item.fadeOutMs = Math.min(item.fadeOutMs, item.durationMs - item.fadeInMs);
        }
      }
    });
  },

  duplicateSelected: () => {
    const state = get();
    if (!state.project || state.selectedIds.length === 0) return;
    const selected = new Set(state.selectedIds);
    const created: string[] = [];
    state.apply((draft) => {
      for (const track of draft.tracks) {
        for (const item of [...track.items]) {
          if (!selected.has(item.id)) continue;
          const copy = { ...current(item), id: `i-${nanoid(8)}` };
          copy.startMs = resolveStart(track, itemEnd(item), item.durationMs);
          track.items.push(copy);
          created.push(copy.id);
        }
      }
    });
    if (created.length > 0) set({ selectedIds: created });
  },

  setCover: (ms) =>
    get().apply((draft) => {
      draft.coverMs = ms === null ? null : Math.round(ms);
    }),
  selectAll: () =>
    set((state) => ({
      selectedAssetIds: [],
      selectedIds: state.project ? state.project.tracks.flatMap((track) => track.items.map((item) => item.id)) : [],
    })),

  addAssetToTimeline: (assetId, target) => {
    const state = get();
    const asset = state.project?.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return;
    const id = `i-${nanoid(8)}`;
    const durationMs = asset.type === "image" ? 3000 : Math.max(100, asset.durationMs);
    const desired = target?.startMs ?? playheadMs(state);
    state.apply((draft) => {
      const track = ensureTrack(draft, trackKindFor(asset.type), target?.trackId);
      const startMs = resolveStart(track, desired, durationMs);
      const base = { id, startMs, durationMs, fadeInMs: 0, fadeOutMs: 0 };
      const visual = {
        fit: "contain" as const,
        transform: { ...NEUTRAL_TRANSFORM },
        keyframes: [],
        adjust: { ...NEUTRAL_ADJUST },
        transitionIn: null,
        animationIn: null,
        animationOut: null,
        backdropBlur: 0,
        mask: null,
        flipX: false,
        flipY: false,
        blendMode: "normal" as const,
      };
      if (asset.type === "video") {
        track.items.push({ ...base, ...visual, type: "video", assetId, inMs: 0, speed: 1, volume: 1 });
      } else if (asset.type === "image") {
        track.items.push({ ...base, ...visual, type: "image", assetId });
      } else {
        track.items.push({ ...base, type: "audio", assetId, inMs: 0, speed: 1, volume: 1 });
      }
    });
    set({ selectedIds: [id] });
  },

  addText: (text, style) => {
    const state = get();
    if (!state.project) return;
    const id = `i-${nanoid(8)}`;
    const durationMs = 3000;
    const desired = playheadMs(state);
    state.apply((draft) => {
      // Teks yang menabrak di track pertama dipindah ke track teks lain yang kosong di waktu itu.
      let track = draft.tracks.find(
        (candidate) => candidate.kind === "text" && resolveStart(candidate, desired, durationMs) === Math.round(desired),
      );
      if (!track) {
        track = draft.tracks.some((candidate) => candidate.kind === "text")
          ? insertTrack(draft, "text")
          : ensureTrack(draft, "text");
      }
      const startMs = resolveStart(track, desired, durationMs);
      track.items.push(textItemSchema.parse({ id, type: "text", startMs, durationMs, text, style: style ?? {} }));
    });
    set({ selectedIds: [id] });
  },

  addCaptions: (words, placement) => {
    const state = get();
    if (!state.project || words.length === 0) return;
    const id = `i-${nanoid(8)}`;
    state.apply((draft) => {
      // Caption selalu mendapat track teks sendiri di paling atas supaya tidak menabrak teks lain.
      const track = insertTrack(draft, "text");
      track.name = "Caption";
      track.items.push(
        captionsItemSchema.parse({
          id,
          type: "captions",
          words,
          ...placement,
          // Sepertiga bawah layar, posisi umum caption.
          transform: { y: Math.round(draft.settings.height * 0.28) },
        }),
      );
    });
    set({ selectedIds: [id] });
  },

  addFx: (spec, target) => {
    const state = get();
    if (!state.project) return;
    const id = `i-${nanoid(8)}`;
    const durationMs = 3000;
    const desired = target?.startMs ?? playheadMs(state);
    state.apply((draft) => {
      const track = ensureTrack(draft, "fx", target?.trackId);
      const base = { id, startMs: resolveStart(track, desired, durationMs), durationMs, fadeInMs: 0, fadeOutMs: 0 };
      if (spec.type === "effect") {
        track.items.push({ ...base, type: "effect", effect: spec.effect, intensity: 0.6 });
      } else {
        track.items.push({ ...base, type: "adjustment", adjust: { ...NEUTRAL_ADJUST, ...spec.adjust } });
      }
    });
    set({ selectedIds: [id] });
  },

  setTransition: (id, transition) =>
    get().apply(
      (draft) => {
        const found = findItem(draft, id);
        if (!found || (found.item.type !== "video" && found.item.type !== "image")) return;
        found.item.transitionIn = transition
          ? { type: transition.type, durationMs: Math.min(transition.durationMs, found.item.durationMs) }
          : null;
      },
      { coalesce: `${id}:transition` },
    ),

  setTransform: (id, patch) => {
    const state = get();
    if (!state.project) return;
    const at = playheadMs(state);
    const tolerance = (1000 / state.project.settings.fps) * 0.6;
    state.apply(
      (draft) => {
        const found = findItem(draft, id);
        if (!found || !isVisual(found.item)) return;
        const item = found.item;
        if (item.keyframes.length === 0) {
          Object.assign(item.transform, patch);
          return;
        }
        // Dengan keyframe: ubah keyframe di garis waktu, atau buat yang baru di sana.
        const local = clamp(Math.round(at - item.startMs), 0, item.durationMs);
        const index = keyframeIndexNear(item.keyframes, local, tolerance);
        if (index >= 0) {
          Object.assign(item.keyframes[index], patch);
        } else {
          insertKeyframe(item, { ...transformAt(item, local), ...patch, atMs: local, easing: "ease-in-out" });
        }
      },
      { coalesce: `${id}:transform.${Object.keys(patch).join(",")}` },
    );
  },

  toggleKeyframe: (id) => {
    const state = get();
    if (!state.project) return;
    const at = playheadMs(state);
    const tolerance = (1000 / state.project.settings.fps) * 0.6;
    state.apply((draft) => {
      const found = findItem(draft, id);
      if (!found || !isVisual(found.item)) return;
      const item = found.item;
      const local = clamp(Math.round(at - item.startMs), 0, item.durationMs);
      const index = keyframeIndexNear(item.keyframes, local, tolerance);
      if (index >= 0) {
        const [removed] = item.keyframes.splice(index, 1);
        // Keyframe terakhir yang dihapus meninggalkan tampilannya sebagai nilai tetap.
        if (item.keyframes.length === 0) {
          item.transform = {
            x: removed.x,
            y: removed.y,
            scale: removed.scale,
            rotation: removed.rotation,
            opacity: removed.opacity,
          };
        }
      } else {
        insertKeyframe(item, { ...transformAt(item, local), atMs: local, easing: "ease-in-out" });
      }
    });
  },

  clearKeyframes: (id) =>
    get().apply((draft) => {
      const found = findItem(draft, id);
      if (found && isVisual(found.item)) found.item.keyframes = [];
    }),

  applyZoom: (id, mode, factor = 1.3) =>
    get().apply((draft) => {
      const found = findItem(draft, id);
      if (!found || !isVisual(found.item)) return;
      const item = found.item;
      const base = item.transform;
      const near = base.scale;
      const far = base.scale * factor;
      item.keyframes = [
        { ...base, scale: mode === "in" ? near : far, atMs: 0, easing: "ease-in-out" },
        { ...base, scale: mode === "in" ? far : near, atMs: item.durationMs, easing: "ease-in-out" },
      ];
    }),

  updateItem: (id, mutator, coalesce) =>
    get().apply(
      (draft) => {
        const found = findItem(draft, id);
        if (found) mutator(found.item);
      },
      { coalesce: coalesce ? `${id}:${coalesce}` : undefined },
    ),

  setSpeed: (id, speed) =>
    get().apply(
      (draft) => {
        const found = findItem(draft, id);
        if (!found || (found.item.type !== "video" && found.item.type !== "audio")) return;
        const { item, track } = found;
        const sourceLength = item.durationMs * item.speed;
        item.speed = clamp(speed, 0.1, 8);
        const asset = draft.assets.find((candidate) => candidate.id === item.assetId);
        const { nextStart } = neighbors(track, item);
        const previousDuration = item.durationMs;
        item.durationMs = Math.max(
          100,
          Math.round(Math.min(sourceLength / item.speed, maxDurationMs(item, asset), nextStart - item.startMs)),
        );
        if (item.type === "video") {
          item.keyframes = scaleKeyframes(item.keyframes, item.durationMs / previousDuration, item.durationMs);
          if (item.transitionIn) item.transitionIn.durationMs = Math.min(item.transitionIn.durationMs, item.durationMs);
        }
        item.fadeInMs = Math.min(item.fadeInMs, item.durationMs);
        item.fadeOutMs = Math.min(item.fadeOutMs, item.durationMs - item.fadeInMs);
      },
      { coalesce: `${id}:speed` },
    ),

  splitAtPlayhead: () => {
    const state = get();
    if (!state.project) return;
    const at = playheadMs(state);
    const under = (item: Item) => item.startMs < at && itemEnd(item) > at;
    const selected = state.project.tracks
      .flatMap((track) => track.items)
      .filter((item) => state.selectedIds.includes(item.id) && under(item));
    const onlySelected = selected.length > 0;
    state.apply((draft) => {
      for (const track of draft.tracks) {
        for (const item of [...track.items]) {
          if (!under(item)) continue;
          if (onlySelected && !state.selectedIds.includes(item.id)) continue;
          const parts = splitItem(item, at, `i-${nanoid(8)}`);
          if (!parts) continue;
          const index = track.items.findIndex((candidate) => candidate.id === item.id);
          track.items.splice(index, 1, parts[0], parts[1]);
        }
      }
    });
  },

  deleteSelected: () => {
    const state = get();
    if (state.selectedIds.length === 0) return;
    state.apply((draft) => {
      for (const track of draft.tracks) {
        track.items = track.items.filter((item) => !state.selectedIds.includes(item.id));
      }
    });
    set({ selectedIds: [] });
  },

  addTrack: (kind) =>
    get().apply((draft) => {
      insertTrack(draft, kind);
    }),

  removeTrack: (id) =>
    get().apply((draft) => {
      const index = draft.tracks.findIndex((track) => track.id === id);
      if (index >= 0 && draft.tracks[index].items.length === 0) draft.tracks.splice(index, 1);
    }),

  toggleTrack: (id, key) =>
    get().apply((draft) => {
      const track = draft.tracks.find((candidate) => candidate.id === id);
      if (track) track[key] = !track[key];
    }),

  updateSettings: (patch) =>
    get().apply(
      (draft) => {
        Object.assign(draft.settings, patch);
      },
      { coalesce: "settings" },
    ),

  rename: (name) =>
    get().apply(
      (draft) => {
        draft.name = name;
      },
      { coalesce: "name" },
    ),
}));

// --- Kendali player (di luar state supaya tidak memicu render) ---

let player: PlayerRef | null = null;

export function registerPlayer(ref: PlayerRef | null) {
  player = ref;
}

export function seekToFrame(frame: number) {
  const { project } = useEditor.getState();
  if (!project) return;
  const target = clamp(Math.round(frame), 0, durationInFrames(project) - 1);
  player?.seekTo(target);
  useEditor.getState().setFrame(target);
}

export function seekToMs(value: number) {
  const { project } = useEditor.getState();
  if (project) seekToFrame(msToFrame(value, project.settings.fps));
}

export function togglePlay() {
  if (!player) return;
  if (player.isPlaying()) {
    player.pause();
    return;
  }
  const { project, frame } = useEditor.getState();
  // Di ujung video, putar lagi dari awal.
  if (project && frame >= durationInFrames(project) - 1) player.seekTo(0);
  player.play();
}

export function pausePlayer() {
  player?.pause();
}
