"use client";

import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AudioLines,
  Ban,
  Captions,
  ChevronLeft,
  ChevronRight,
  Circle,
  Diamond,
  FlipHorizontal2,
  FlipVertical2,
  Heart,
  LoaderCircle,
  RectangleHorizontal,
  RotateCcw,
  Square,
  SquareSplitVertical,
  Star,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ease, keyframeIndexNear, transformAt } from "@/lib/project/animate";
import {
  ANIMATIONS,
  ANIMATION_CATEGORIES,
  EFFECTS,
  TRANSITIONS,
  type AnimationId,
  type EffectId,
  type TransitionId,
} from "@/lib/project/catalog";
import {
  ASPECT_PRESETS,
  BLEND_MODES,
  NEUTRAL_ADJUST,
  NEUTRAL_TRANSFORM,
  frameToMs,
  isVisual,
  itemEnd,
  type Adjust,
  type AudioItem,
  type CaptionsItem,
  type ImageItem,
  type Item,
  type Mask,
  type MaskShape,
  type TextItem,
  type Transform,
  type VideoItem,
  type VisualItem,
} from "@/lib/project/schema";
import { findItem } from "@/lib/timeline/ops";
import { clamp, cn, formatTime } from "@/lib/utils";
import { pausePlayer, seekToMs, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { ColorField, NumberInput, Row, Section, SelectField, SliderField, TextArea, TextInput, ToggleField } from "@/components/ui/field";
import { ANIMATION_RENDERERS, revealText } from "@/remotion/fx";
import { CAPTION_LANGUAGES, readCaptionLanguage, runAutoCaption, saveCaptionLanguage, type CaptionLanguage } from "./autoCaption";
import { fontPreviewStyle, useFontOptions } from "./fonts";
import { MotionSection } from "./MotionPanel";
import { alignItem, type AlignMode } from "./StageOverlay";
import { TextSpeechSection } from "./TtsPanel";
import { useHoverClock } from "./useHoverClock";

// --- Pilihan ---

/** Huruf A yang makin tebal: ikon untuk tingkat ketebalan font. */
function WeightIcon({ stroke }: { stroke: number }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <text
        x="8"
        y="12.5"
        textAnchor="middle"
        fontSize="12"
        fontFamily="Arial, sans-serif"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinejoin="round"
      >
        A
      </text>
    </svg>
  );
}

const WEIGHTS = [
  { value: "400", label: "Normal", icon: <WeightIcon stroke={0} /> },
  { value: "600", label: "Agak tebal", icon: <WeightIcon stroke={0.45} /> },
  { value: "700", label: "Tebal", icon: <WeightIcon stroke={0.9} /> },
  { value: "800", label: "Lebih tebal", icon: <WeightIcon stroke={1.4} /> },
  { value: "900", label: "Sangat tebal", icon: <WeightIcon stroke={2} /> },
];

const ALIGNS = [
  { value: "left", label: "Rata kiri", icon: <TextAlignStart /> },
  { value: "center", label: "Rata tengah", icon: <TextAlignCenter /> },
  { value: "right", label: "Rata kanan", icon: <TextAlignEnd /> },
] as const;

/** Dropdown font: font web bawaan Kapkup dan semua font yang terpasang di komputer ini, bisa dicari. */
function FontField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = useFontOptions(value);
  return <SelectField label="Font" value={value} onChange={onChange} options={options} searchable optionStyle={fontPreviewStyle} />;
}

const FITS = [
  { value: "contain", label: "Muat utuh" },
  { value: "cover", label: "Penuhi layar" },
] as const;

const BLEND_LABELS: Record<(typeof BLEND_MODES)[number], string> = {
  normal: "Normal",
  screen: "Screen (terang)",
  multiply: "Multiply (gelap)",
  overlay: "Overlay",
  "soft-light": "Cahaya lembut",
  "hard-light": "Cahaya keras",
  lighten: "Lebih terang",
  darken: "Lebih gelap",
  "color-dodge": "Color dodge",
  "color-burn": "Color burn",
  difference: "Selisih",
};

const MASKS: { shape: MaskShape; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { shape: "split", label: "Belah", icon: SquareSplitVertical },
  { shape: "filmstrip", label: "Pita", icon: RectangleHorizontal },
  { shape: "circle", label: "Lingkaran", icon: Circle },
  { shape: "rectangle", label: "Kotak", icon: Square },
  { shape: "star", label: "Bintang", icon: Star },
  { shape: "heart", label: "Hati", icon: Heart },
];

const NONE = "none";
const TRANSITION_OPTIONS = [
  { value: NONE, label: "Tanpa transisi" },
  ...TRANSITIONS.map((entry) => ({ value: entry.id as string, label: entry.label })),
];

const KIND_LABEL: Record<Item["type"], string> = {
  video: "Klip video",
  image: "Gambar",
  audio: "Klip audio",
  text: "Teks",
  captions: "Caption",
  effect: "Efek",
  adjustment: "Lapisan penyesuaian",
};

type Update = (mutator: (item: Item) => void, key: string) => void;

// --- Komponen kecil ---

/** Deretan tab utama panel (Video, Audio, Kecepatan, ...). */
function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label="Bagian properti" className="flex h-10 shrink-0 items-center gap-4 overflow-x-auto border-b border-border px-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative h-full cursor-pointer text-xs font-semibold whitespace-nowrap transition-colors",
            // Garis bawah menandai tab yang sedang dibuka.
            "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
            value === tab.id ? "text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Pilihan berjajar di bawah tab utama (Dasar, Mask, ...). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="mx-3 mt-3 flex rounded-lg bg-background p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "h-6 flex-1 cursor-pointer rounded-md text-xs font-medium transition-colors",
            value === option.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MiniButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5",
        active && "text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        className="size-3.5 cursor-pointer accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/** Waktu garis waktu relatif terhadap awal klip. Hanya mengikuti frame bila klip punya keyframe. */
function useLocalMs(item: VisualItem): number {
  const animated = item.keyframes.length > 0;
  const frame = useEditor((state) => (animated ? state.frame : 0));
  const fps = useEditor((state) => state.project?.settings.fps ?? 30);
  return clamp(Math.round(frameToMs(frame, fps) - item.startMs), 0, item.durationMs);
}

/** Tombol keyframe di ujung baris: ‹ sebelumnya, ◇ tambah/hapus di garis waktu, › berikutnya. */
function KeyframeNav({ item }: { item: VisualItem }) {
  const fps = useEditor((state) => state.project?.settings.fps ?? 30);
  const frame = useEditor((state) => state.frame);
  const localMs = clamp(Math.round(frameToMs(frame, fps) - item.startMs), 0, item.durationMs);
  const keyframes = item.keyframes;
  const here = keyframeIndexNear(keyframes, localMs, (1000 / fps) * 0.6) >= 0;
  const previous = [...keyframes].reverse().find((keyframe) => keyframe.atMs < localMs - 1);
  const next = keyframes.find((keyframe) => keyframe.atMs > localMs + 1);
  const jump = (atMs: number) => {
    pausePlayer();
    seekToMs(item.startMs + atMs);
  };
  return (
    <span className="flex shrink-0 items-center">
      <MiniButton label="Keyframe sebelumnya" disabled={!previous} onClick={() => previous && jump(previous.atMs)}>
        <ChevronLeft />
      </MiniButton>
      <MiniButton
        label={here ? "Hapus keyframe di garis waktu" : "Tambah keyframe di garis waktu"}
        active={here}
        onClick={() => useEditor.getState().toggleKeyframe(item.id)}
      >
        <Diamond className={here ? "fill-current" : undefined} />
      </MiniButton>
      <MiniButton label="Keyframe berikutnya" disabled={!next} onClick={() => next && jump(next.atMs)}>
        <ChevronRight />
      </MiniButton>
    </span>
  );
}

function ResetButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <MiniButton label="Kembalikan ke awal" onClick={onClick} disabled={disabled}>
      <RotateCcw />
    </MiniButton>
  );
}

// --- Transformasi ---

const ALIGN_BUTTONS: { mode: AlignMode; label: string; icon: React.ComponentType }[] = [
  { mode: "left", label: "Rapat kiri", icon: AlignHorizontalJustifyStart },
  { mode: "center-x", label: "Tengah mendatar", icon: AlignHorizontalJustifyCenter },
  { mode: "right", label: "Rapat kanan", icon: AlignHorizontalJustifyEnd },
  { mode: "top", label: "Rapat atas", icon: AlignVerticalJustifyStart },
  { mode: "center-y", label: "Tengah tegak", icon: AlignVerticalJustifyCenter },
  { mode: "bottom", label: "Rapat bawah", icon: AlignVerticalJustifyEnd },
];

function TransformGroup({ item, update }: { item: VisualItem; update: Update }) {
  const { setTransform } = useEditor.getState();
  const localMs = useLocalMs(item);
  const transform = transformAt(item, localMs);
  const set = (key: keyof Transform, value: number) => setTransform(item.id, { [key]: value });
  const nav = <KeyframeNav item={item} />;
  const flippable = item.type === "video" || item.type === "image";

  return (
    <>
      <Section
        title="Transformasi"
        actions={
          <ResetButton
            onClick={() =>
              update((target) => {
                if (!isVisual(target)) return;
                target.transform = { ...NEUTRAL_TRANSFORM };
                target.keyframes = [];
              }, "transform.reset")
            }
          />
        }
      >
        <SliderField label="Skala %" value={transform.scale * 100} min={10} max={400} onChange={(v) => set("scale", v / 100)} after={nav} />
        <Row label="Posisi">
          <span className="text-xs text-muted-foreground">X</span>
          <NumberInput aria-label="Posisi X" value={transform.x} onChange={(v) => set("x", v)} step={10} className="w-14" />
          <span className="text-xs text-muted-foreground">Y</span>
          <NumberInput aria-label="Posisi Y" value={transform.y} onChange={(v) => set("y", v)} step={10} className="w-14" />
          <span className="flex-1" />
          {nav}
        </Row>
        <SliderField label="Rotasi °" value={transform.rotation} min={-180} max={180} onChange={(v) => set("rotation", v)} after={nav} />
        <div className="flex items-center gap-0.5 rounded-md bg-background p-0.5">
          {ALIGN_BUTTONS.map(({ mode, label, icon: Icon }) => (
            <MiniButton key={mode} label={label} onClick={() => alignItem(item.id, mode)}>
              <Icon />
            </MiniButton>
          ))}
          {flippable && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <MiniButton
                label="Balik mendatar (cermin)"
                active={item.flipX}
                onClick={() =>
                  update((target) => {
                    if (target.type === "video" || target.type === "image") target.flipX = !target.flipX;
                  }, "flipX")
                }
              >
                <FlipHorizontal2 />
              </MiniButton>
              <MiniButton
                label="Balik tegak"
                active={item.flipY}
                onClick={() =>
                  update((target) => {
                    if (target.type === "video" || target.type === "image") target.flipY = !target.flipY;
                  }, "flipY")
                }
              >
                <FlipVertical2 />
              </MiniButton>
            </>
          )}
        </div>
      </Section>

      <Section title="Campuran">
        <SliderField label="Opasitas %" value={transform.opacity * 100} min={0} max={100} onChange={(v) => set("opacity", v / 100)} after={nav} />
        {flippable && (
          <SelectField
            label="Mode"
            value={item.blendMode}
            onChange={(value) =>
              update((target) => {
                if (target.type === "video" || target.type === "image") target.blendMode = value;
              }, "blend")
            }
            options={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_LABELS[mode] }))}
          />
        )}
      </Section>

      <MotionSection item={item} />
    </>
  );
}

// --- Video / gambar ---

function FrameGroup({ item, update }: { item: VideoItem | ImageItem; update: Update }) {
  const setTransition = useEditor((state) => state.setTransition);
  const transition = item.transitionIn;
  const media = (mutator: (target: VideoItem | ImageItem) => void, key: string) =>
    update((target) => {
      if (target.type === "video" || target.type === "image") mutator(target);
    }, key);
  return (
    <>
      <Section title="Bingkai">
        <SelectField label="Ukuran" value={item.fit} onChange={(v) => media((t) => void (t.fit = v), "fit")} options={FITS} />
        <Checkbox
          label="Latar buram (mengisi area kosong di sekitar klip)"
          checked={item.backdropBlur > 0}
          onChange={(v) => media((t) => void (t.backdropBlur = v ? 40 : 0), "backdrop")}
        />
        {item.backdropBlur > 0 && (
          <SliderField label="Buram" value={item.backdropBlur} min={5} max={120} onChange={(v) => media((t) => void (t.backdropBlur = v), "backdropBlur")} />
        )}
      </Section>
      <Section title="Transisi masuk">
        <SelectField
          label="Jenis"
          value={transition?.type ?? NONE}
          onChange={(value) =>
            setTransition(item.id, value === NONE ? null : { type: value as TransitionId, durationMs: transition?.durationMs ?? 500 })
          }
          options={TRANSITION_OPTIONS}
        />
        {transition && (
          <SliderField
            label="Durasi dtk"
            value={transition.durationMs / 1000}
            min={0.1}
            max={Math.max(0.1, Math.min(3, item.durationMs / 1000))}
            step={0.1}
            digits={1}
            onChange={(v) => setTransition(item.id, { type: transition.type, durationMs: Math.round(v * 1000) })}
          />
        )}
      </Section>
    </>
  );
}

function MaskPanel({ item, update }: { item: VideoItem | ImageItem; update: Update }) {
  const canvas = useEditor((state) => state.project?.settings);
  const mask = item.mask;
  const setMask = (mutator: (target: VideoItem | ImageItem) => void, key: string) =>
    update((target) => {
      if (target.type === "video" || target.type === "image") mutator(target);
    }, `mask.${key}`);
  const edit = (patch: Partial<Mask>, key: string) => setMask((target) => target.mask && Object.assign(target.mask, patch), key);
  const pick = (shape: MaskShape | null) =>
    setMask((target) => {
      if (shape === null) {
        target.mask = null;
        return;
      }
      const size = Math.round(Math.min(canvas?.width ?? 1080, canvas?.height ?? 1080) / 2);
      target.mask = target.mask
        ? { ...target.mask, shape }
        : { shape, x: 0, y: 0, width: size, height: size, rotation: 0, feather: 0, radius: 0, invert: false };
    }, "shape");
  const tile = "flex cursor-pointer flex-col items-center gap-1 text-[11px] text-muted-foreground";
  const box = "flex aspect-square w-full items-center justify-center rounded-md bg-muted [&_svg]:size-5";

  return (
    <>
      <Section title="Mask" actions={<ResetButton disabled={!mask} onClick={() => pick(null)} />}>
        <div className="grid grid-cols-4 gap-2">
          <button type="button" className={tile} aria-pressed={!mask} onClick={() => pick(null)}>
            <span className={cn(box, !mask && "ring-2 ring-primary")}>
              <Ban />
            </span>
            Tanpa
          </button>
          {MASKS.map(({ shape, label, icon: Icon }) => (
            <button key={shape} type="button" className={tile} aria-pressed={mask?.shape === shape} onClick={() => pick(shape)}>
              <span className={cn(box, mask?.shape === shape && "text-primary ring-2 ring-primary")}>
                <Icon />
              </span>
              {label}
            </button>
          ))}
        </div>
      </Section>
      {mask && (
        <Section title="Pengaturan mask">
          <Row label="Posisi">
            <span className="text-xs text-muted-foreground">X</span>
            <NumberInput aria-label="Posisi mask X" value={mask.x} onChange={(v) => edit({ x: v }, "x")} step={10} />
            <span className="text-xs text-muted-foreground">Y</span>
            <NumberInput aria-label="Posisi mask Y" value={mask.y} onChange={(v) => edit({ y: v }, "y")} step={10} />
          </Row>
          <SliderField label="Rotasi °" value={mask.rotation} min={-180} max={180} onChange={(v) => edit({ rotation: v }, "rotation")} />
          {mask.shape !== "split" && (
            <Row label="Ukuran">
              {mask.shape !== "filmstrip" && (
                <>
                  <span className="text-xs text-muted-foreground">L</span>
                  <NumberInput aria-label="Lebar mask" value={mask.width} min={1} onChange={(v) => edit({ width: v }, "width")} step={10} />
                </>
              )}
              <span className="text-xs text-muted-foreground">T</span>
              <NumberInput aria-label="Tinggi mask" value={mask.height} min={1} onChange={(v) => edit({ height: v }, "height")} step={10} />
            </Row>
          )}
          <SliderField label="Tepi pudar" value={mask.feather} min={0} max={200} onChange={(v) => edit({ feather: v }, "feather")} />
          {mask.shape === "rectangle" && (
            <SliderField label="Sudut %" value={mask.radius * 100} min={0} max={100} onChange={(v) => edit({ radius: v / 100 }, "radius")} />
          )}
          <Checkbox label="Balik mask (tampilkan bagian luar)" checked={mask.invert} onChange={(v) => edit({ invert: v }, "invert")} />
        </Section>
      )}
    </>
  );
}

// --- Audio & kecepatan ---

const toDb = (volume: number) => (volume <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(volume)));
const fromDb = (db: number) => (db <= -60 ? 0 : Math.min(2, Math.pow(10, db / 20)));

function FadeFields({ item, update }: { item: Item; update: Update }) {
  const max = Math.min(5, item.durationMs / 1000);
  return (
    <>
      <SliderField
        label="Fade masuk"
        value={item.fadeInMs / 1000}
        min={0}
        max={max}
        step={0.1}
        digits={1}
        onChange={(v) =>
          update((target) => void (target.fadeInMs = Math.round(Math.min(v * 1000, target.durationMs - target.fadeOutMs))), "fadeIn")
        }
      />
      <SliderField
        label="Fade keluar"
        value={item.fadeOutMs / 1000}
        min={0}
        max={max}
        step={0.1}
        digits={1}
        onChange={(v) =>
          update((target) => void (target.fadeOutMs = Math.round(Math.min(v * 1000, target.durationMs - target.fadeInMs))), "fadeOut")
        }
      />
    </>
  );
}

function AudioPanel({ item, update }: { item: VideoItem | AudioItem; update: Update }) {
  const hasAudio = useEditor((state) => state.project?.assets.find((asset) => asset.id === item.assetId)?.hasAudio ?? false);
  if (!hasAudio) return <p className="px-3 py-3 text-xs text-muted-foreground">Klip ini tidak punya suara.</p>;
  return (
    <>
      <Section
        title="Dasar"
        actions={
          <ResetButton
            onClick={() =>
              update((target) => {
                if (target.type !== "video" && target.type !== "audio") return;
                target.volume = 1;
                target.fadeInMs = 0;
                target.fadeOutMs = 0;
              }, "audio.reset")
            }
          />
        }
      >
        <SliderField
          label="Volume dB"
          value={toDb(item.volume)}
          min={-60}
          max={6}
          step={0.5}
          digits={1}
          onChange={(v) =>
            update((target) => {
              if (target.type === "video" || target.type === "audio") target.volume = fromDb(v);
            }, "volume")
          }
        />
        <FadeFields item={item} update={update} />
        {item.type === "video" && <p className="text-xs text-muted-foreground">Fade juga berlaku untuk gambarnya (muncul dan hilang perlahan).</p>}
      </Section>
      {item.type === "video" && (
        <Section title="Pisahkan audio">
          <Button
            size="sm"
            className="self-start"
            disabled={item.volume === 0}
            onClick={() => {
              if (useEditor.getState().detachAudio(item.id)) toast.success("Suara dipindah ke track audio");
            }}
          >
            <AudioLines className="size-3.5" />
            Pisahkan suara dari video
          </Button>
          <p className="text-xs text-muted-foreground">
            {item.volume === 0
              ? "Suara klip ini dimatikan (sudah dipisah atau volume 0)."
              : "Suara menjadi klip sendiri di track audio dan bisa dipotong atau digeser terpisah."}
          </p>
        </Section>
      )}
      <AutoCaptionGroup item={item} />
    </>
  );
}

function SpeedPanel({ item }: { item: VideoItem | AudioItem }) {
  const setSpeed = useEditor((state) => state.setSpeed);
  return (
    <Section title="Standar" actions={<ResetButton disabled={item.speed === 1} onClick={() => setSpeed(item.id, 1)} />}>
      <SliderField label="Kecepatan" value={item.speed} min={0.25} max={8} step={0.05} digits={2} onChange={(v) => setSpeed(item.id, v)} />
      <Row label="Durasi">
        <NumberInput
          aria-label="Durasi klip (detik)"
          value={item.durationMs / 1000}
          min={0.1}
          step={0.1}
          digits={1}
          onChange={(v) => setSpeed(item.id, (item.durationMs * item.speed) / (v * 1000))}
        />
        <span className="text-xs text-muted-foreground">detik</span>
      </Row>
      <p className="text-xs text-muted-foreground">Mengubah durasi menyesuaikan kecepatan supaya bagian yang sama tetap terpakai.</p>
    </Section>
  );
}

function AutoCaptionGroup({ item }: { item: VideoItem | AudioItem }) {
  const projectId = useEditor((state) => state.projectId);
  const [language, setLanguage] = React.useState<CaptionLanguage>(readCaptionLanguage);
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      await runAutoCaption(item.id, language);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Caption otomatis">
      <SelectField
        label="Bahasa"
        value={language}
        onChange={(value) => {
          setLanguage(value);
          // Tombol "Caption otomatis" di toolbar memakai pilihan yang sama.
          saveCaptionLanguage(value);
        }}
        options={CAPTION_LANGUAGES}
      />
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Captions className="size-3.5" />}
        {busy ? "Mentranskripsi… (bisa beberapa menit)" : "Buat caption dari suara"}
      </Button>
    </Section>
  );
}

// --- Animasi ---

type AnimationSlot = "in" | "out" | "combo";

const ANIMATION_TILE = "flex cursor-pointer flex-col items-center gap-1 text-[11px] leading-tight text-muted-foreground";
/** Peragaan di ubin: bergerak selama MOVE detik, lalu diam selama HOLD detik, berulang. */
const PREVIEW_MOVE = 0.7;
const PREVIEW_HOLD = 0.5;

/** Seberapa "hadir" tulisan contoh pada detik ke-`time` sejak ubin disorot (0 = hilang, 1 = tampil penuh). */
function previewPresence(slot: AnimationSlot, time: number): number {
  if (slot === "combo") {
    const t = time % (PREVIEW_MOVE * 2 + PREVIEW_HOLD * 2);
    if (t < PREVIEW_MOVE) return t / PREVIEW_MOVE;
    if (t < PREVIEW_MOVE + PREVIEW_HOLD) return 1;
    if (t < PREVIEW_MOVE * 2 + PREVIEW_HOLD) return 1 - (t - PREVIEW_MOVE - PREVIEW_HOLD) / PREVIEW_MOVE;
    return 0;
  }
  const progress = Math.min(1, (time % (PREVIEW_MOVE + PREVIEW_HOLD)) / PREVIEW_MOVE);
  return slot === "in" ? progress : 1 - progress;
}

/** Ubin satu animasi: tulisan "Teks" yang memperagakan gerakannya selama kursor di atasnya. */
function AnimationTile({
  id,
  label,
  slot,
  selected,
  onPick,
}: {
  id: AnimationId;
  label: string;
  slot: AnimationSlot;
  selected: boolean;
  onPick: () => void;
}) {
  const clock = useHoverClock();
  const result = clock.time > 0 ? ANIMATION_RENDERERS[id](ease("ease-out", previewPresence(slot, clock.time))) : null;
  // Buram di kanvas dihitung dalam piksel kanvas; di ubin kecil diperkecil supaya sebanding.
  const filter = result?.filter?.replace(/blur\(([\d.]+)px\)/, (_, value: string) => `blur(${Number(value) / 8}px)`);
  return (
    <button
      type="button"
      className={ANIMATION_TILE}
      aria-pressed={selected}
      onClick={onPick}
      onPointerEnter={clock.start}
      onPointerLeave={clock.stop}
      onFocus={clock.start}
      onBlur={clock.stop}
    >
      <span className={cn("relative block aspect-square w-full overflow-hidden rounded-md bg-muted", selected && "ring-2 ring-primary")}>
        <span
          className="absolute inset-0 flex items-center justify-center"
          style={result ? { opacity: result.opacity, transform: result.transform, filter } : undefined}
        >
          <span
            className={cn("text-sm font-bold whitespace-pre", selected ? "text-primary" : "text-foreground")}
            style={result ? { clipPath: result.clipPath, letterSpacing: result.letterSpacing } : undefined}
          >
            {revealText("Teks", result) || " "}
          </span>
        </span>
      </span>
      {label}
    </button>
  );
}

function AnimationPanel({ item, update }: { item: VideoItem | ImageItem | TextItem; update: Update }) {
  const [slot, setSlot] = React.useState<AnimationSlot>("in");
  const current = slot === "out" ? item.animationOut : item.animationIn;
  const combo = slot === "combo";
  const selected = combo
    ? item.animationIn && item.animationIn.type === item.animationOut?.type
      ? item.animationIn.type
      : null
    : (current?.type ?? null);
  const options = ANIMATIONS.filter((entry) => !entry.textOnly || item.type === "text");
  const labelOf = (type: AnimationId) => ANIMATIONS.find((entry) => entry.id === type)?.label ?? type;
  // Durasi masuk + keluar tidak boleh melebihi panjang klip; masing-masing paling lama 5 detik.
  const maxSeconds = (otherMs: number) => Math.max(0.1, Math.min(5, (item.durationMs - otherMs) / 1000));
  const setDuration = (which: "in" | "out", seconds: number) =>
    update((target) => {
      if (target.type !== "text" && target.type !== "video" && target.type !== "image") return;
      const animation = which === "in" ? target.animationIn : target.animationOut;
      if (animation) animation.durationMs = Math.round(seconds * 1000);
    }, `animation.duration.${which}`);

  const change = (mutator: (target: VideoItem | ImageItem | TextItem) => void, key: string) =>
    update((target) => {
      if (target.type === "text" || target.type === "video" || target.type === "image") mutator(target);
    }, `animation.${slot}.${key}`);

  const pick = (type: AnimationId | null) =>
    change((target) => {
      const make = (previous: { durationMs: number } | null) => (type ? { type, durationMs: previous?.durationMs ?? 500 } : null);
      if (slot !== "out") target.animationIn = make(target.animationIn);
      if (slot !== "in") target.animationOut = make(target.animationOut);
    }, "type");

  const grid = "grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2";

  return (
    <>
      <Segmented
        label="Jenis animasi"
        value={slot}
        onChange={setSlot}
        options={[
          { id: "in", label: "Masuk" },
          { id: "out", label: "Keluar" },
          { id: "combo", label: "Kombinasi" },
        ]}
      />
      <Section title="Durasi animasi">
        {item.animationIn && (
          <SliderField
            label="Masuk dtk"
            value={item.animationIn.durationMs / 1000}
            min={0.1}
            max={maxSeconds(item.animationOut?.durationMs ?? 0)}
            step={0.05}
            digits={2}
            onChange={(v) => setDuration("in", v)}
          />
        )}
        {item.animationOut && (
          <SliderField
            label="Keluar dtk"
            value={item.animationOut.durationMs / 1000}
            min={0.1}
            max={maxSeconds(item.animationIn?.durationMs ?? 0)}
            step={0.05}
            digits={2}
            onChange={(v) => setDuration("out", v)}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {item.animationIn || item.animationOut
            ? [
                item.animationIn ? `Masuk: ${labelOf(item.animationIn.type)}` : null,
                item.animationOut ? `Keluar: ${labelOf(item.animationOut.type)}` : null,
              ]
                .filter(Boolean)
                .join(" · ") + ". Durasi juga bisa diseret di timeline: bulatan biru di tepi atas klip."
            : "Pilih animasi di bawah dulu; pengatur durasinya muncul di sini."}
        </p>
      </Section>
      <Section title={combo ? "Masuk dan keluar sekaligus" : slot === "in" ? "Saat klip muncul" : "Saat klip menghilang"}>
        <p className="text-xs text-muted-foreground">Arahkan kursor ke ubin untuk melihat gerakannya.</p>
        <div className={grid}>
          <button type="button" className={ANIMATION_TILE} aria-pressed={selected === null} onClick={() => pick(null)}>
            <span
              className={cn(
                "flex aspect-square w-full items-center justify-center rounded-md bg-muted",
                selected === null && "ring-2 ring-primary",
              )}
            >
              <Ban className="size-5" />
            </span>
            Tanpa
          </button>
        </div>
        {ANIMATION_CATEGORIES.map((category) => {
          const entries = options.filter((entry) => entry.category === category.id);
          if (entries.length === 0) return null;
          return (
            <React.Fragment key={category.id}>
              <p className="pt-1 text-[11px] font-semibold text-muted-foreground">{category.label}</p>
              <div className={grid}>
                {entries.map((entry) => (
                  <AnimationTile
                    key={entry.id}
                    id={entry.id}
                    label={entry.label}
                    slot={slot}
                    selected={selected === entry.id}
                    onPick={() => pick(entry.id)}
                  />
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </Section>
    </>
  );
}

// --- Penyesuaian warna ---

function AdjustPanel({
  adjust,
  onChange,
  withVignette,
}: {
  adjust: Adjust;
  onChange: (patch: Partial<Adjust>, key: string) => void;
  withVignette: boolean;
}) {
  const percent = (key: "brightness" | "contrast" | "saturation" | "temperature" | "tint", label: string) => (
    <SliderField label={label} value={adjust[key] * 100} min={-100} max={100} onChange={(v) => onChange({ [key]: v / 100 }, key)} />
  );
  const changed = (Object.keys(NEUTRAL_ADJUST) as (keyof Adjust)[]).some((key) => adjust[key] !== 0);
  return (
    <>
      <Section title="Warna" actions={<ResetButton disabled={!changed} onClick={() => onChange({ ...NEUTRAL_ADJUST }, "reset")} />}>
        {percent("temperature", "Suhu")}
        {percent("tint", "Rona")}
        {percent("saturation", "Saturasi")}
        <SliderField label="Putar warna" value={adjust.hue} min={-180} max={180} onChange={(v) => onChange({ hue: v }, "hue")} />
      </Section>
      <Section title="Cahaya">
        {percent("brightness", "Eksposur")}
        {percent("contrast", "Kontras")}
      </Section>
      <Section title="Efek">
        <SliderField label="Buram" value={adjust.blur} min={0} max={50} onChange={(v) => onChange({ blur: v }, "blur")} />
        {withVignette && (
          <SliderField label="Vinyet %" value={adjust.vignette * 100} min={0} max={100} onChange={(v) => onChange({ vignette: v / 100 }, "vignette")} />
        )}
      </Section>
    </>
  );
}

// --- Teks & caption ---

function TextGroup({ item, update }: { item: TextItem; update: Update }) {
  const style = item.style;
  const setStyle = <K extends keyof TextItem["style"]>(key: K, value: TextItem["style"][K]) =>
    update((target) => {
      if (target.type === "text") target.style[key] = value;
    }, `style.${key}`);
  return (
    <Section title="Teks">
      <TextArea
        aria-label="Isi teks"
        rows={3}
        value={item.text}
        onChange={(event) =>
          update((target) => {
            if (target.type === "text") target.text = event.target.value;
          }, "text")
        }
      />
      <FontField value={style.fontFamily} onChange={(v) => setStyle("fontFamily", v)} />
      <SliderField label="Ukuran" value={style.fontSize} min={12} max={300} onChange={(v) => setStyle("fontSize", v)} />
      <ToggleField label="Ketebalan" value={String(style.fontWeight)} onChange={(v) => setStyle("fontWeight", Number(v))} options={WEIGHTS} />
      <ToggleField label="Rata" value={style.align} onChange={(v) => setStyle("align", v)} options={ALIGNS} />
      <ColorField label="Warna" value={style.color} onChange={(v) => setStyle("color", v)} />
      <SliderField label="Garis tepi" value={style.strokeWidth} min={0} max={30} onChange={(v) => setStyle("strokeWidth", v)} />
      {style.strokeWidth > 0 && <ColorField label="Warna tepi" value={style.strokeColor} onChange={(v) => setStyle("strokeColor", v)} />}
      <SliderField label="Lebar %" value={style.maxWidth * 100} min={10} max={100} onChange={(v) => setStyle("maxWidth", v / 100)} />
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Checkbox label="Miring" checked={style.italic} onChange={(v) => setStyle("italic", v)} />
        <Checkbox label="Bayangan" checked={style.shadow} onChange={(v) => setStyle("shadow", v)} />
        <Checkbox label="Kotak latar" checked={style.background !== null} onChange={(v) => setStyle("background", v ? "#000000" : null)} />
      </div>
      {style.background !== null && <ColorField label="Warna latar" value={style.background} onChange={(v) => setStyle("background", v)} />}
    </Section>
  );
}

function CaptionsGroup({ item, update }: { item: CaptionsItem; update: Update }) {
  const style = item.style;
  const set = (mutator: (target: CaptionsItem) => void, key: string) =>
    update((target) => {
      if (target.type === "captions") mutator(target);
    }, key);
  return (
    <Section title="Caption">
      <p className="max-h-20 overflow-y-auto rounded-md bg-background px-2 py-1.5 text-xs text-muted-foreground">
        {item.words.map((word) => word.text).join(" ") || "Belum ada kata."}
      </p>
      <SliderField label="Grup dtk" value={item.pageMs / 1000} min={0.2} max={5} step={0.1} digits={1} onChange={(v) => set((t) => void (t.pageMs = Math.round(v * 1000)), "pageMs")} />
      <FontField value={style.fontFamily} onChange={(v) => set((t) => void (t.style.fontFamily = v), "font")} />
      <SliderField label="Ukuran" value={style.fontSize} min={12} max={300} onChange={(v) => set((t) => void (t.style.fontSize = v), "size")} />
      <ToggleField label="Ketebalan" value={String(style.fontWeight)} onChange={(v) => set((t) => void (t.style.fontWeight = Number(v)), "weight")} options={WEIGHTS} />
      <ColorField label="Warna" value={style.color} onChange={(v) => set((t) => void (t.style.color = v), "color")} />
      <SliderField label="Garis tepi" value={style.strokeWidth} min={0} max={30} onChange={(v) => set((t) => void (t.style.strokeWidth = v), "stroke")} />
      {style.strokeWidth > 0 && <ColorField label="Warna tepi" value={style.strokeColor} onChange={(v) => set((t) => void (t.style.strokeColor = v), "strokeColor")} />}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Checkbox label="Sorot kata" checked={item.highlightColor !== null} onChange={(v) => set((t) => void (t.highlightColor = v ? "#ffe14d" : null), "highlight")} />
        <Checkbox label="Huruf besar" checked={item.uppercase} onChange={(v) => set((t) => void (t.uppercase = v), "uppercase")} />
        <Checkbox label="Kotak latar" checked={style.background !== null} onChange={(v) => set((t) => void (t.style.background = v ? "#000000" : null), "background")} />
      </div>
      {item.highlightColor !== null && <ColorField label="Sorotan" value={item.highlightColor} onChange={(v) => set((t) => void (t.highlightColor = v), "highlightColor")} />}
      {style.background !== null && <ColorField label="Warna latar" value={style.background} onChange={(v) => set((t) => void (t.style.background = v), "backgroundColor")} />}
      <p className="text-xs text-muted-foreground">Isi dan waktu tiap kata bisa diubah lewat file project.</p>
    </Section>
  );
}

// --- Panel per jenis klip ---

function Header({ item }: { item: Item }) {
  return (
    <div className="border-b border-border px-3 py-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{KIND_LABEL[item.type]}</span> · {formatTime(item.startMs)} –{" "}
        {formatTime(itemEnd(item))} · {formatTime(item.durationMs)}
      </p>
    </div>
  );
}

type MediaTab = "video" | "audio" | "speed" | "animation" | "adjust";

function MediaInspector({ item, update }: { item: VideoItem | ImageItem; update: Update }) {
  const [tab, setTab] = React.useState<MediaTab>("video");
  const [sub, setSub] = React.useState<"basic" | "mask">("basic");
  const isVideo = item.type === "video";
  const tabs: { id: MediaTab; label: string }[] = isVideo
    ? [
        { id: "video", label: "Video" },
        { id: "audio", label: "Audio" },
        { id: "speed", label: "Kecepatan" },
        { id: "animation", label: "Animasi" },
        { id: "adjust", label: "Penyesuaian" },
      ]
    : [
        { id: "video", label: "Gambar" },
        { id: "animation", label: "Animasi" },
        { id: "adjust", label: "Penyesuaian" },
      ];
  const active = tabs.some((entry) => entry.id === tab) ? tab : "video";
  const setAdjust = (patch: Partial<Adjust>, key: string) =>
    update((target) => {
      if (target.type === "video" || target.type === "image") Object.assign(target.adjust, patch);
    }, `adjust.${key}`);

  return (
    <>
      <TabBar tabs={tabs} value={active} onChange={setTab} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Header item={item} />
        {active === "video" && (
          <>
            <Segmented
              label="Bagian video"
              value={sub}
              onChange={setSub}
              options={[
                { id: "basic", label: "Dasar" },
                { id: "mask", label: "Mask" },
              ]}
            />
            {sub === "basic" ? (
              <>
                <TransformGroup item={item} update={update} />
                <FrameGroup item={item} update={update} />
              </>
            ) : (
              <MaskPanel item={item} update={update} />
            )}
          </>
        )}
        {active === "audio" && item.type === "video" && <AudioPanel item={item} update={update} />}
        {active === "speed" && item.type === "video" && <SpeedPanel item={item} />}
        {active === "animation" && <AnimationPanel item={item} update={update} />}
        {active === "adjust" && <AdjustPanel adjust={item.adjust} onChange={setAdjust} withVignette={false} />}
      </div>
    </>
  );
}

function AudioInspector({ item, update }: { item: AudioItem; update: Update }) {
  const [tab, setTab] = React.useState<"basic" | "speed">("basic");
  return (
    <>
      <TabBar
        tabs={[
          { id: "basic", label: "Dasar" },
          { id: "speed", label: "Kecepatan" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Header item={item} />
        {tab === "basic" ? <AudioPanel item={item} update={update} /> : <SpeedPanel item={item} />}
      </div>
    </>
  );
}

function TextInspector({ item, update }: { item: TextItem; update: Update }) {
  const [tab, setTab] = React.useState<"text" | "animation">("text");
  return (
    <>
      <TabBar
        tabs={[
          { id: "text", label: "Teks" },
          { id: "animation", label: "Animasi" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Header item={item} />
        {tab === "text" ? (
          <>
            <TextGroup item={item} update={update} />
            <TextSpeechSection item={item} />
            <TransformGroup item={item} update={update} />
            <Section title="Fade">
              <FadeFields item={item} update={update} />
            </Section>
          </>
        ) : (
          <AnimationPanel item={item} update={update} />
        )}
      </div>
    </>
  );
}

function OtherInspector({ item, update }: { item: CaptionsItem | Extract<Item, { type: "effect" | "adjustment" }>; update: Update }) {
  const setAdjust = (patch: Partial<Adjust>, key: string) =>
    update((target) => {
      if (target.type === "adjustment") Object.assign(target.adjust, patch);
    }, `adjust.${key}`);
  return (
    <>
      <TabBar tabs={[{ id: "main", label: KIND_LABEL[item.type] }]} value="main" onChange={() => undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Header item={item} />
        {item.type === "captions" && (
          <>
            <CaptionsGroup item={item} update={update} />
            <TransformGroup item={item} update={update} />
          </>
        )}
        {item.type === "effect" && (
          <Section title="Efek">
            <SelectField
              label="Jenis"
              value={item.effect}
              onChange={(value) =>
                update((target) => {
                  if (target.type === "effect") target.effect = value as EffectId;
                }, "effect")
              }
              options={EFFECTS.map((entry) => ({ value: entry.id, label: entry.label }))}
            />
            <SliderField
              label="Kekuatan %"
              value={item.intensity * 100}
              min={0}
              max={100}
              onChange={(v) =>
                update((target) => {
                  if (target.type === "effect") target.intensity = v / 100;
                }, "intensity")
              }
            />
            <p className="text-xs text-muted-foreground">Berlaku untuk semua track di bawah track efek ini.</p>
          </Section>
        )}
        {item.type === "adjustment" && <AdjustPanel adjust={item.adjust} onChange={setAdjust} withVignette />}
        {item.type !== "captions" && (
          <Section title="Muncul & hilang bertahap">
            <FadeFields item={item} update={update} />
          </Section>
        )}
      </div>
    </>
  );
}

function ItemInspector({ item }: { item: Item }) {
  const updateItem = useEditor((state) => state.updateItem);
  const update: Update = (mutator, key) => updateItem(item.id, mutator, key);
  if (item.type === "video" || item.type === "image") return <MediaInspector item={item} update={update} />;
  if (item.type === "audio") return <AudioInspector item={item} update={update} />;
  if (item.type === "text") return <TextInspector item={item} update={update} />;
  return <OtherInspector item={item} update={update} />;
}

// --- Project ---

/** Variabel project: teks berisi {{nama}} diganti nilainya, dan bisa ditimpa saat export lewat CLI. */
function VariablesSection() {
  const variables = useEditor((state) => state.project?.variables) ?? {};
  const apply = useEditor((state) => state.apply);
  const [name, setName] = React.useState("");
  const clean = name.trim().replace(/[^\w-]/g, "");
  const add = () => {
    if (!clean || clean in variables) return;
    apply((draft) => {
      draft.variables[clean] = "";
    });
    setName("");
  };
  return (
    <Section title="Variabel teks">
      {Object.entries(variables).map(([key, value]) => (
        <Row key={key} label={key}>
          <TextInput
            aria-label={`Nilai variabel ${key}`}
            value={value}
            onChange={(event) =>
              apply(
                (draft) => {
                  draft.variables[key] = event.target.value;
                },
                { coalesce: `variable:${key}` },
              )
            }
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Hapus variabel ${key}`}
            onClick={() =>
              apply((draft) => {
                delete draft.variables[key];
              })
            }
          >
            Hapus
          </Button>
        </Row>
      ))}
      <div className="flex gap-2">
        <TextInput
          aria-label="Nama variabel baru"
          placeholder="nama_variabel"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
        />
        <Button size="sm" onClick={add} disabled={!clean || clean in variables}>
          Tambah
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tulis {"{{nama_variabel}}"} di dalam teks. Nilainya bisa diganti per export, untuk membuat banyak versi dari satu project.
      </p>
    </Section>
  );
}

/** Ukuran kanvas harus genap: syarat encoder H.264. */
function even(value: number): number {
  return clamp(Math.round(value / 2) * 2, 16, 7680);
}

function ProjectInspector() {
  const settings = useEditor((state) => state.project?.settings);
  const updateSettings = useEditor((state) => state.updateSettings);
  if (!settings) return null;
  const preset = ASPECT_PRESETS.find((p) => p.width === settings.width && p.height === settings.height);
  const ratioOptions = [...ASPECT_PRESETS.map((p) => ({ value: p.id as string, label: p.label })), { value: "custom", label: "Kustom" }];
  return (
    <>
      <TabBar tabs={[{ id: "project", label: "Project" }]} value="project" onChange={() => undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          Pilih klip di timeline atau di player untuk mengubah propertinya.
        </p>
        <Section title="Kanvas">
          <SelectField
            label="Rasio"
            value={preset?.id ?? "custom"}
            onChange={(value) => {
              const next = ASPECT_PRESETS.find((p) => p.id === value);
              if (next) updateSettings({ width: next.width, height: next.height });
            }}
            options={ratioOptions}
          />
          <Row label="Ukuran">
            <NumberInput aria-label="Lebar kanvas (piksel)" value={settings.width} min={16} max={7680} step={2} onChange={(v) => updateSettings({ width: even(v) })} />
            <span className="text-xs text-muted-foreground">×</span>
            <NumberInput aria-label="Tinggi kanvas (piksel)" value={settings.height} min={16} max={7680} step={2} onChange={(v) => updateSettings({ height: even(v) })} />
            <span className="text-xs text-muted-foreground">px</span>
          </Row>
          <SelectField
            label="FPS"
            value={String(settings.fps)}
            onChange={(value) => updateSettings({ fps: Number(value) })}
            options={[24, 25, 30, 60].map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
          />
          <ColorField label="Latar" value={settings.background} onChange={(v) => updateSettings({ background: v })} />
          <p className="text-xs text-muted-foreground">Lebar dan tinggi bebas diisi (angka genap, 16–7680 px).</p>
        </Section>
        <VariablesSection />
      </div>
    </>
  );
}

export function Inspector({ style }: { style?: React.CSSProperties }) {
  const selectedIds = useEditor((state) => state.selectedIds);
  const item = useEditor((state) =>
    state.project && state.selectedIds.length === 1 ? (findItem(state.project, state.selectedIds[0])?.item ?? null) : null,
  );

  return (
    <section aria-label="Properti" style={style} className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface">
      {item ? (
        // Kunci per jenis klip: tab yang sedang dibuka tetap saat berpindah ke klip sejenis.
        <ItemInspector key={item.type} item={item} />
      ) : selectedIds.length > 1 ? (
        <>
          <TabBar tabs={[{ id: "multi", label: "Beberapa klip" }]} value="multi" onChange={() => undefined} />
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {selectedIds.length} klip dipilih. Seret salah satunya untuk menggeser semuanya, tekan Delete untuk menghapus, atau
            pilih satu klip untuk mengubah propertinya.
          </p>
        </>
      ) : (
        <ProjectInspector />
      )}
    </section>
  );
}
