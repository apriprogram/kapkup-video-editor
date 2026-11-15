"use client";

import { CircleAlert, CircleCheck, Download, Film, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { isRunning, type ExportJob } from "@/lib/project/export-job";
import { contentDurationMs } from "@/lib/project/schema";
import { cn, formatTime } from "@/lib/utils";
import { pausePlayer, useEditor } from "@/store/editor";
import { Button, IconButton, buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Format = "mp4" | "gif" | "mp3";
type Quality = "high" | "standard" | "small";

const STAGE_LABEL: Partial<Record<ExportJob["status"], string>> = {
  starting: "Menyiapkan…",
  bundling: "Menyiapkan mesin render…",
  rendering: "Merender video…",
};

const FORMATS: { value: Format; label: string }[] = [
  { value: "mp4", label: "Video MP4 (H.264)" },
  { value: "gif", label: "GIF (tanpa suara)" },
  { value: "mp3", label: "Audio saja (MP3)" },
];

const QUALITIES: { value: Quality; label: string }[] = [
  { value: "high", label: "Tinggi (file besar)" },
  { value: "standard", label: "Standar" },
  { value: "small", label: "Hemat (file kecil)" },
];

/** 12_400_000 -> "12,4 MB". */
function fileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function ExportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const project = useEditor((state) => state.project);
  const unsaved = useEditor((state) => state.dirty || state.saveState === "saving");
  const [job, setJob] = React.useState<ExportJob | null>(null);
  const [shortSide, setShortSide] = React.useState<number | null>(null);
  const [format, setFormat] = React.useState<Format>("mp4");
  const [quality, setQuality] = React.useState<Quality>("standard");
  const [error, setError] = React.useState<string | null>(null);
  // Hasil hanya ditampilkan sebagai layar "siap diunduh" bila rendernya diikuti di dialog ini;
  // export lama cukup muncul sebagai tautan kecil di bawah pengaturan.
  const [watched, setWatched] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const endpoint = `/api/projects/${projectId}/export`;

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.ok) setJob((await response.json()) as ExportJob);
    } catch {
      // Dicoba lagi pada putaran berikutnya.
    }
  }, [endpoint]);

  React.useEffect(() => {
    pausePlayer();
    dialogRef.current?.focus();
    let cancelled = false;
    fetch(endpoint, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ExportJob>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setJob(data);
        if (isRunning(data)) setWatched(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const running = job !== null && isRunning(job);
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, 700);
    return () => clearInterval(timer);
  }, [running, refresh]);

  if (!project) return null;
  const { width, height } = project.settings;
  const native = Math.min(width, height);
  const resolutions = [
    { value: null as number | null, label: "Asli", size: `${width}×${height}` },
    ...[720, 480]
      .filter((side) => side < native)
      .map((side) => ({
        value: side as number | null,
        label: `${side}p`,
        size: `${Math.round((width * side) / native)}×${Math.round((height * side) / native)}`,
      })),
  ];

  const start = async () => {
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, quality, ...(shortSide ? { shortSide } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Export gagal dimulai");
      setJob(data as ExportJob);
      setWatched(true);
      setShowSettings(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const cancel = async () => {
    await fetch(endpoint, { method: "DELETE" });
  };

  const fileUrl = job?.status === "done" && job.output ? `/api/projects/${projectId}/files/${job.output}` : null;
  const fileName = job?.output?.split("/").pop() ?? "";
  const extension = fileName.split(".").pop() ?? "";
  const percent = Math.round((job?.progress ?? 0) * 100);
  const view = running ? "progress" : fileUrl && watched && !showSettings ? "done" : "settings";
  const failure = error ?? (job?.status === "error" ? job.error : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        onKeyDown={(event) => event.key === "Escape" && !running && onClose()}
        className="flex max-h-full w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-center justify-between py-3 pr-3 pl-5">
          <h2 id="export-title" className="text-sm font-semibold">
            {view === "done" ? "Export selesai" : view === "progress" ? "Mengexport" : "Export"}
          </h2>
          <IconButton
            label={running ? "Tutup (export tetap berjalan)" : "Tutup"}
            onClick={onClose}
          >
            <X />
          </IconButton>
        </div>

        {view === "progress" && (
          <div className="flex flex-col gap-5 px-5 pt-2 pb-5" aria-live="polite">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{STAGE_LABEL[job?.status ?? "starting"]}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{fileName}</p>
              </div>
              <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
                {percent}
                <span className="text-base font-medium text-muted-foreground">%</span>
              </p>
            </div>
            <div
              role="progressbar"
              aria-label="Kemajuan export"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, percent)}%` }} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Dialog ini boleh ditutup. Export tetap berjalan di komputer ini, dan tombol unduh muncul di sini begitu selesai.
            </p>
            <Button variant="danger" onClick={cancel} className="self-end">
              Batalkan export
            </Button>
          </div>
        )}

        {view === "done" && fileUrl && (
          <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
            <div className="overflow-hidden rounded-xl bg-stage">
              {extension === "mp4" && <video src={fileUrl} controls preload="metadata" className="mx-auto block max-h-56 w-full" />}
              {extension === "gif" && (
                // eslint-disable-next-line @next/next/no-img-element -- hasil export lokal
                <img src={fileUrl} alt="Pratinjau GIF hasil export" className="mx-auto block max-h-56" />
              )}
              {extension === "mp3" && <audio src={fileUrl} controls className="block w-full p-3" />}
            </div>
            <div className="flex items-start gap-3" role="status">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium">File siap diunduh</p>
                <p className="mt-0.5 text-xs break-all text-muted-foreground">
                  {fileName}
                  {job?.sizeBytes ? ` · ${fileSize(job.sizeBytes)}` : ""}
                </p>
              </div>
            </div>
            <a href={`${fileUrl}?download=1`} download={fileName} className={buttonClass("primary", "md", "h-10 w-full")}>
              <Download className="size-4" aria-hidden />
              Unduh {extension === "mp3" ? "audio" : extension === "gif" ? "GIF" : "video"}
            </a>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setShowSettings(true)}>
                <RotateCcw className="size-3.5" aria-hidden />
                Export lagi
              </Button>
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                Tutup
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">File juga tersimpan di folder project: {job?.output}</p>
          </div>
        )}

        {view === "settings" && (
          <>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pt-1 pb-4">
              {failure && (
                <div className="flex items-start gap-2.5 rounded-xl bg-danger/10 p-3" role="alert">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Export gagal</p>
                    <p className="mt-0.5 text-xs break-words text-muted-foreground">{failure}</p>
                  </div>
                </div>
              )}
              {job?.status === "cancelled" && !failure && <p className="text-xs text-muted-foreground">Export sebelumnya dibatalkan.</p>}

              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Resolusi</legend>
                <div className="grid grid-cols-3 gap-2">
                  {resolutions.map((option) => {
                    const checked = shortSide === option.value;
                    return (
                      <label
                        key={option.label}
                        className={cn(
                          "flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition-colors",
                          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring",
                          checked ? "border-primary bg-primary/10" : "border-border hover:border-input hover:bg-muted",
                        )}
                      >
                        <input
                          type="radio"
                          name="resolution"
                          className="sr-only"
                          checked={checked}
                          onChange={() => setShortSide(option.value)}
                        />
                        <span className={cn("text-sm font-semibold", checked && "text-primary")}>{option.label}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{option.size}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Format">
                  <Select aria-label="Format" className="h-9 rounded-lg px-3 text-sm" value={format} onChange={setFormat} options={FORMATS} />
                </Field>
                <Field label="Kualitas">
                  <Select
                    aria-label="Kualitas"
                    className="h-9 rounded-lg px-3 text-sm"
                    value={quality}
                    onChange={setQuality}
                    options={QUALITIES}
                    disabled={format !== "mp4"}
                  />
                </Field>
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Film className="size-3.5" aria-hidden />
                {project.settings.fps} fps · durasi {formatTime(contentDurationMs(project))}
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-4">
              <Button
                variant="primary"
                className="h-10 w-full"
                onClick={start}
                disabled={unsaved}
                title={unsaved ? "Menunggu project tersimpan" : undefined}
              >
                {unsaved ? "Menyimpan project…" : "Mulai export"}
              </Button>
              {fileUrl && (
                <a
                  href={`${fileUrl}?download=1`}
                  download={fileName}
                  className="flex items-center justify-center gap-1.5 rounded-md py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    Unduh export terakhir: {fileName}
                    {job?.sizeBytes ? ` (${fileSize(job.sizeBytes)})` : ""}
                  </span>
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
