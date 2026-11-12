import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fail, type IdContext } from "@/lib/server/http";
import { ffBin } from "@/lib/server/media";
import { projectDir, readProject } from "@/lib/server/workspace";

/** Satu frame kecil (tinggi 96 px) pada waktu tertentu. */
function makeFrame(source: string, target: string, atSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      ffBin("ffmpeg"),
      [
        "-y", "-v", "error", "-ss", atSeconds.toFixed(2), "-i", source, "-frames:v", "1",
        "-vf", "scale=-2:96:out_range=full,format=yuvj420p", "-q:v", "6", target,
      ],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`ffmpeg gagal: ${stderr || error.message}`));
        else if (!fs.existsSync(target)) reject(new Error("Frame tidak terbentuk"));
        else resolve();
      },
    );
  });
}

/** Frame yang sedang dibuat, supaya permintaan kembar tidak menjalankan FFmpeg dua kali. */
const pending = new Map<string, Promise<void>>();

/**
 * Gambar kecil satu frame video (`?asset=<id>&ms=<waktu>`), untuk deretan
 * thumbnail di klip timeline. Dibuat saat pertama diminta lalu disimpan di cache/frames.
 */
export async function GET(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const assetId = url.searchParams.get("asset") ?? "";
    const ms = Math.max(0, Math.round(Number(url.searchParams.get("ms") ?? "0")));
    if (!/^[\w-]+$/.test(assetId) || !Number.isFinite(ms)) {
      return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
    }
    const dir = projectDir(id);
    const file = path.join(dir, "cache", "frames", `${assetId}-${ms}.jpg`);

    if (!fs.existsSync(file)) {
      let job = pending.get(file);
      if (!job) {
        job = (async () => {
          const { project } = await readProject(id);
          const asset = project.assets.find((candidate) => candidate.id === assetId);
          if (!asset || asset.type !== "video") throw new Error("Video tidak ditemukan");
          await fsp.mkdir(path.dirname(file), { recursive: true });
          await makeFrame(path.join(dir, asset.path), file, ms / 1000);
        })().finally(() => pending.delete(file));
        pending.set(file, job);
      }
      await job;
    }

    const data = await fsp.readFile(file);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=604800" },
    });
  } catch (error) {
    return fail(error);
  }
}
