"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pembatas antarpanel yang bisa diseret.
 * `vertical` = garis tegak di antara panel kiri dan kanan (diseret mendatar).
 * `onDrag` menerima pergeseran sejak gerakan sebelumnya, dalam piksel.
 */
export function Splitter({
  orientation,
  label,
  onDrag,
  style,
}: {
  orientation: "vertical" | "horizontal";
  label: string;
  onDrag: (delta: number) => void;
  /** Mis. `gridArea` bila pembatas ditaruh di dalam grid. */
  style?: React.CSSProperties;
}) {
  const vertical = orientation === "vertical";
  const [dragging, setDragging] = React.useState(false);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    let last = vertical ? event.clientX : event.clientY;
    setDragging(true);
    const onMove = (move: PointerEvent) => {
      const current = vertical ? move.clientX : move.clientY;
      if (current !== last) onDrag(current - last);
      last = current;
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label={label}
      title={`${label} (seret, atau tombol panah)`}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;
        const back = vertical ? "ArrowLeft" : "ArrowUp";
        const forward = vertical ? "ArrowRight" : "ArrowDown";
        if (event.key === back) {
          event.preventDefault();
          onDrag(-step);
        } else if (event.key === forward) {
          event.preventDefault();
          onDrag(step);
        }
      }}
      style={style}
      className={cn(
        "group relative z-10 shrink-0 touch-none focus-visible:outline-none",
        vertical ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
      )}
    >
      <span
        className={cn(
          "absolute rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70",
          dragging && "opacity-100",
          vertical ? "inset-y-2 left-1/2 w-0.5 -translate-x-1/2" : "inset-x-2 top-1/2 h-0.5 -translate-y-1/2",
        )}
      />
    </div>
  );
}
