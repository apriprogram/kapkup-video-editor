import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 83450 ms -> "01:23.45" (atau "01:23" bila `short`). */
export function formatTime(ms: number, short = false): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  const base = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return short ? base : `${base}.${String(cs).padStart(2, "0")}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
