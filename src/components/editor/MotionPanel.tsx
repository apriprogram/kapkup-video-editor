"use client";

import { Diamond, RotateCcw, Trash2 } from "lucide-react";
import * as React from "react";
import { ease, keyframeIndexNear } from "@/lib/project/animate";
import { EASING_LABELS, MOTIONS, MOTION_CATEGORIES, buildMotion, type MotionId } from "@/lib/project/motion";
import { EASINGS, frameToMs, isVisual, type Easing, type VisualItem } from "@/lib/project/schema";
import { clamp, cn, formatTime } from "@/lib/utils";
import { pausePlayer, seekToMs, useEditor } from "@/store/editor";
import { Section } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

const EASING_OPTIONS = EASINGS.map((value) => ({ value, label: EASING_LABELS[value] }));
type MotionCategory = (typeof MOTION_CATEGORIES)[number]["id"];

/** Grafik kecil lengkung gerak: waktu mendatar, kemajuan tegak (garis putus = awal dan tujuan). */
function EasingCurve({ easing }: { easing: Easing }) {
  const width = 120;
  const height = 64;
  // Rentang tegak -0,35..1,35 supaya overshoot dan antisipasi ikut terlihat.
  const y = (value: number) => height - ((value + 0.35) / 1.7) * height;
  const points = Array.from({ length: 49 }, (_, index) => {
    const t = index / 48;
    return `${(t * width).toFixed(1)},${y(ease(easing, t)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-[120px] shrink-0 rounded-md bg-background text-primary"
      role="img"
      aria-label={`Grafik lengkung gerak: ${EASING_LABELS[easing]}`}
    >
      <line x1="0" x2={width} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="3 3" />
      <line x1="0" x2={width} y1={y(1)} y2={y(1)} className="stroke-border" strokeDasharray="3 3" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Gerak & keyframe sebuah klip: preset gerak sekali klik, daftar keyframe dengan
 * lengkung gerak masing-masing, dan grafik lengkung untuk segmen di garis waktu.
 */
export function MotionSection({ item }: { item: VisualItem }) {
  const canvas = useEditor((state) => state.project?.settings);
  const fps = canvas?.fps ?? 30;
  const frame = useEditor((state) => (item.keyframes.length > 0 ? state.frame : 0));
  const updateItem = useEditor((state) => state.updateItem);
  const [category, setCategory] = React.useState<MotionCategory>("kamera");
  const keyframes = item.keyframes;
  const localMs = clamp(Math.round(frameToMs(frame, fps) - item.startMs), 0, item.durationMs);
  const here = keyframeIndexNear(keyframes, localMs, (1000 / fps) * 0.6);
  // Segmen yang sedang berjalan di garis waktu: keyframe terakhir yang sudah dilewati.
  const active = keyframes.reduce((found, keyframe, index) => (keyframe.atMs <= localMs ? index : found), 0);

  const edit = (mutator: (target: VisualItem) => void, key?: string) =>
    updateItem(
      item.id,
      (target) => {
        if (isVisual(target)) mutator(target);
      },
      key,
    );

  const applyPreset = (id: MotionId) => {
    if (!canvas) return;
    // Bertolak dari posisi dasar klip (bukan dari keyframe lama), supaya preset bisa diganti-ganti.
    edit((target) => void (target.keyframes = buildMotion(id, target.transform, target.durationMs, canvas)));
  };

  return (
    <Section
      title="Gerak & keyframe"
      actions={
        <button
          type="button"
          aria-label="Hapus semua keyframe"
          title="Hapus semua keyframe"
          disabled={keyframes.length === 0}
          onClick={() => edit((target) => void (target.keyframes = []))}
          className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5"
        >
          <RotateCcw />
        </button>
      }
    >
      <div role="tablist" aria-label="Kelompok preset gerak" className="flex rounded-lg bg-background p-0.5">
        {MOTION_CATEGORIES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={category === option.id}
            onClick={() => setCategory(option.id)}
            className={cn(
              "h-6 flex-1 cursor-pointer rounded-md text-xs font-medium transition-colors",
              category === option.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {MOTIONS.filter((motion) => motion.category === category).map((motion) => (
          <button
            key={motion.id}
            type="button"
            title={motion.hint}
            onClick={() => applyPreset(motion.id)}
            className="h-7 cursor-pointer truncate rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors hover:bg-input"
          >
            {motion.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {keyframes.length > 0
          ? "Preset mengganti keyframe yang ada. Mengubah skala, posisi, rotasi, atau opasitas membuat keyframe di garis waktu."
          : "Preset membuat keyframe otomatis. Untuk gerak sendiri, klik ◇ di baris Transformasi pada dua waktu berbeda."}
      </p>

      {keyframes.length > 0 && (
        <>
          <div className="flex items-center gap-2.5">
            <EasingCurve easing={keyframes[active]?.easing ?? "linear"} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Lengkung semua keyframe</span>
              <Select
                aria-label="Lengkung gerak untuk semua keyframe"
                value={keyframes.every((keyframe) => keyframe.easing === keyframes[0].easing) ? keyframes[0].easing : "linear"}
                onChange={(easing) => edit((target) => target.keyframes.forEach((keyframe) => void (keyframe.easing = easing)))}
                options={EASING_OPTIONS}
              />
              <span className="text-[11px] leading-snug text-muted-foreground">Grafik: segmen di garis waktu.</span>
            </div>
          </div>
          {/* Preset seperti Goyang membuat puluhan keyframe; daftarnya digulir sendiri. */}
          <ul aria-label="Daftar keyframe" className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {keyframes.map((keyframe, index) => (
              <li key={keyframe.atMs} className={cn("flex items-center gap-1.5 rounded-md p-0.5", index === here && "bg-muted")}>
                <button
                  type="button"
                  title="Lompat ke keyframe ini"
                  onClick={() => {
                    pausePlayer();
                    seekToMs(item.startMs + keyframe.atMs);
                  }}
                  className={cn(
                    "flex h-7 w-[76px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] tabular-nums hover:bg-input",
                    index === here ? "text-primary" : "text-foreground",
                  )}
                >
                  <Diamond className={cn("size-3 shrink-0", index === here && "fill-current")} aria-hidden />
                  {formatTime(keyframe.atMs)}
                </button>
                <Select
                  aria-label={`Lengkung gerak setelah keyframe ${formatTime(keyframe.atMs)}`}
                  value={keyframe.easing}
                  // Keyframe terakhir tidak punya segmen sesudahnya.
                  disabled={index === keyframes.length - 1}
                  onChange={(easing) => edit((target) => void (target.keyframes[index].easing = easing), `kf-easing:${index}`)}
                  options={EASING_OPTIONS}
                />
                <button
                  type="button"
                  aria-label={`Hapus keyframe ${formatTime(keyframe.atMs)}`}
                  title="Hapus keyframe"
                  onClick={() =>
                    edit((target) => {
                      const [removed] = target.keyframes.splice(index, 1);
                      // Keyframe terakhir yang dihapus meninggalkan tampilannya sebagai nilai tetap.
                      if (removed && target.keyframes.length === 0) {
                        const { x, y, scale, rotation, opacity } = removed;
                        target.transform = { x, y, scale, rotation, opacity };
                      }
                    })
                  }
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-danger/15 hover:text-danger [&_svg]:size-3.5"
                >
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Lengkung berlaku dari keyframe itu ke keyframe berikutnya. Belah ketupat kuning di klip timeline bisa diseret untuk
            menggeser waktunya.
          </p>
        </>
      )}
    </Section>
  );
}
