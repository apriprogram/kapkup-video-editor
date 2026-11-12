"use client";

import * as React from "react";
import { transformAt } from "@/lib/project/animate";
import { frameToMs, isVisual, itemEnd, type Project } from "@/lib/project/schema";
import { findItem } from "@/lib/timeline/ops";
import { clamp } from "@/lib/utils";
import { pausePlayer, useEditor } from "@/store/editor";

/**
 * Lapisan di atas player untuk memilih, menggeser, dan mengubah ukuran elemen
 * langsung di gambar. Posisi elemen dibaca dari DOM komposisi (atribut
 * `data-kapkup-item`), jadi kotak seleksi selalu mengikuti apa yang tampil.
 */

type Box = { left: number; top: number; width: number; height: number };

/** Kotak isi klip di layar. Untuk media "muat utuh", area kosong di sekelilingnya tidak dihitung. */
function contentBox(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  const aspect = Number(element.dataset.aspect);
  if (element.dataset.fit !== "contain" || !aspect || rect.height === 0) {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  if (aspect > rect.width / rect.height) {
    const height = rect.width / aspect;
    return { left: rect.left, top: rect.top + (rect.height - height) / 2, width: rect.width, height };
  }
  const width = rect.height * aspect;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top, width, height: rect.height };
}

function contains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function elementOf(stage: HTMLElement, id: string): HTMLElement | null {
  return stage.querySelector<HTMLElement>(`[data-kapkup-item="${CSS.escape(id)}"]`);
}

/** Elemen teratas yang sedang tampil di bawah kursor. */
function hitTest(stage: HTMLElement, project: Project, atMs: number, x: number, y: number): string | null {
  for (const track of project.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (!isVisual(item) || atMs < item.startMs || atMs >= itemEnd(item)) continue;
      const element = elementOf(stage, item.id);
      if (element && contains(contentBox(element), x, y)) return item.id;
    }
  }
  return null;
}

const HANDLES = [
  { key: "nw", className: "-top-1.5 -left-1.5 cursor-nwse-resize" },
  { key: "ne", className: "-top-1.5 -right-1.5 cursor-nesw-resize" },
  { key: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
  { key: "se", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
] as const;

export type AlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom";

/** Merapatkan isi klip ke tepi atau tengah kanvas, berdasarkan posisinya yang sedang tampil di player. */
export function alignItem(id: string, mode: AlignMode) {
  const state = useEditor.getState();
  const root = document.querySelector<HTMLElement>("[data-kapkup-root]");
  const element = root?.querySelector<HTMLElement>(`[data-kapkup-item="${CSS.escape(id)}"]`);
  const found = state.project && findItem(state.project, id);
  if (!state.project || !root || !element || !found || !isVisual(found.item)) return;
  const canvas = root.getBoundingClientRect();
  const box = contentBox(element);
  const scale = canvas.width / state.project.settings.width || 1;
  const item = found.item;
  const local = clamp(frameToMs(state.frame, state.project.settings.fps) - item.startMs, 0, item.durationMs);
  const transform = transformAt(item, local);
  const dx =
    mode === "left"
      ? canvas.left - box.left
      : mode === "right"
        ? canvas.right - (box.left + box.width)
        : canvas.left + canvas.width / 2 - (box.left + box.width / 2);
  const dy =
    mode === "top"
      ? canvas.top - box.top
      : mode === "bottom"
        ? canvas.bottom - (box.top + box.height)
        : canvas.top + canvas.height / 2 - (box.top + box.height / 2);
  if (mode === "left" || mode === "right" || mode === "center-x") {
    state.setTransform(id, { x: Math.round(transform.x + dx / scale) });
  } else {
    state.setTransform(id, { y: Math.round(transform.y + dy / scale) });
  }
}

/** Tampilan kanvas di player: perbesaran dan geseran (piksel layar). */
export type StageView = { zoom: number; x: number; y: number };

export function StageOverlay({
  stageRef,
  view,
  onViewChange,
  panMode,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  view: StageView;
  onViewChange: (view: StageView) => void;
  /** Mode tangan: menyeret menggeser kanvas, bukan elemen. */
  panMode: boolean;
}) {
  const project = useEditor((state) => state.project);
  const selectedId = useEditor((state) => (state.selectedIds.length === 1 ? state.selectedIds[0] : null));
  const frame = useEditor((state) => state.frame);
  const [box, setBox] = React.useState<Box | null>(null);

  const measure = React.useCallback((): Box | null => {
    const stage = stageRef.current;
    if (!stage || !selectedId) return null;
    const element = elementOf(stage, selectedId);
    if (!element) return null;
    const rect = contentBox(element);
    const origin = stage.getBoundingClientRect();
    return { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height };
  }, [selectedId, stageRef]);

  // Player menggambar frame sedikit setelah state berubah, jadi kotaknya diukur beberapa kali.
  React.useEffect(() => {
    const update = () => {
      const next = measure();
      setBox((current) => (sameBox(current, next) ? current : next));
    };
    let raf = requestAnimationFrame(() => {
      update();
      raf = requestAnimationFrame(update);
    });
    const timer = setTimeout(update, 160);
    const stage = stageRef.current;
    const observer = new ResizeObserver(update);
    if (stage) observer.observe(stage);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [measure, project, frame, stageRef, view]);

  // Ctrl + roda mouse: perbesar/perkecil kanvas di sekitar kursor.
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef(view);
  React.useEffect(() => {
    viewRef.current = view;
  }, [view]);
  React.useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = viewRef.current;
      const rect = overlay.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      const zoom = clamp(current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.25, 8);
      const ratio = zoom / current.zoom;
      onViewChange({ zoom, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio });
    };
    overlay.addEventListener("wheel", onWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", onWheel);
  }, [onViewChange]);

  const startPan = (event: React.PointerEvent) => {
    const from = { x: event.clientX, y: event.clientY, view: viewRef.current };
    drag((move) => {
      onViewChange({ zoom: from.view.zoom, x: from.view.x + move.clientX - from.x, y: from.view.y + move.clientY - from.y });
    });
  };

  /** Skala layar terhadap kanvas, dan transform klip pada garis waktu saat ini. */
  const context = (id: string) => {
    const state = useEditor.getState();
    const stage = stageRef.current;
    const root = stage?.querySelector<HTMLElement>("[data-kapkup-root]");
    const found = state.project && findItem(state.project, id);
    if (!state.project || !root || !found || !isVisual(found.item)) return null;
    const item = found.item;
    const local = clamp(frameToMs(state.frame, state.project.settings.fps) - item.startMs, 0, item.durationMs);
    return {
      scale: root.getBoundingClientRect().width / state.project.settings.width || 1,
      transform: transformAt(item, local),
    };
  };

  const drag = (onMove: (move: PointerEvent) => void) => {
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const stage = stageRef.current;
    const state = useEditor.getState();
    if (!stage || !state.project) return;
    // Tombol tengah mouse atau mode tangan: geser kanvas.
    if (event.button === 1 || (event.button === 0 && panMode)) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (event.button !== 0) return;
    const atMs = frameToMs(state.frame, state.project.settings.fps);
    const origin = stage.getBoundingClientRect();
    // Elemen yang sudah terpilih tetap dipegang walau ada elemen lain di atasnya.
    const keep =
      selectedId && box && contains(box, event.clientX - origin.left, event.clientY - origin.top) ? selectedId : null;
    const id = keep ?? hitTest(stage, state.project, atMs, event.clientX, event.clientY);
    if (!id) {
      // Area kosong: lepas seleksi, dan menyeret menggeser kanvas.
      state.clearSelection();
      startPan(event);
      return;
    }
    if (id !== selectedId) state.select(id);
    const start = context(id);
    if (!start) return;
    pausePlayer();
    const from = { x: event.clientX, y: event.clientY };
    drag((move) => {
      useEditor.getState().setTransform(id, {
        x: Math.round(start.transform.x + (move.clientX - from.x) / start.scale),
        y: Math.round(start.transform.y + (move.clientY - from.y) / start.scale),
      });
    });
  };

  const onResizeDown = (event: React.PointerEvent) => {
    const stage = stageRef.current;
    if (event.button !== 0 || !stage || !selectedId || !box) return;
    event.stopPropagation();
    const start = context(selectedId);
    if (!start) return;
    pausePlayer();
    const origin = stage.getBoundingClientRect();
    const center = { x: origin.left + box.left + box.width / 2, y: origin.top + box.top + box.height / 2 };
    const distance = (x: number, y: number) => Math.hypot(x - center.x, y - center.y);
    const initial = distance(event.clientX, event.clientY) || 1;
    drag((move) => {
      const ratio = distance(move.clientX, move.clientY) / initial;
      useEditor.getState().setTransform(selectedId, {
        scale: clamp(Math.round(start.transform.scale * ratio * 1000) / 1000, 0.05, 20),
      });
    });
  };

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 touch-none ${panMode ? "cursor-grab active:cursor-grabbing" : ""}`}
      onPointerDown={onPointerDown}
    >
      {box && !panMode && (
        <div className="absolute cursor-move border-2 border-primary" style={box}>
          {HANDLES.map((handle) => (
            <span
              key={handle.key}
              onPointerDown={onResizeDown}
              className={`absolute size-3 rounded-sm border border-primary bg-foreground ${handle.className}`}
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  );
}
