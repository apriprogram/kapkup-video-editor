"use client";

import { Eye, EyeOff, Film, Music, Sparkles, Type, Volume2, VolumeX, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { rebaseKeyframes } from "@/lib/project/animate";
import { EFFECTS, TRANSITIONS, type TransitionId } from "@/lib/project/catalog";
import {
  contentDurationMs,
  frameToMs,
  isMedia,
  isVisual,
  type Asset,
  type Item,
  type Track,
  type TrackKind,
} from "@/lib/project/schema";
import {
  MIN_ITEM_MS,
  findItem,
  maxDurationMs,
  neighbors,
  resolveStart,
  shiftItems,
  snapPoints,
  snapValue,
  speedOf,
} from "@/lib/timeline/ops";
import { clamp, cn, formatTime } from "@/lib/utils";
import { pausePlayer, seekToMs, useEditor } from "@/store/editor";
import { ASSET_DRAG_TYPE, FX_DRAG_TYPE, TRANSITION_DRAG_TYPE, type FxDragPayload } from "./drag";
import { TransitionPopover } from "./TransitionPopover";

export const TIMELINE_HEADER_WIDTH = 152;
const RULER_HEIGHT = 30;
// Track teks, caption, dan efek dibuat ramping; video dan audio lebih tinggi karena berisi gambar/gelombang.
const TRACK_HEIGHT: Record<TrackKind, number> = { text: 28, fx: 28, video: 64, audio: 52 };
/** Jarak klip dari tepi atas dan bawah track. */
const CLIP_INSET: Record<TrackKind, number> = { text: 4, fx: 4, video: 5, audio: 5 };

/** Klip yang punya titik mulai di dalam sumbernya (`inMs`). */
function hasSourceOffset(item: Item): item is Extract<Item, { inMs: number }> {
  return item.type === "video" || item.type === "audio" || item.type === "captions";
}

function itemLabel(item: Item, asset: Asset | undefined): string {
  if (item.type === "captions") return `Caption · ${item.words.length} kata`;
  if (item.type === "text") return item.text.replace(/\s+/g, " ");
  if (item.type === "effect") return EFFECTS.find((entry) => entry.id === item.effect)?.label ?? item.effect;
  if (item.type === "adjustment") return "Penyesuaian";
  return asset?.name ?? "Media hilang";
}
const SNAP_PX = 8;
const RULER_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

// --- Gelombang audio ---

type Peaks = { perSecond: number; peaks: number[] };
const peaksCache = new Map<string, Promise<Peaks | null>>();

function loadPeaks(url: string): Promise<Peaks | null> {
  let promise = peaksCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((response) => (response.ok ? (response.json() as Promise<Peaks>) : null))
      .catch(() => null);
    peaksCache.set(url, promise);
  }
  return promise;
}

function Waveform({ url, inMs, sourceMs }: { url: string; inMs: number; sourceMs: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [data, setData] = React.useState<Peaks | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void loadPeaks(url).then((peaks) => !cancelled && setData(peaks));
    return () => {
      cancelled = true;
    };
  }, [url]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    // Suara pelan tetap terlihat: tinggi batang dihitung terhadap bagian paling keras di file.
    let loudest = 0.05;
    for (const peak of data.peaks) if (peak > loudest) loudest = peak;
    const draw = () => {
      const cssWidth = Math.max(1, Math.round(canvas.clientWidth));
      const cssHeight = Math.max(1, Math.round(canvas.clientHeight));
      const ratio = Math.min(2, window.devicePixelRatio || 1, 8192 / cssWidth);
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(canvas).color;
      // Batang 2px berjarak 1px, simetris terhadap garis tengah.
      const pitch = 3 * ratio;
      const barWidth = 2 * ratio;
      const bars = Math.max(1, Math.floor(width / pitch));
      const first = (inMs / 1000) * data.perSecond;
      const span = (sourceMs / 1000) * data.perSecond;
      for (let bar = 0; bar < bars; bar++) {
        const from = Math.floor(first + (bar / bars) * span);
        const to = Math.max(from + 1, Math.floor(first + ((bar + 1) / bars) * span));
        let peak = 0;
        for (let i = from; i < to && i < data.peaks.length; i++) peak = Math.max(peak, data.peaks[i] ?? 0);
        const size = Math.max(1.5 * ratio, Math.min(1, peak / loudest) * height);
        context.fillRect(bar * pitch, (height - size) / 2, barWidth, size);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [data, inMs, sourceMs]);

  // Gelombang menempati bagian bawah klip; baris atas dibiarkan kosong untuk nama klip.
  return (
    <div className="pointer-events-none absolute inset-x-2.5 top-5 bottom-1" aria-hidden>
      <canvas ref={canvasRef} className="size-full text-item-foreground/85" />
    </div>
  );
}

// --- Klip ---

type DragMode = "move" | "trim-start" | "trim-end";

function startItemDrag(event: React.PointerEvent, itemId: string, mode: DragMode) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const store = useEditor.getState();
  const project = store.project;
  const found = project && findItem(project, itemId);
  if (!project || !found) return;

  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  if (additive || !store.selectedIds.includes(itemId)) store.select(itemId, additive);

  const original = found.item;
  const origin = {
    x: event.clientX,
    y: event.clientY,
    start: original.startMs,
    duration: original.durationMs,
    inMs: hasSourceOffset(original) ? original.inMs : 0,
    // Keyframe dihitung ulang dari keadaan awal seret, supaya memotong lalu
    // mengembalikan dalam satu seretan tidak menghilangkan animasi.
    animation: isVisual(original) ? { transform: original.transform, keyframes: original.keyframes } : null,
  };
  const hasSource = hasSourceOffset(original);
  const pps = store.pxPerSec;
  const playhead = frameToMs(store.frame, project.settings.fps);
  // Beberapa klip terpilih dan salah satunya diseret: semuanya ikut bergeser bersama.
  const selectedNow = useEditor.getState().selectedIds;
  const group =
    mode === "move" && selectedNow.length > 1 && selectedNow.includes(itemId)
      ? new Map(
          selectedNow.flatMap((id) => {
            const member = findItem(project, id);
            return member ? [[id, member.item.startMs] as [string, number]] : [];
          }),
        )
      : null;
  const points = store.snap ? snapPoints(project, group ? [...group.keys()] : [itemId], [playhead]) : [];
  const threshold = (SNAP_PX / pps) * 1000;
  const snapTo = (value: number) => (points.length ? snapValue(value, points, threshold) : value);
  let began = false;

  const onMove = (move: PointerEvent) => {
    const dx = move.clientX - origin.x;
    if (!began) {
      if (Math.abs(dx) < 3 && Math.abs(move.clientY - origin.y) < 3) return;
      began = true;
      useEditor.getState().beginGesture();
    }
    const deltaMs = (dx / pps) * 1000;

    if (mode === "move") {
      let desired = origin.start + deltaMs;
      const byStart = snapTo(desired);
      desired = byStart !== desired ? byStart : snapTo(desired + origin.duration) - origin.duration;
      if (group) {
        const delta = desired - origin.start;
        useEditor.getState().apply(
          (draft) => {
            shiftItems(draft, group, delta);
          },
          { history: false },
        );
        return;
      }
      const lane = document
        .elementsFromPoint(move.clientX, move.clientY)
        .find((node): node is HTMLElement => node instanceof HTMLElement && Boolean(node.dataset.trackId));
      const targetId = lane?.dataset.trackId;
      useEditor.getState().apply(
        (draft) => {
          const current = findItem(draft, itemId);
          if (!current) return;
          let target = current.track;
          if (targetId && targetId !== current.track.id) {
            const other = draft.tracks.find((track) => track.id === targetId);
            if (other && other.kind === current.track.kind) target = other;
          }
          const startMs = resolveStart(target, desired, current.item.durationMs, itemId);
          if (target === current.track) {
            current.item.startMs = startMs;
          } else {
            current.track.items = current.track.items.filter((candidate) => candidate.id !== itemId);
            target.items.push({ ...current.item, startMs });
          }
        },
        { history: false },
      );
      return;
    }

    useEditor.getState().apply(
      (draft) => {
        const current = findItem(draft, itemId);
        if (!current) return;
        const { item, track } = current;
        const speed = speedOf(item);
        const end = origin.start + origin.duration;
        if (mode === "trim-start") {
          const { prevEnd } = neighbors(track, item);
          const minStart = Math.max(prevEnd, hasSource ? origin.start - origin.inMs / speed : 0);
          const startMs = Math.round(clamp(snapTo(origin.start + deltaMs), minStart, end - MIN_ITEM_MS));
          item.startMs = startMs;
          item.durationMs = end - startMs;
          if (hasSourceOffset(item)) {
            item.inMs = Math.max(0, Math.round(origin.inMs + (startMs - origin.start) * speed));
          }
          if (isVisual(item) && origin.animation) {
            item.keyframes = rebaseKeyframes(origin.animation, startMs - origin.start, item.durationMs);
          }
        } else {
          const { nextStart } = neighbors(track, item);
          const asset = isMedia(item) ? draft.assets.find((a) => a.id === item.assetId) : undefined;
          const maxEnd = Math.min(nextStart, origin.start + maxDurationMs(item, asset));
          const newEnd = clamp(snapTo(end + deltaMs), origin.start + MIN_ITEM_MS, maxEnd);
          item.durationMs = Math.round(newEnd - origin.start);
          if (isVisual(item) && origin.animation) {
            item.keyframes = rebaseKeyframes(origin.animation, 0, item.durationMs);
          }
        }
        item.fadeInMs = Math.min(item.fadeInMs, item.durationMs);
        item.fadeOutMs = Math.min(item.fadeOutMs, item.durationMs - item.fadeInMs);
        if ((item.type === "video" || item.type === "image") && item.transitionIn) {
          item.transitionIn.durationMs = Math.min(item.transitionIn.durationMs, item.durationMs);
        }
      },
      { history: false },
    );
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (began) useEditor.getState().endGesture();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** Bagian klip yang lamanya bisa diseret di timeline. */
type DurationTarget = "transition" | "animationIn" | "animationOut";

function durationHolder(item: Item, target: DurationTarget): { durationMs: number } | null {
  if (target === "transition") return item.type === "video" || item.type === "image" ? item.transitionIn : null;
  if (item.type !== "video" && item.type !== "image" && item.type !== "text") return null;
  return target === "animationIn" ? item.animationIn : item.animationOut;
}

/**
 * Menyeret ujung daerah transisi atau animasi = mengubah lamanya (kelipatan 0,05 detik).
 * Animasi keluar dihitung dari akhir klip, jadi menyeret ke kiri memperpanjangnya.
 */
function startDurationDrag(event: React.PointerEvent, itemId: string, target: DurationTarget) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const store = useEditor.getState();
  const found = store.project && findItem(store.project, itemId);
  const holder = found && durationHolder(found.item, target);
  if (!holder) return;
  const origin = { x: event.clientX, durationMs: holder.durationMs };
  const direction = target === "animationOut" ? -1 : 1;
  const pps = store.pxPerSec;
  let began = false;

  const onMove = (move: PointerEvent) => {
    const dx = move.clientX - origin.x;
    if (!began) {
      if (Math.abs(dx) < 2) return;
      began = true;
      useEditor.getState().beginGesture();
    }
    useEditor.getState().apply(
      (draft) => {
        const current = findItem(draft, itemId)?.item;
        const currentHolder = current && durationHolder(current, target);
        if (!current || !currentHolder) return;
        const max = Math.max(100, Math.min(5000, current.durationMs));
        const wanted = Math.round((origin.durationMs + ((dx * direction) / pps) * 1000) / 50) * 50;
        currentHolder.durationMs = clamp(wanted, 100, max);
      },
      { history: false },
    );
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (began) useEditor.getState().endGesture();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** Klik keyframe = lompat ke waktunya; seret = menggeser waktunya di antara keyframe tetangga. */
function startKeyframeDrag(event: React.PointerEvent, itemId: string, atMs: number) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const store = useEditor.getState();
  const project = store.project;
  const found = project && findItem(project, itemId);
  if (!project || !found || !isVisual(found.item)) return;
  const index = found.item.keyframes.findIndex((keyframe) => keyframe.atMs === atMs);
  if (index < 0) return;
  if (!store.selectedIds.includes(itemId)) store.select(itemId);
  const startMs = found.item.startMs;
  const origin = event.clientX;
  const pps = store.pxPerSec;
  const frameMs = Math.ceil(1000 / project.settings.fps);
  let began = false;

  const onMove = (move: PointerEvent) => {
    const dx = move.clientX - origin;
    if (!began) {
      if (Math.abs(dx) < 3) return;
      began = true;
      useEditor.getState().beginGesture();
    }
    useEditor.getState().apply(
      (draft) => {
        const current = findItem(draft, itemId)?.item;
        if (!current || !isVisual(current) || !current.keyframes[index]) return;
        const previous = current.keyframes[index - 1];
        const next = current.keyframes[index + 1];
        const min = previous ? previous.atMs + frameMs : 0;
        const max = next ? next.atMs - frameMs : current.durationMs;
        if (max >= min) current.keyframes[index].atMs = Math.round(clamp(atMs + (dx / pps) * 1000, min, max));
      },
      { history: false },
    );
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (began) {
      useEditor.getState().endGesture();
    } else {
      pausePlayer();
      seekToMs(startMs + atMs);
    }
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

// Klip audio tembus pandang dengan tepi terang supaya gelombang putihnya menonjol.
const CLIP_COLOR: Record<TrackKind, string> = {
  video: "bg-item-video ring-1 ring-item-foreground/25",
  audio: "bg-item-audio/45 ring-1 ring-item-audio",
  text: "bg-item-text ring-1 ring-item-foreground/25",
  fx: "bg-item-fx ring-1 ring-item-foreground/25",
};

/** Jalur track diberi rona tipis sewarna klipnya supaya jenis track langsung terbaca. */
const LANE_TINT: Record<TrackKind, string> = {
  video: "bg-item-video/8",
  audio: "bg-item-audio/8",
  text: "bg-item-text/8",
  fx: "bg-item-fx/8",
};

const KIND_TEXT: Record<TrackKind, string> = {
  video: "text-item-video",
  audio: "text-item-audio",
  text: "text-item-text",
  fx: "text-item-fx",
};

/** Pegangan potong di ujung klip: batang kecil seperti pada gambar acuan. */
function TrimHandle({ side, itemId, selected, visible }: { side: "start" | "end"; itemId: string; selected: boolean; visible: boolean }) {
  return (
    <span
      className={cn(
        "absolute inset-y-0 flex w-2.5 cursor-ew-resize items-center justify-center",
        side === "start" ? "left-0" : "right-0",
      )}
      onPointerDown={(event) => startItemDrag(event, itemId, side === "start" ? "trim-start" : "trim-end")}
      aria-hidden
    >
      {visible && (
        <span
          className={cn(
            "h-2/5 min-h-2.5 w-[3px] rounded-full transition-colors",
            selected ? "bg-item-foreground" : "bg-item-foreground/45",
          )}
        />
      )}
    </span>
  );
}

/** Deretan frame kecil di sepanjang klip video, mengikuti bagian sumber yang dipakai. */
function Filmstrip({
  projectId,
  item,
  asset,
  width,
  pps,
}: {
  projectId: string;
  item: Extract<Item, { type: "video" }>;
  asset: Asset;
  width: number;
  pps: number;
}) {
  const height = TRACK_HEIGHT.video - CLIP_INSET.video * 2;
  const tileWidth = Math.max(24, Math.round(height * (asset.height > 0 ? asset.width / asset.height : 16 / 9)));
  const count = Math.min(120, Math.ceil(width / tileWidth));
  // Waktu dibulatkan supaya frame yang sama dipakai ulang saat zoom berubah.
  const step = asset.durationMs > 20000 ? 1000 : 500;
  const last = Math.max(0, asset.durationMs - 100);
  return (
    <div className="pointer-events-none absolute inset-0 flex opacity-90" aria-hidden>
      {Array.from({ length: count }, (_, index) => {
        const localMs = (((index + 0.5) * tileWidth) / pps) * 1000;
        const sourceMs = Math.round(clamp(item.inMs + localMs * item.speed, 0, last) / step) * step;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- frame lokal yang dibuat saat diminta
          <img
            key={index}
            loading="lazy"
            decoding="async"
            draggable={false}
            alt=""
            src={`/api/projects/${projectId}/frame?asset=${asset.id}&ms=${sourceMs}`}
            style={{ width: tileWidth }}
            className="h-full shrink-0 object-cover"
          />
        );
      })}
    </div>
  );
}

/** Sampul project: frame di garis waktu dirender sebagai gambar sampul (cover.png). */
function CoverButton({ projectId }: { projectId: string }) {
  const coverMs = useEditor((state) => state.project?.coverMs ?? null);
  const [busy, setBusy] = React.useState(false);
  const [version, setVersion] = React.useState(0);

  const make = async () => {
    if (busy) return;
    const state = useEditor.getState();
    if (!state.project) return;
    const ms = frameToMs(state.frame, state.project.settings.fps);
    setBusy(true);
    try {
      // Sampul dirender dari file project, jadi perubahan terakhir harus sudah tersimpan.
      for (let i = 0; i < 40 && (useEditor.getState().dirty || useEditor.getState().saveState === "saving"); i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const response = await fetch(`/api/projects/${projectId}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ms }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gagal membuat sampul");
      useEditor.getState().setCover(ms);
      setVersion(Date.now());
      toast.success("Sampul diperbarui", { description: `Diambil dari ${formatTime(ms)}.` });
    } catch (cause) {
      toast.error("Gagal membuat sampul", { description: (cause as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={make}
      disabled={busy}
      aria-label="Sampul: pakai frame di garis waktu sebagai sampul project"
      title="Sampul: pakai frame di garis waktu sebagai sampul project"
      className="relative flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded bg-muted text-[8px] leading-tight text-muted-foreground hover:ring-1 hover:ring-primary disabled:cursor-wait"
    >
      {coverMs !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- sampul lokal dari folder project
        <img src={`/api/projects/${projectId}/files/cover.png?v=${version}`} alt="" className="size-full object-cover" />
      ) : (
        "Sampul"
      )}
      {busy && <span className="absolute inset-0 animate-pulse bg-primary/40" aria-hidden />}
    </button>
  );
}

const TimelineItem = React.memo(function TimelineItem({
  item,
  kind,
  asset,
  pps,
  selected,
  projectId,
  transitionOpen,
  onEditTransition,
}: {
  item: Item;
  kind: TrackKind;
  asset: Asset | undefined;
  pps: number;
  selected: boolean;
  projectId: string;
  /** Kotak pengatur transisi klip ini sedang terbuka. */
  transitionOpen: boolean;
  onEditTransition: (itemId: string, badge: DOMRect) => void;
}) {
  const left = (item.startMs / 1000) * pps;
  const width = Math.max(2, (item.durationMs / 1000) * pps);
  const label = itemLabel(item, asset);
  const files = `/api/projects/${projectId}/files`;
  const thumbnail = item.type === "video" || item.type === "image" ? asset?.thumbnail : null;
  const transition = item.type === "video" || item.type === "image" ? item.transitionIn : null;
  const keyframes = isVisual(item) ? item.keyframes : [];
  const acceptsTransition = item.type === "video" || item.type === "image";
  /** Klip di track ramping (teks, caption, efek): namanya ditaruh di tengah. */
  const compact = kind === "text" || kind === "fx";
  const animated = item.type === "video" || item.type === "image" || item.type === "text" ? item : null;
  const animationIn = animated?.animationIn ?? null;
  const animationOut = animated?.animationOut ?? null;
  const inWidth = animationIn ? Math.min(width, (animationIn.durationMs / 1000) * pps) : 0;
  const outWidth = animationOut ? Math.min(width, (animationOut.durationMs / 1000) * pps) : 0;
  const transitionLabel = transition ? (TRANSITIONS.find((entry) => entry.id === transition.type)?.label ?? transition.type) : "";
  const transitionWidth = transition ? Math.min(width, Math.max(18, (transition.durationMs / 1000) * pps)) : 0;

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      data-item-id={item.id}
      aria-label={`${label}, mulai ${formatTime(item.startMs)}, durasi ${formatTime(item.durationMs)}`}
      aria-pressed={selected}
      onPointerDown={(event) => startItemDrag(event, item.id, "move")}
      onKeyDown={(event) => {
        if (event.key === "Enter") useEditor.getState().select(item.id, event.shiftKey);
      }}
      onDragOver={(event) => {
        if (acceptsTransition && event.dataTransfer.types.includes(TRANSITION_DRAG_TYPE)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!acceptsTransition || !event.dataTransfer.types.includes(TRANSITION_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        const type = event.dataTransfer.getData(TRANSITION_DRAG_TYPE) as TransitionId;
        useEditor.getState().setTransition(item.id, { type, durationMs: 500 });
        useEditor.getState().select(item.id);
      }}
      className={cn(
        "absolute cursor-grab touch-none overflow-hidden bg-linear-to-b from-item-foreground/15 to-item-foreground/0 text-item-foreground ring-inset select-none active:cursor-grabbing",
        compact ? "rounded-md" : "rounded-lg",
        CLIP_COLOR[kind],
        selected && "z-10 ring-2 ring-foreground",
        isMedia(item) && !asset && "bg-danger/60",
      )}
      style={{ left, width, top: CLIP_INSET[kind], bottom: CLIP_INSET[kind] }}
    >
      {item.type === "video" && asset && <Filmstrip projectId={projectId} item={item} asset={asset} width={width} pps={pps} />}
      {thumbnail && item.type === "image" && (
        <div
          className="absolute inset-0 opacity-80"
          style={{
            backgroundImage: `url("${files}/${thumbnail}")`,
            backgroundSize: "auto 100%",
            backgroundRepeat: "repeat-x",
          }}
          aria-hidden
        />
      )}
      {item.type === "audio" && asset?.peaks && (
        <Waveform url={`${files}/${asset.peaks}`} inMs={item.inMs} sourceMs={item.durationMs * item.speed} />
      )}
      {transition && (
        // Bayangan yang memudar + garis putih di bawah = lamanya transisi dari klip sebelumnya.
        <span
          className="pointer-events-none absolute inset-y-0 left-0 bg-linear-to-r from-background/80 to-background/0"
          style={{ width: transitionWidth }}
          aria-hidden
        >
          <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-r-full bg-foreground" />
          {transitionWidth > 84 && (
            <span className="absolute bottom-1.5 left-3 text-[10px] leading-3 font-medium whitespace-nowrap text-foreground">
              {transitionLabel} · {(transition.durationMs / 1000).toFixed(1)} dtk
            </span>
          )}
        </span>
      )}
      <span
        className={cn(
          "pointer-events-none absolute left-3 max-w-[calc(100%-24px)] truncate text-[11px] leading-4 font-medium",
          compact ? "top-1/2 -translate-y-1/2" : "top-1",
          thumbnail && "rounded bg-background/70 px-1 text-foreground",
        )}
      >
        {label}
        {item.type === "video" && item.speed !== 1 ? ` · ${item.speed}x` : ""}
      </span>
      {transition && width > 44 && (
        <span
          className="absolute inset-y-0 flex w-2.5 -translate-x-1/2 cursor-ew-resize items-center justify-center"
          style={{ left: clamp(transitionWidth, 16, width - 16) }}
          title="Seret untuk mengubah durasi transisi"
          onPointerDown={(event) => startDurationDrag(event, item.id, "transition")}
          aria-hidden
        >
          <span className="h-3/5 w-0.5 rounded-full bg-foreground" />
        </span>
      )}
      {/* Animasi masuk/keluar: garis di tepi atas sepanjang durasinya; bulatannya bisa diseret saat klip dipilih. */}
      {animationIn && (
        <span className="pointer-events-none absolute top-0 left-0 h-[3px] rounded-br-full bg-primary" style={{ width: inWidth }} aria-hidden />
      )}
      {animationOut && (
        <span className="pointer-events-none absolute top-0 right-0 h-[3px] rounded-bl-full bg-primary" style={{ width: outWidth }} aria-hidden />
      )}
      {selected && animationIn && width > 60 && (
        <span
          className="absolute top-0 flex h-3 w-3 -translate-x-1/2 cursor-ew-resize items-start justify-center"
          style={{ left: clamp(inWidth, 14, width - 14) }}
          title={`Animasi masuk ${(animationIn.durationMs / 1000).toFixed(2)} dtk. Seret untuk mengubah durasinya`}
          onPointerDown={(event) => startDurationDrag(event, item.id, "animationIn")}
          aria-hidden
        >
          <span className="size-2 rounded-full bg-primary ring-1 ring-background" />
        </span>
      )}
      {selected && animationOut && width > 60 && (
        <span
          className="absolute top-0 flex h-3 w-3 -translate-x-1/2 cursor-ew-resize items-start justify-center"
          style={{ left: clamp(width - outWidth, 14, width - 14) }}
          title={`Animasi keluar ${(animationOut.durationMs / 1000).toFixed(2)} dtk. Seret untuk mengubah durasinya`}
          onPointerDown={(event) => startDurationDrag(event, item.id, "animationOut")}
          aria-hidden
        >
          <span className="size-2 rounded-full bg-primary ring-1 ring-background" />
        </span>
      )}
      {keyframes.map((keyframe) => (
        // Area sentuh 12px; belah ketupatnya sendiri 8px.
        <span
          key={keyframe.atMs}
          className="absolute bottom-0 flex h-3.5 w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center"
          style={{ left: clamp((keyframe.atMs / 1000) * pps, 5, Math.max(5, width - 5)) }}
          title={`Keyframe ${formatTime(keyframe.atMs)}. Klik untuk lompat ke sini, seret untuk menggeser waktunya`}
          onPointerDown={(event) => startKeyframeDrag(event, item.id, keyframe.atMs)}
          aria-hidden
        >
          <span className="size-2 rotate-45 border border-background bg-playhead" />
        </span>
      ))}
      <TrimHandle side="start" itemId={item.id} selected={selected} visible={width > 34} />
      <TrimHandle side="end" itemId={item.id} selected={selected} visible={width > 34} />
    </div>
    {transition && (
      // Lencana di sambungan dua klip; di luar klip supaya tidak terpotong tepinya.
      <button
        type="button"
        data-transition-badge
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => onEditTransition(item.id, event.currentTarget.getBoundingClientRect())}
        aria-expanded={transitionOpen}
        aria-label={`Transisi ${transitionLabel}, ${(transition.durationMs / 1000).toFixed(1)} detik. Klik untuk mengatur durasi atau menghapusnya`}
        title={`Transisi: ${transitionLabel} · ${(transition.durationMs / 1000).toFixed(1)} dtk. Klik untuk mengatur atau menghapus`}
        className={cn(
          "absolute top-1/2 z-10 flex size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px] shadow-md transition-transform hover:scale-115",
          transitionOpen ? "bg-primary text-primary-foreground ring-2 ring-foreground" : "bg-foreground text-background ring-1 ring-background/70",
        )}
        style={{ left: Math.max(11, left) }}
      >
        {/* Dua segitiga berhadapan: tanda transisi yang lazim di editor video. */}
        <svg viewBox="0 0 12 12" className="size-3" fill="currentColor" aria-hidden>
          <path d="M1 2.6v6.8L5.6 6zM11 2.6v6.8L6.4 6z" />
        </svg>
      </button>
    )}
    </>
  );
});

// --- Garis waktu (playhead) ---

function Playhead({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const frame = useEditor((state) => state.frame);
  const fps = useEditor((state) => state.project?.settings.fps ?? 30);
  const pps = useEditor((state) => state.pxPerSec);
  const playing = useEditor((state) => state.playing);
  const x = (frame / fps) * pps;

  // Saat memutar, gulir timeline supaya garis waktu tetap terlihat.
  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!playing || !scroller) return;
    const visible = scroller.clientWidth - TIMELINE_HEADER_WIDTH;
    if (x < scroller.scrollLeft || x > scroller.scrollLeft + visible - 24) {
      scroller.scrollLeft = Math.max(0, x - 48);
    }
  }, [x, playing, scrollRef]);

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-playhead"
      style={{ left: TIMELINE_HEADER_WIDTH + x }}
      aria-hidden
    />
  );
}

/** Kepala garis waktu di penggaris: label waktu kuning dengan penunjuk ke garisnya. */
function PlayheadLabel() {
  const frame = useEditor((state) => state.frame);
  const fps = useEditor((state) => state.project?.settings.fps ?? 30);
  const pps = useEditor((state) => state.pxPerSec);
  return (
    <div
      className="pointer-events-none absolute bottom-0 z-10 flex -translate-x-1/2 flex-col items-center"
      style={{ left: (frame / fps) * pps }}
      aria-hidden
    >
      <span className="rounded bg-playhead px-1 font-mono text-[10px] leading-4 font-semibold whitespace-nowrap text-background tabular-nums">
        {formatTime(frameToMs(frame, fps))}
      </span>
      <span className="h-0 w-0 border-x-4 border-t-[5px] border-x-transparent border-t-playhead" />
    </div>
  );
}

// --- Kepala track ---

const TRACK_ICON: Record<TrackKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  fx: Sparkles,
  video: Film,
  audio: Music,
};

function TrackHeader({ track, leading }: { track: Track; leading?: React.ReactNode }) {
  const { toggleTrack, removeTrack } = useEditor.getState();
  const Icon = TRACK_ICON[track.kind];
  const buttonClass =
    "flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5";
  return (
    <div
      className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-border bg-surface pr-1 pl-2"
      style={{ width: TIMELINE_HEADER_WIDTH }}
    >
      {leading ?? <Icon className={cn("size-3.5 shrink-0", KIND_TEXT[track.kind])} />}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={track.name}>
        {track.name || track.kind}
      </span>
      {track.kind !== "audio" && (
        <button
          type="button"
          className={cn(buttonClass, track.hidden && "text-warning")}
          aria-label={track.hidden ? `Tampilkan track ${track.name}` : `Sembunyikan track ${track.name}`}
          aria-pressed={track.hidden}
          title={track.hidden ? "Tampilkan" : "Sembunyikan"}
          onClick={() => toggleTrack(track.id, "hidden")}
        >
          {track.hidden ? <EyeOff /> : <Eye />}
        </button>
      )}
      {(track.kind === "video" || track.kind === "audio") && (
        <button
          type="button"
          className={cn(buttonClass, track.muted && "text-warning")}
          aria-label={track.muted ? `Bunyikan track ${track.name}` : `Bisukan track ${track.name}`}
          aria-pressed={track.muted}
          title={track.muted ? "Bunyikan" : "Bisukan"}
          onClick={() => toggleTrack(track.id, "muted")}
        >
          {track.muted ? <VolumeX /> : <Volume2 />}
        </button>
      )}
      {track.items.length === 0 && (
        <button
          type="button"
          className={buttonClass}
          aria-label={`Hapus track ${track.name}`}
          title="Hapus track kosong"
          onClick={() => removeTrack(track.id)}
        >
          <X />
        </button>
      )}
    </div>
  );
}

// --- Timeline ---

export function Timeline({ projectId }: { projectId: string }) {
  const project = useEditor((state) => state.project);
  const pps = useEditor((state) => state.pxPerSec);
  const selectedIds = useEditor((state) => state.selectedIds);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = React.useState(0);
  const [marquee, setMarquee] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Transisi yang sedang diatur: id-nya di store (supaya Delete menghapus transisinya,
  // bukan klipnya), letak lencananya di sini untuk menaruh kotak pengaturnya.
  const transitionEditId = useEditor((state) => state.transitionEditId);
  const [transitionAnchor, setTransitionAnchor] = React.useState<{ id: string; x: number; y: number } | null>(null);
  const editTransition = React.useCallback((itemId: string, badge: DOMRect) => {
    const store = useEditor.getState();
    if (store.transitionEditId === itemId) {
      store.editTransition(null);
      return;
    }
    setTransitionAnchor({ id: itemId, x: badge.left + badge.width / 2, y: badge.top });
    store.editTransition(itemId);
  }, []);

  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => setViewport(scroller.clientWidth));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Ctrl + roda mouse = zoom di sekitar kursor.
  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const state = useEditor.getState();
      const offset = event.clientX - scroller.getBoundingClientRect().left - TIMELINE_HEADER_WIDTH;
      const seconds = (scroller.scrollLeft + offset) / state.pxPerSec;
      state.setPxPerSec(state.pxPerSec * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
      const next = useEditor.getState().pxPerSec;
      requestAnimationFrame(() => {
        scroller.scrollLeft = Math.max(0, seconds * next - offset);
      });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  const xToMs = React.useCallback((clientX: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return 0;
    const x = clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft - TIMELINE_HEADER_WIDTH;
    return Math.max(0, (x / useEditor.getState().pxPerSec) * 1000);
  }, []);

  const scrub = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      pausePlayer();
      seekToMs(xToMs(event.clientX));
      const onMove = (move: PointerEvent) => seekToMs(xToMs(move.clientX));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [xToMs],
  );

  // Seret di area kosong = kotak seleksi; klik saja = pindahkan garis waktu.
  const startLaneDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let active = false;
    const onMove = (move: PointerEvent) => {
      if (!active && Math.abs(move.clientX - start.x) < 4 && Math.abs(move.clientY - start.y) < 4) return;
      active = true;
      const box = {
        left: Math.min(start.x, move.clientX),
        top: Math.min(start.y, move.clientY),
        width: Math.abs(move.clientX - start.x),
        height: Math.abs(move.clientY - start.y),
      };
      setMarquee(box);
      const hit = [...(scrollRef.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? [])]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left < box.left + box.width && rect.right > box.left && rect.top < box.top + box.height && rect.bottom > box.top
          );
        })
        .map((element) => element.dataset.itemId ?? "");
      useEditor.getState().selectMany(hit);
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setMarquee(null);
      if (!active) {
        useEditor.getState().clearSelection();
        pausePlayer();
        seekToMs(xToMs(up.clientX));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!project) return null;

  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const laneWidth = Math.max((contentDurationMs(project) / 1000 + 20) * pps, viewport - TIMELINE_HEADER_WIDTH);
  const step = RULER_STEPS.find((candidate) => candidate * pps >= 70) ?? 600;
  const tickCount = Math.ceil(laneWidth / pps / step);
  const empty = project.tracks.every((track) => track.items.length === 0);
  // Track video paling bawah adalah track utama; tombol sampul ditaruh di sana.
  const mainVideoId = [...project.tracks].reverse().find((track) => track.kind === "video")?.id;

  const acceptsAsset = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(ASSET_DRAG_TYPE) || event.dataTransfer.types.includes(FX_DRAG_TYPE);
  const dropAsset = (event: React.DragEvent, trackId?: string) => {
    if (event.dataTransfer.types.includes(TRANSITION_DRAG_TYPE)) {
      event.preventDefault();
      toast.info("Jatuhkan transisi tepat di atas klip video atau gambar");
      return;
    }
    if (!acceptsAsset(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = { trackId, startMs: xToMs(event.clientX) };
    const fx = event.dataTransfer.getData(FX_DRAG_TYPE);
    if (fx) {
      useEditor.getState().addFx(JSON.parse(fx) as FxDragPayload, target);
      return;
    }
    useEditor.getState().addAssetToTimeline(event.dataTransfer.getData(ASSET_DRAG_TYPE), target);
  };

  return (
    <div
      ref={scrollRef}
      data-timeline-scroll
      aria-label="Timeline"
      className="relative min-h-0 flex-1 overflow-auto select-none"
      // Kotak pengatur transisi menempel pada posisi layar lencananya; saat digulir, ditutup.
      onScroll={() => useEditor.getState().transitionEditId && useEditor.getState().editTransition(null)}
      onDragOver={(event) =>
        (acceptsAsset(event) || event.dataTransfer.types.includes(TRANSITION_DRAG_TYPE)) && event.preventDefault()
      }
      onDrop={(event) => dropAsset(event)}
    >
      <div className="relative min-h-full" style={{ width: TIMELINE_HEADER_WIDTH + laneWidth }}>
        {/* Penggaris waktu */}
        <div className="sticky top-0 z-30 flex bg-surface" style={{ height: RULER_HEIGHT }}>
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-b border-border bg-surface"
            style={{ width: TIMELINE_HEADER_WIDTH }}
          />
          <div
            className="relative cursor-pointer border-b border-border"
            style={{
              width: laneWidth,
              backgroundImage: "linear-gradient(to right, var(--input) 1px, transparent 1px)",
              backgroundSize: `${(step * pps) / 5}px 4px`,
              backgroundRepeat: "repeat-x",
              backgroundPosition: "left bottom",
            }}
            onPointerDown={scrub}
          >
            {Array.from({ length: tickCount + 1 }, (_, index) => (
              <span
                key={index}
                className="pointer-events-none absolute top-0 bottom-0 pt-1 pl-1.5 font-mono text-[10px] leading-4 text-muted-foreground tabular-nums"
                style={{ left: index * step * pps }}
              >
                <span className="absolute bottom-0 left-0 h-2.5 w-px bg-muted-foreground/70" />
                {step < 1 ? formatTime(index * step * 1000) : formatTime(index * step * 1000, true)}
              </span>
            ))}
            <PlayheadLabel />
          </div>
        </div>

        {/* Track */}
        {project.tracks.map((track) => (
          <div key={track.id} className="flex border-b border-border/60" style={{ height: TRACK_HEIGHT[track.kind] }}>
            <TrackHeader track={track} leading={track.id === mainVideoId ? <CoverButton projectId={projectId} /> : undefined} />
            <div
              data-track-id={track.id}
              className={cn("relative", LANE_TINT[track.kind], track.hidden && track.kind !== "audio" && "opacity-40")}
              style={{ width: laneWidth }}
              onPointerDown={startLaneDrag}
              onDragOver={(event) => acceptsAsset(event) && event.preventDefault()}
              onDrop={(event) => dropAsset(event, track.id)}
            >
              {track.items.map((item) => (
                <TimelineItem
                  key={item.id}
                  item={item}
                  kind={track.kind}
                  asset={isMedia(item) ? assets.get(item.assetId) : undefined}
                  pps={pps}
                  selected={selectedIds.includes(item.id)}
                  projectId={projectId}
                  transitionOpen={transitionEditId === item.id}
                  onEditTransition={editTransition}
                />
              ))}
            </div>
          </div>
        ))}

        {empty && (
          <p
            className="pointer-events-none sticky left-0 px-4 py-6 text-center text-xs text-muted-foreground"
            style={{ width: Math.max(0, viewport) }}
          >
            Timeline masih kosong. Seret media dari panel kiri ke sini, atau klik tombol + pada media.
          </p>
        )}

        <Playhead scrollRef={scrollRef} />
        {marquee && <div className="pointer-events-none fixed z-40 border border-primary bg-primary/15" style={marquee} aria-hidden />}
        {transitionAnchor && transitionEditId === transitionAnchor.id && (
          <TransitionPopover itemId={transitionAnchor.id} anchor={transitionAnchor} />
        )}
      </div>
    </div>
  );
}
