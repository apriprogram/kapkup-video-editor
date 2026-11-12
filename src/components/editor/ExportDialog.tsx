"use client";

import { CircleAlert, CircleCheck, Download, X } from "lucide-react";
import * as React from "react";
import { isRunning, type ExportJob } from "@/lib/project/export-job";
import { contentDurationMs } from "@/lib/project/schema";
import { cn, formatTime } from "@/lib/utils";
import { pausePlayer, useEditor } from "@/store/editor";
import { Button, IconButton } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";

const STAGE_LABEL: Partial<Record<ExportJob["status"], string>> = {
  starting: "Menyiapkan…",
  bundling: "Menyiapkan mesin render…",
  rendering: "Merender video…",
};

export function ExportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const project = useEditor((state) => state.project);
  const unsaved = useEditor((state) => state.dirty || state.saveState === "saving");
  const [job, setJob] = React.useState<ExportJob | null>(null);
  const [shortSide, setShortSide] = React.useState<number | null>(null);
  const [format, setFormat] = React.useState<"mp4" | "gif" | "mp3">("mp4");
  const [quality, setQuality] = React.useState<"high" | "standard" | "small">("standard");
  const [error, setError] = React.useState<string | null>(null);
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
      .then((data) => !cancelled && data && setJob(data))
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
  const options = [
    { value: null, label: `Asli (${width}×${height})` },
    ...[720, 480]
      .filter((side) => side < native)
      .map((side) => ({
        value: side,
        label: `${side}p (${Math.round((width * side) / native)}×${Math.round((height * side) / native)})`,
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
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const cancel = async () => {
    await fetch(endpoint, { method: "DELETE" });
  };

  const fileUrl = job?.output ? `/api/projects/${projectId}/files/${job.output}` : null;
  const percent = Math.round((job?.progress ?? 0) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        tabIndex={-1}
        onKeyDown={(event) => event.key === "Escape" && !running && onClose()}
        className="w-full max-w-md rounded-lg border border-border bg-surface shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="export-title" className="text-sm font-semibold">
            Export video
          </h2>
          <IconButton label="Tutup" onClick={onClose} disabled={running}>
            <X />
          </IconButton>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          {running ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              <div className="flex items-center justify-between text-sm">
                <span>{STAGE_LABEL[job.status]}</span>
                <span className="text-muted-foreground tabular-nums">{percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">Kamu boleh menutup tab; export tetap berjalan di komputer ini.</p>
            </div>
          ) : (
            <>
              {job?.status === "done" && fileUrl && (
                <div className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm" role="status">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <div className="min-w-0">
                    <p className="font-medium">Export selesai</p>
                    <p className="text-xs break-all text-muted-foreground">Tersimpan di folder project: {job.output}</p>
                  </div>
                </div>
              )}
              {(job?.status === "error" || error) && (
                <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm" role="alert">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="font-medium">Export gagal</p>
                    <p className="text-xs break-words text-muted-foreground">{error ?? job?.error}</p>
                  </div>
                </div>
              )}
              {job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Export dibatalkan.</p>}

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xs font-semibold">Resolusi</legend>
                {options.map((option) => (
                  <label
                    key={option.label}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      shortSide === option.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      className="accent-primary"
                      checked={shortSide === option.value}
                      onChange={() => setShortSide(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <SelectField
                label="Format"
                value={format}
                onChange={setFormat}
                options={[
                  { value: "mp4", label: "Video MP4 (H.264)" },
                  { value: "gif", label: "GIF (tanpa suara)" },
                  { value: "mp3", label: "Audio saja (MP3)" },
                ]}
              />
              {format === "mp4" && (
                <SelectField
                  label="Kualitas"
                  value={quality}
                  onChange={setQuality}
                  options={[
                    { value: "high", label: "Tinggi (file besar)" },
                    { value: "standard", label: "Standar" },
                    { value: "small", label: "Hemat (file kecil)" },
                  ]}
                />
              )}
              <p className="text-xs text-muted-foreground">
                {project.settings.fps} fps · durasi {formatTime(contentDurationMs(project))}
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          {running ? (
            <Button variant="danger" onClick={cancel}>
              Batalkan
            </Button>
          ) : (
            <>
              {job?.status === "done" && fileUrl && (
                <a href={`${fileUrl}?download=1`} download>
                  <Button variant="secondary">
                    <Download className="size-4" />
                    Unduh
                  </Button>
                </a>
              )}
              <Button variant="primary" onClick={start} disabled={unsaved} title={unsaved ? "Menunggu project tersimpan" : undefined}>
                {job?.status === "done" ? "Export lagi" : "Mulai export"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
