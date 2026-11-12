/**
 * Proses render Kapkup (dijalankan terpisah dari Next.js).
 *
 *   tsx scripts/render.ts --project <id> --out exports/video.mp4 [--scale 0.5] [--format mp4|gif|mp3] [--crf 18]
 *       [--vars '{"nama":"Budi"}']
 *   tsx scripts/render.ts --project <id> --still cache/frame.png --ms 1500 [--scale 0.25]
 *
 * Membundel komposisi di src/remotion, menyajikan folder project lewat server
 * lokal sementara, lalu merender. Kemajuan ditulis ke exports/.job.json.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { CANCEL_FILE, JOB_FILE, type ExportJob } from "../src/lib/project/export-job";
import { checkProject, msToFrame } from "../src/lib/project/schema";
import { projectDir, readProject } from "../src/lib/server/workspace";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** Server file sederhana dengan dukungan Range, hanya untuk folder project ini. */
function serveFolder(root: string): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent((request.url ?? "/").split("?")[0]).replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Access-Control-Allow-Origin", "*");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      response.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(response);
    } else {
      response.writeHead(200, { "Content-Length": size });
      fs.createReadStream(file).pipe(response);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

/**
 * Membundel komposisi butuh waktu lama, padahal kodenya jarang berubah.
 * Bundel disimpan di .kapkup/bundle dan dipakai ulang selama file sumbernya sama.
 */
async function cachedBundle(onProgress: (percent: number) => void): Promise<string> {
  const root = process.cwd();
  const outDir = path.join(root, ".kapkup", "bundle");
  const stamp = path.join(outDir, ".signature");
  const sources = [path.join(root, "src", "remotion"), path.join(root, "src", "lib", "project")];
  const parts: string[] = [fs.readFileSync(path.join(root, "node_modules", "remotion", "package.json"), "utf8").length.toString()];
  for (const folder of sources) {
    for (const entry of fs.readdirSync(folder, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name);
      const stat = fs.statSync(file);
      parts.push(`${path.relative(root, file)}:${stat.size}:${Math.round(stat.mtimeMs)}`);
    }
  }
  const signature = parts.sort().join("\n");
  if (fs.existsSync(path.join(outDir, "index.html")) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === signature) {
    onProgress(100);
    return outDir;
  }
  await fsp.rm(outDir, { recursive: true, force: true });
  await bundle({ entryPoint: path.join(root, "src", "remotion", "index.ts"), outDir, onProgress });
  await fsp.writeFile(stamp, signature);
  return outDir;
}

async function main() {
  const id = argument("project");
  const out = argument("out");
  const still = argument("still");
  const scale = Number(argument("scale") ?? "1");
  const format = (argument("format") ?? "mp4") as "mp4" | "gif" | "mp3";
  const crf = Number(argument("crf") ?? "18");
  if (!id || (!out && !still)) {
    console.error("Pemakaian: render.ts --project <id> (--out <file.mp4> | --still <file.png> --ms <waktu>)");
    process.exit(2);
  }

  const dir = projectDir(id);
  const jobFile = path.join(dir, JOB_FILE);
  const cancelFile = path.join(dir, CANCEL_FILE);
  const trackJob = Boolean(out);
  const job: ExportJob = {
    status: "bundling",
    progress: 0,
    output: out ?? null,
    error: null,
    startedAt: Date.now(),
    pid: process.pid,
  };
  let lastWrite = 0;
  const writeJob = async (patch: Partial<ExportJob>, force = false) => {
    Object.assign(job, patch);
    if (!trackJob) return;
    if (!force && Date.now() - lastWrite < 250) return;
    lastWrite = Date.now();
    await fsp.mkdir(path.dirname(jobFile), { recursive: true });
    await fsp.writeFile(jobFile, JSON.stringify(job));
  };

  const media = await serveFolder(dir);
  const { cancelSignal, cancel } = makeCancelSignal();
  let cancelled = false;
  const watcher = setInterval(() => {
    if (fs.existsSync(cancelFile)) {
      cancelled = true;
      cancel();
    }
  }, 500);

  try {
    await writeJob({}, true);
    const { project } = await readProject(id);
    // Variabel dari baris perintah menimpa nilai di project (video berparameter).
    const overrides = argument("vars");
    if (overrides) Object.assign(project.variables, JSON.parse(overrides) as Record<string, string>);
    const issues = checkProject(project);
    if (issues.length > 0) throw new Error(`Project bermasalah: ${issues[0]}`);

    const serveUrl = await cachedBundle((percent) => void writeJob({ progress: (percent / 100) * 0.1 }));
    const inputProps = { project, mediaBase: media.url, preview: false };
    const composition = await selectComposition({ serveUrl, id: "Kapkup", inputProps });

    if (still) {
      const frame = Math.min(composition.durationInFrames - 1, msToFrame(Number(argument("ms") ?? "0"), composition.fps));
      const output = path.join(dir, still);
      await fsp.mkdir(path.dirname(output), { recursive: true });
      await renderStill({ composition, serveUrl, inputProps, output, frame: Math.max(0, frame), scale });
      console.log(output);
      return;
    }

    const outputLocation = path.join(dir, out!);
    await fsp.mkdir(path.dirname(outputLocation), { recursive: true });
    await writeJob({ status: "rendering", progress: 0.1 }, true);
    try {
      await renderMedia({
        composition,
        serveUrl,
        codec: format === "gif" ? "gif" : format === "mp3" ? "mp3" : "h264",
        crf: format === "mp4" ? crf : undefined,
        outputLocation,
        inputProps,
        scale,
        cancelSignal,
        onProgress: ({ progress }) => void writeJob({ progress: 0.1 + progress * 0.9 }),
      });
    } catch (error) {
      if (!cancelled) throw error;
      await fsp.rm(outputLocation, { force: true });
      await writeJob({ status: "cancelled", output: null }, true);
      return;
    }
    await writeJob({ status: "done", progress: 1 }, true);
    console.log(outputLocation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJob({ status: "error", error: message.split("\n")[0].slice(0, 400), output: null }, true);
    console.error(message);
    process.exitCode = 1;
  } finally {
    clearInterval(watcher);
    media.close();
    await fsp.rm(cancelFile, { force: true });
  }
}

void main().then(() => process.exit(process.exitCode ?? 0));
