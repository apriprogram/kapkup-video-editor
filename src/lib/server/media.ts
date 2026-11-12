import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { assetSchema, type Asset } from "../project/schema";
import { projectDir } from "./workspace";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"]);
/** Codec video yang bisa diputar Chrome/Edge tanpa bantuan. */
const BROWSER_VIDEO_CODECS = new Set(["h264", "vp8", "vp9", "av1"]);

export const PEAKS_PER_SECOND = 50;

let cachedBins: Record<string, string> = {};

/**
 * Lokasi ffmpeg/ffprobe. Remotion membawa binarinya sendiri, jadi FFmpeg tidak
 * perlu dipasang terpisah; kalau tidak ketemu, dicoba dari PATH.
 */
export function ffBin(name: "ffmpeg" | "ffprobe"): string {
  if (cachedBins[name]) return cachedBins[name];
  const scope = path.join(process.cwd(), "node_modules", "@remotion");
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  let found: string = name;
  try {
    for (const dir of fs.readdirSync(scope)) {
      if (!dir.startsWith("compositor-")) continue;
      const candidate = path.join(scope, dir, exe);
      if (fs.existsSync(candidate)) {
        found = candidate;
        break;
      }
    }
  } catch {
    // Pakai PATH.
  }
  cachedBins = { ...cachedBins, [name]: found };
  return found;
}

export function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(bin)} gagal: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};

export type ProbeResult = {
  type: Asset["type"];
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  videoCodec: string | null;
};

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run(ffBin("ffprobe"), [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file,
  ]);
  const data = JSON.parse(out) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = streams.find((s) => s.codec_type === "audio");
  const ext = path.extname(file).toLowerCase();

  let type: Asset["type"];
  if (IMAGE_EXT.has(ext)) type = "image";
  else if (AUDIO_EXT.has(ext) || !video) type = "audio";
  else type = "video";
  if (type === "audio" && !audio) throw new Error("File tidak berisi video, gambar, atau audio yang dikenali");

  let width = video?.width ?? 0;
  let height = video?.height ?? 0;
  const rotation = Math.abs(
    Number(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0),
  );
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];

  const seconds = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  return {
    type,
    durationMs: type === "image" ? 0 : Math.max(0, Math.round(seconds * 1000)),
    width: type === "audio" ? 0 : width,
    height: type === "audio" ? 0 : height,
    hasAudio: type !== "image" && Boolean(audio),
    videoCodec: video?.codec_name ?? null,
  };
}

async function makeThumbnail(source: string, target: string, atSeconds: number | null): Promise<void> {
  await run(ffBin("ffmpeg"), [
    "-y", "-v", "error",
    // Gambar diam tidak boleh diberi -ss: hasilnya kosong.
    ...(atSeconds === null ? [] : ["-ss", atSeconds.toFixed(2)]),
    "-i", source, "-frames:v", "1",
    // Rentang warna penuh: encoder JPEG bawaan menolak rentang terbatas (mis. dari PNG).
    "-vf", "scale=320:-2:out_range=full,format=yuvj420p", "-q:v", "5", target,
  ]);
  if (!fs.existsSync(target)) throw new Error("Thumbnail tidak terbentuk");
}

/** Puncak gelombang audio (0–1), PEAKS_PER_SECOND nilai per detik. */
function makePeaks(source: string, target: string): Promise<void> {
  const sampleRate = 4000;
  const bucket = sampleRate / PEAKS_PER_SECOND;
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffBin("ffmpeg"),
      // FFmpeg bawaan Remotion tidak punya keluaran PCM mentah, jadi dipakai WAV lalu header-nya dilewati.
      ["-v", "error", "-i", source, "-vn", "-ac", "1", "-ar", String(sampleRate), "-c:a", "pcm_s16le", "-f", "wav", "-"],
      { windowsHide: true },
    );
    const peaks: number[] = [];
    let max = 0;
    let count = 0;
    let carry: Buffer | null = null;
    let headerSkipped = false;
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      let data: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
      if (!headerSkipped) {
        const marker = data.indexOf("data", 0, "ascii");
        if (marker < 0 || data.length < marker + 8) {
          carry = data;
          return;
        }
        data = data.subarray(marker + 8);
        headerSkipped = true;
      }
      const usable = data.length - (data.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const value = Math.abs(data.readInt16LE(i));
        if (value > max) max = value;
        if (++count === bucket) {
          peaks.push(Math.round((max / 32768) * 100) / 100);
          max = 0;
          count = 0;
        }
      }
      carry = usable < data.length ? data.subarray(usable) : null;
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg gagal membaca audio: ${stderr}`));
      if (count > 0) peaks.push(Math.round((max / 32768) * 100) / 100);
      fsp
        .writeFile(target, JSON.stringify({ perSecond: PEAKS_PER_SECOND, peaks }))
        .then(resolve, reject);
    });
  });
}

async function makeProxy(source: string, target: string): Promise<void> {
  await run(ffBin("ffmpeg"), [
    "-y", "-v", "error", "-i", source,
    "-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", target,
  ]);
}

export function isSupportedMedia(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext);
}

/** Nama file aman dan unik di dalam folder media project. */
export function uniqueMediaName(projectId: string, original: string): string {
  const mediaDir = path.join(projectDir(projectId), "media");
  const ext = path.extname(original).toLowerCase();
  const stem =
    path
      .basename(original, path.extname(original))
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "media";
  let name = `${stem}${ext}`;
  for (let n = 2; fs.existsSync(path.join(mediaDir, name)); n++) name = `${stem}-${n}${ext}`;
  return name;
}

/**
 * Mendaftarkan file yang SUDAH ada di folder `media/` project: membaca infonya,
 * membuat thumbnail, puncak audio, dan proxy bila perlu. Tidak mengubah project.json.
 */
export async function registerMedia(projectId: string, fileName: string, displayName?: string): Promise<Asset> {
  const dir = projectDir(projectId);
  const source = path.join(dir, "media", fileName);
  const info = await probe(source);
  const id = `a-${nanoid(8)}`;
  const cacheDir = path.join(dir, "cache");
  await fsp.mkdir(cacheDir, { recursive: true });

  let thumbnail: string | null = null;
  let peaks: string | null = null;
  let proxy: string | null = null;

  if (info.type !== "audio") {
    const at = info.type === "video" ? Math.min(1, info.durationMs / 2000) : null;
    try {
      await makeThumbnail(source, path.join(cacheDir, `${id}.jpg`), at);
      thumbnail = `cache/${id}.jpg`;
    } catch {
      // Tanpa thumbnail media tetap bisa dipakai.
    }
  }
  if (info.hasAudio) {
    try {
      await makePeaks(source, path.join(cacheDir, `${id}.peaks.json`));
      peaks = `cache/${id}.peaks.json`;
    } catch {
      // Gelombang audio hanya hiasan.
    }
  }
  if (info.type === "video" && info.videoCodec && !BROWSER_VIDEO_CODECS.has(info.videoCodec)) {
    await makeProxy(source, path.join(cacheDir, `${id}.proxy.mp4`));
    proxy = `cache/${id}.proxy.mp4`;
  }

  return assetSchema.parse({
    id,
    type: info.type,
    name: displayName ?? fileName,
    path: `media/${fileName}`,
    durationMs: info.durationMs,
    width: info.width,
    height: info.height,
    hasAudio: info.hasAudio,
    thumbnail,
    peaks,
    proxy,
  });
}
