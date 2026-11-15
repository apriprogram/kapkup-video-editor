"use client";

import {
  AudioLines,
  Blend,
  Captions,
  Film,
  ImageIcon,
  LoaderCircle,
  Music,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { parseSrt, parseVtt } from "@remotion/captions";
import { ease } from "@/lib/project/animate";
import { wordsFromPhrases } from "@/lib/project/captions";
import {
  ADJUST_PRESETS,
  EFFECTS,
  EFFECT_CATEGORIES,
  TRANSITIONS,
  TRANSITION_CATEGORIES,
  type EffectId,
  type TransitionId,
} from "@/lib/project/catalog";
import { NEUTRAL_ADJUST, isMedia, type Asset, type TextStyle } from "@/lib/project/schema";
import { findItem } from "@/lib/timeline/ops";
import { cn, formatTime } from "@/lib/utils";
import { EFFECT_RENDERERS, TRANSITION_RENDERERS, adjustFilter, temperatureMatrix, vignetteStyle } from "@/remotion/fx";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { ASSET_DRAG_TYPE, FX_DRAG_TYPE, TRANSITION_DRAG_TYPE, type FxDragPayload } from "./drag";
import { TtsPanel } from "./TtsPanel";
import { useHoverClock } from "./useHoverClock";



type Tab = "media" | "audio" | "text" | "tts" | "effects" | "transitions" | "adjust";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "media", label: "Media", icon: Film },
  { id: "audio", label: "Audio", icon: Music },
  { id: "text", label: "Teks", icon: Type },
  // Teks jadi suara (TTS).
  { id: "tts", label: "Suara", icon: AudioLines },
  { id: "effects", label: "Efek", icon: Sparkles },
  { id: "transitions", label: "Transisi", icon: Blend },
  { id: "adjust", label: "Penyesuaian", icon: SlidersHorizontal },
];

const TEXT_PRESETS: { label: string; hint: string; text: string; style: Partial<TextStyle> }[] = [
  { label: "Judul", hint: "Besar, tebal, bergaris tepi", text: "Judul", style: { fontSize: 120, fontWeight: 900, strokeWidth: 10 } },
  { label: "Subjudul", hint: "Sedang, tebal", text: "Subjudul", style: { fontSize: 72, fontWeight: 700, shadow: true } },
  { label: "Caption", hint: "Kotak latar gelap", text: "Tulis caption di sini", style: { fontSize: 56, fontWeight: 600, background: "#000000" } },
  { label: "Teks polos", hint: "Tanpa hiasan", text: "Teks", style: { fontSize: 64, fontWeight: 400 } },
];

/** Gambar contoh kecil untuk memperagakan efek, transisi, dan penyesuaian. */
const SAMPLE_A: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 68% 32%, #fde68a 0 14%, transparent 15%), linear-gradient(160deg, #f97316 0%, #db2777 55%, #4c1d95 100%)",
};
const SAMPLE_B: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 30% 62%, #ecfeff 0 12%, transparent 13%), linear-gradient(200deg, #22d3ee 0%, #2563eb 60%, #1e1b4b 100%)",
};

// --- Kerangka: daftar kategori di kiri, isi di kanan ---

function Categories<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <nav aria-label="Kategori" className="flex w-[104px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "cursor-pointer rounded-md px-2 py-1.5 text-left text-xs leading-tight font-medium break-words transition-colors",
            value === item.id ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function Tile({
  label,
  hint,
  onAdd,
  addLabel,
  onDragStart,
  children,
  onPointerEnter,
  onPointerLeave,
}: {
  label: string;
  hint: string;
  onAdd: () => void;
  addLabel: string;
  onDragStart: (event: React.DragEvent) => void;
  children: React.ReactNode;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="group cursor-grab active:cursor-grabbing"
      title={hint}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-stage ring-1 ring-border transition-shadow ring-inset group-hover:ring-2 group-hover:ring-primary">
        {children}
        <button
          type="button"
          aria-label={addLabel}
          title={addLabel}
          onClick={onAdd}
          className="absolute right-1 bottom-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <p className="truncate pt-1 text-center text-[11px] text-muted-foreground group-hover:text-foreground">{label}</p>
    </li>
  );
}

const gridClass = "grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto p-2";

// --- Media & audio ---

function useUpload(projectId: string) {
  const [uploading, setUploading] = React.useState<string[]>([]);
  const upload = React.useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setUploading((list) => [...list, file.name]);
        try {
          const response = await fetch(`/api/projects/${projectId}/media?name=${encodeURIComponent(file.name)}`, {
            method: "POST",
            body: file,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Gagal mengimpor");
          useEditor.getState().addAsset(data.asset as Asset);
        } catch (cause) {
          toast.error(`Gagal mengimpor ${file.name}`, { description: (cause as Error).message });
        } finally {
          setUploading((list) => list.filter((name) => name !== file.name));
        }
      }
    },
    [projectId],
  );
  return { uploading, upload };
}

function AssetCard({ asset, projectId }: { asset: Asset; projectId: string }) {
  const addToTimeline = useEditor((state) => state.addAssetToTimeline);
  const [broken, setBroken] = React.useState(false);
  const selected = useEditor((state) => state.selectedAssetIds.includes(asset.id));
  const Icon = asset.type === "video" ? Film : asset.type === "image" ? ImageIcon : Music;

  const remove = () => {
    const state = useEditor.getState();
    const used = (state.project?.tracks ?? [])
      .flatMap((track) => track.items)
      .filter((item) => isMedia(item) && item.assetId === asset.id).length;
    if (used > 0 && !window.confirm(`"${asset.name}" dipakai ${used} klip di timeline.\n\nHapus media ini beserta klipnya?`)) {
      return;
    }
    state.removeAsset(asset.id);
    toast.success("Media dihapus dari project", { description: "Tekan Ctrl+Z untuk mengembalikan. File aslinya tidak dihapus." });
  };
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(event) => useEditor.getState().selectAsset(asset.id, event.ctrlKey || event.metaKey || event.shiftKey)}
      aria-current={selected}
      title="Klik untuk memilih, lalu tekan Delete untuk menghapus"
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-md bg-muted",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="relative flex aspect-video items-center justify-center bg-stage">
        {asset.thumbnail && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnail lokal dari folder project, bukan aset statis
          <img
            src={`/api/projects/${projectId}/files/${asset.thumbnail}`}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            className="size-full object-contain"
          />
        ) : (
          <Icon className="size-6 text-muted-foreground" />
        )}
        {asset.type !== "image" && (
          <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[11px] tabular-nums">
            {formatTime(asset.durationMs, true)}
          </span>
        )}
        <button
          type="button"
          aria-label={`Hapus ${asset.name} dari project`}
          title="Hapus media"
          onClick={(event) => {
            event.stopPropagation();
            remove();
          }}
          className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Tambahkan ${asset.name} ke timeline`}
          title="Tambahkan ke timeline"
          onClick={(event) => {
            event.stopPropagation();
            addToTimeline(asset.id);
          }}
          className="absolute right-1 bottom-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <p className="truncate px-1.5 py-1 text-[11px] text-muted-foreground" title={asset.name}>
        {asset.name}
      </p>
    </li>
  );
}

type MediaFilter = "all" | "video" | "image";

function AssetsTab({ projectId, audio }: { projectId: string; audio: boolean }) {
  const assets = useEditor((state) => state.project?.assets) ?? [];
  const { uploading, upload } = useUpload(projectId);
  const [filter, setFilter] = React.useState<MediaFilter>("all");
  const [dropping, setDropping] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const shown = assets.filter((asset) =>
    audio ? asset.type === "audio" : asset.type !== "audio" && (filter === "all" || asset.type === filter),
  );

  return (
    <div className="flex min-h-0 flex-1">
      {audio ? (
        <Categories items={[{ id: "mine", label: "Audio kamu" }] as const} value="mine" onChange={() => undefined} />
      ) : (
        <Categories
          items={
            [
              { id: "all", label: "Semua" },
              { id: "video", label: "Video" },
              { id: "image", label: "Gambar" },
            ] as const
          }
          value={filter}
          onChange={setFilter}
        />
      )}
      <div
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col", dropping && "bg-primary/10")}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDropping(false);
          void upload([...event.dataTransfer.files]);
        }}
      >
        <div className="flex shrink-0 items-center gap-2 p-2 pb-0">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={audio ? "audio/*,.m4a,.flac" : "video/*,image/*,.mkv,.mov"}
            className="hidden"
            onChange={(event) => {
              void upload([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
          <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()}>
            <Upload className="size-3.5" />
            {audio ? "Impor audio" : "Impor media"}
          </Button>
          {uploading.length > 0 && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">Mengimpor {uploading[0]}…</span>
            </span>
          )}
        </div>

        {shown.length > 0 ? (
          <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 overflow-y-auto p-2">
            {shown.map((asset) => (
              <AssetCard key={asset.id} asset={asset} projectId={projectId} />
            ))}
          </ul>
        ) : (
          <div className="m-2 flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input p-4 text-center">
            <Upload className="size-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              {audio
                ? "Belum ada audio. Seret file musik atau suara ke sini, atau klik Impor audio."
                : "Belum ada media. Seret video atau gambar ke sini, atau klik Impor media."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Teks ---

async function importSubtitle(file: File) {
  try {
    const input = await file.text();
    const { captions } = file.name.toLowerCase().endsWith(".vtt") ? parseVtt({ input }) : parseSrt({ input });
    const words = wordsFromPhrases(captions);
    if (words.length === 0) throw new Error("File tidak berisi baris subtitle");
    const first = words[0].startMs;
    useEditor.getState().addCaptions(words, {
      startMs: first,
      inMs: first,
      durationMs: Math.max(100, words[words.length - 1].endMs - first),
    });
    toast.success(`Caption ditambahkan (${words.length} kata)`);
  } catch (cause) {
    toast.error(`Gagal membaca ${file.name}`, { description: (cause as Error).message });
  }
}

function TextTab() {
  const addText = useEditor((state) => state.addText);
  const subtitleInput = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-h-0 flex-1">
      <Categories items={[{ id: "preset", label: "Preset" }] as const} value="preset" onChange={() => undefined} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => addText(preset.text, preset.style)}
            className="flex cursor-pointer items-center justify-between rounded-md bg-muted px-3 py-2.5 text-left hover:bg-input"
          >
            <span>
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className="block text-xs text-muted-foreground">{preset.hint}</span>
            </span>
            <Plus className="size-4 text-muted-foreground" />
          </button>
        ))}
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          Teks ditambahkan di posisi garis waktu saat ini. Supaya teks dibacakan, pilih klip teksnya lalu buka bagian Teks jadi suara
          di panel Properti, atau pakai tab Suara.
        </p>
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
          <p className="px-1 text-xs font-semibold">Caption per kata</p>
          <input
            ref={subtitleInput}
            type="file"
            accept=".srt,.vtt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importSubtitle(file);
            }}
          />
          <Button size="sm" onClick={() => subtitleInput.current?.click()}>
            <Captions className="size-3.5" />
            Impor subtitle (.srt / .vtt)
          </Button>
          <p className="px-1 text-xs text-muted-foreground">
            Kata yang sedang diucapkan disorot. Untuk caption otomatis dari suara, pilih klip video atau audio lalu buka
            panel Properti.
          </p>
        </div>
      </div>
    </div>
  );
}

// --- Efek ---

function EffectTile({ id, label, hint }: { id: EffectId; label: string; hint: string }) {
  const clock = useHoverClock();
  const frame = clock.time > 0 ? Math.floor(clock.time * 30) : 8;
  const result = EFFECT_RENDERERS[id]({ frame, fps: 30, intensity: 0.85, seed: id });
  const payload: FxDragPayload = { type: "effect", effect: id };
  // Gerakan di contoh diperkecil karena ubinnya jauh lebih kecil daripada kanvas.
  const transform = result.transform?.replace(/(-?[\d.]+)px/g, (_, value: string) => `${Number(value) / 8}px`);
  return (
    <Tile
      label={label}
      hint={hint}
      addLabel={`Tambahkan efek ${label}`}
      onAdd={() => useEditor.getState().addFx(payload)}
      onDragStart={(event) => {
        event.dataTransfer.setData(FX_DRAG_TYPE, JSON.stringify(payload));
        event.dataTransfer.effectAllowed = "copy";
      }}
      onPointerEnter={clock.start}
      onPointerLeave={clock.stop}
    >
      <div className="absolute inset-0" style={{ ...SAMPLE_A, filter: result.filter?.replace(/blur\(([\d.]+)px\)/, (_, v: string) => `blur(${Number(v) / 6}px)`), transform }} />
      {result.overlay && <div className="absolute inset-0" style={result.overlay} />}
    </Tile>
  );
}

function EffectsTab() {
  const [category, setCategory] = React.useState<string>("popular");
  const shown = EFFECTS.filter(
    (entry) => category === "all" || (category === "popular" ? entry.popular : entry.category === category),
  );
  return (
    <div className="flex min-h-0 flex-1">
      <Categories items={[{ id: "popular", label: "Populer" }, { id: "all", label: "Semua" }, ...EFFECT_CATEGORIES]} value={category} onChange={setCategory} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ul className={gridClass}>
          {shown.map((entry) => (
            <EffectTile key={entry.id} {...entry} />
          ))}
        </ul>
        <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Klik + atau seret ke timeline. Efek berlaku untuk semua track di bawahnya.
        </p>
      </div>
    </div>
  );
}

// --- Transisi ---

function applyTransition(type: TransitionId) {
  const state = useEditor.getState();
  const found = state.project && state.selectedIds.length === 1 ? findItem(state.project, state.selectedIds[0]) : null;
  if (!found || (found.item.type !== "video" && found.item.type !== "image")) {
    toast.info("Pilih dulu satu klip video atau gambar", {
      description: "Transisi dipasang di awal klip yang dipilih. Bisa juga diseret langsung ke klipnya.",
    });
    return;
  }
  state.setTransition(found.item.id, { type, durationMs: found.item.transitionIn?.durationMs ?? 500 });
}

function TransitionTile({ id, label, hint }: { id: TransitionId; label: string; hint: string }) {
  const clock = useHoverClock();
  // Diam: tengah transisi. Disorot: berulang 0 → 1.
  const p = clock.time > 0 ? ease("ease-in-out", (clock.time % 1.4) / 1) : 0.5;
  const result = TRANSITION_RENDERERS[id](Math.min(1, p));
  return (
    <Tile
      label={label}
      hint={hint}
      addLabel={`Pasang transisi ${label} pada klip terpilih`}
      onAdd={() => applyTransition(id)}
      onDragStart={(event) => {
        event.dataTransfer.setData(TRANSITION_DRAG_TYPE, id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onPointerEnter={clock.start}
      onPointerLeave={clock.stop}
    >
      <div className="absolute inset-0" style={{ ...SAMPLE_A, ...result.outgoing }} />
      <div className="absolute inset-0" style={{ ...SAMPLE_B, ...result.incoming }} />
      {result.overlay && <div className="absolute inset-0" style={result.overlay} />}
    </Tile>
  );
}

function TransitionsTab() {
  const [category, setCategory] = React.useState<string>("popular");
  const shown = TRANSITIONS.filter(
    (entry) => category === "all" || (category === "popular" ? entry.popular : entry.category === category),
  );
  return (
    <div className="flex min-h-0 flex-1">
      <Categories items={[{ id: "popular", label: "Populer" }, { id: "all", label: "Semua" }, ...TRANSITION_CATEGORIES]} value={category} onChange={setCategory} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ul className={gridClass}>
          {shown.map((entry) => (
            <TransitionTile key={entry.id} {...entry} />
          ))}
        </ul>
        <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Pilih klip lalu klik +, atau seret transisi ke atas klip. Transisi dipasang di awal klip itu.
        </p>
      </div>
    </div>
  );
}

// --- Penyesuaian ---

function AdjustTab() {
  return (
    <div className="flex min-h-0 flex-1">
      <Categories items={[{ id: "preset", label: "Preset" }] as const} value="preset" onChange={() => undefined} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ul className={gridClass}>
          {ADJUST_PRESETS.map((preset) => {
            const adjust = { ...NEUTRAL_ADJUST, ...preset.adjust };
            const payload: FxDragPayload = { type: "adjustment", adjust: preset.adjust };
            const filterId = `kk-preview-${preset.id}`;
            const matrix = temperatureMatrix(adjust.temperature);
            const vignette = vignetteStyle(adjust.vignette);
            return (
              <Tile
                key={preset.id}
                label={preset.label}
                hint={preset.hint}
                addLabel={`Tambahkan lapisan penyesuaian ${preset.label}`}
                onAdd={() => useEditor.getState().addFx(payload)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(FX_DRAG_TYPE, JSON.stringify(payload));
                  event.dataTransfer.effectAllowed = "copy";
                }}
              >
                {matrix && (
                  <svg width="0" height="0" className="absolute" aria-hidden>
                    <filter id={filterId} colorInterpolationFilters="sRGB">
                      <feColorMatrix type="matrix" values={matrix} />
                    </filter>
                  </svg>
                )}
                <div className="absolute inset-0" style={{ ...SAMPLE_A, filter: adjustFilter(adjust, filterId) || undefined }} />
                {vignette && <div className="absolute inset-0" style={vignette} />}
              </Tile>
            );
          })}
        </ul>
        <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Menambah lapisan penyesuaian di atas video. Warna satu klip saja bisa diatur di panel Properti.
        </p>
      </div>
    </div>
  );
}

// --- Panel ---

export function LibraryPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = React.useState<Tab>("media");
  return (
    <section aria-label="Pustaka" className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface">
      <div role="tablist" aria-label="Menu" className="flex h-14 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-1.5">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex h-11 min-w-[58px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-medium transition-colors",
                tab === item.id ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "media" && <AssetsTab projectId={projectId} audio={false} />}
        {tab === "audio" && <AssetsTab projectId={projectId} audio />}
        {tab === "text" && <TextTab />}
        {tab === "tts" && <TtsPanel projectId={projectId} />}
        {tab === "effects" && <EffectsTab />}
        {tab === "transitions" && <TransitionsTab />}
        {tab === "adjust" && <AdjustTab />}
      </div>
    </section>
  );
}
