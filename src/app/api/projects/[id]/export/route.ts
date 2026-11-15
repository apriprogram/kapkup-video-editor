import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CANCEL_FILE, IDLE_JOB, JOB_FILE, isRunning, type ExportJob } from "@/lib/project/export-job";
import { checkProject, contentDurationMs } from "@/lib/project/schema";
import { fail, type IdContext } from "@/lib/server/http";
import { readProject, resolveInProject, slugify } from "@/lib/server/workspace";

const startSchema = z.object({
  /** Sisi pendek hasil dalam piksel (mis. 720). Kosong = ukuran asli kanvas. */
  shortSide: z.number().int().min(144).max(4320).optional(),
  format: z.enum(["mp4", "gif", "mp3"]).default("mp4"),
  quality: z.enum(["high", "standard", "small"]).default("standard"),
});

/** CRF H.264: makin kecil makin tajam dan makin besar filenya. */
const CRF = { high: 14, standard: 18, small: 26 } as const;

/** H.264 mewajibkan lebar dan tinggi genap; skala digeser sedikit bila hasilnya ganjil. */
function evenScale(width: number, height: number, scale: number): number {
  if (scale >= 1) return 1;
  for (let step = 0; step <= 8; step++) {
    for (const outWidth of [Math.round(width * scale) + step, Math.round(width * scale) - step]) {
      const candidate = outWidth / width;
      const outHeight = height * candidate;
      if (outWidth > 0 && outWidth % 2 === 0 && Number.isInteger(outHeight) && outHeight % 2 === 0) return candidate;
    }
  }
  return 1;
}

function alive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJob(id: string): Promise<ExportJob> {
  try {
    const job = JSON.parse(await fsp.readFile(resolveInProject(id, JOB_FILE), "utf8")) as ExportJob;
    // Proses render yang mati di tengah jalan tidak sempat menulis status akhirnya.
    if (isRunning(job) && !alive(job.pid) && Date.now() - job.startedAt > 5000) {
      return { ...job, status: "error", error: "Proses export berhenti sebelum selesai" };
    }
    if (job.status === "done" && job.output) {
      // File hasil bisa saja sudah dipindah atau dihapus pengguna; saat itu tidak ada lagi yang bisa diunduh.
      const stat = await fsp.stat(resolveInProject(id, job.output)).catch(() => null);
      return stat ? { ...job, sizeBytes: stat.size } : IDLE_JOB;
    }
    return job;
  } catch {
    return IDLE_JOB;
  }
}

export async function GET(_request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    return Response.json(await readJob(id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    const body = startSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return Response.json({ error: "Pengaturan export tidak valid" }, { status: 400 });

    const { project } = await readProject(id);
    if (contentDurationMs(project) === 0) {
      return Response.json({ error: "Timeline masih kosong" }, { status: 400 });
    }
    const issues = checkProject(project);
    if (issues.length > 0) {
      return Response.json({ error: `Project bermasalah: ${issues[0]}` }, { status: 422 });
    }
    if (isRunning(await readJob(id))) {
      return Response.json({ error: "Export lain masih berjalan" }, { status: 409 });
    }

    const { width, height } = project.settings;
    const shortSide = Math.min(width, height);
    const { format, quality } = body.data;
    const wanted = body.data.shortSide && body.data.shortSide < shortSide ? body.data.shortSide / shortSide : 1;
    const scale = format === "mp4" ? evenScale(width, height, wanted) : wanted;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const output = `exports/${slugify(project.name)}-${stamp}.${format}`;

    await fsp.mkdir(resolveInProject(id, "exports"), { recursive: true });
    await fsp.rm(resolveInProject(id, CANCEL_FILE), { force: true });

    const root = process.cwd();
    const child = spawn(
      process.execPath,
      [
        path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(root, "scripts", "render.ts"),
        "--project", id,
        "--out", output,
        "--scale", String(scale),
        "--format", format,
        "--crf", String(CRF[quality]),
      ],
      { cwd: root, stdio: "ignore", windowsHide: true, detached: true },
    );
    child.unref();

    const job: ExportJob = {
      status: "starting",
      progress: 0,
      output,
      error: null,
      startedAt: Date.now(),
      pid: child.pid ?? null,
    };
    await fsp.writeFile(resolveInProject(id, JOB_FILE), JSON.stringify(job));
    return Response.json(job, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}

/** Minta proses render berhenti; ia memeriksa file penanda ini secara berkala. */
export async function DELETE(_request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    await fsp.writeFile(resolveInProject(id, CANCEL_FILE), "");
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
