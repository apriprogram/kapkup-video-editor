/** Status proses export, ditulis oleh scripts/render.ts dan dibaca oleh API. */
export type ExportJob = {
  status: "idle" | "starting" | "bundling" | "rendering" | "done" | "error" | "cancelled";
  /** 0–1 */
  progress: number;
  /** Path hasil relatif terhadap folder project, mis. "exports/video.mp4". */
  output: string | null;
  error: string | null;
  startedAt: number;
  pid: number | null;
  /** Ukuran file hasil dalam byte; diisi API saat export sudah selesai. */
  sizeBytes?: number;
};

export const JOB_FILE = "exports/.job.json";
export const CANCEL_FILE = "exports/.cancel";

export const IDLE_JOB: ExportJob = {
  status: "idle",
  progress: 0,
  output: null,
  error: null,
  startedAt: 0,
  pid: null,
};

export function isRunning(job: ExportJob): boolean {
  return job.status === "starting" || job.status === "bundling" || job.status === "rendering";
}
