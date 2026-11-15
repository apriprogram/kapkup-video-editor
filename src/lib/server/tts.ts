import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { GenerationConfig, OfflineTts, writeWave } from "sherpa-onnx-node";
import type { Asset } from "../project/schema";
import { registerMedia, uniqueMediaName } from "./media";
import {
  TTS_DOWNLOAD_MB,
  TTS_LANGUAGES,
  TTS_MAX_CHARS,
  TTS_MODEL_FILES,
  TTS_MODEL_URL,
  TTS_VOICES,
  ttsDir,
  ttsModelDir,
  ttsReady,
  type TtsLanguage,
} from "./tts-config";
import { WorkspaceError, projectDir, statProject } from "./workspace";

/**
 * Teks ke suara dengan Supertonic 3 (sherpa-onnx), berjalan lokal tanpa layanan cloud.
 * Pemakaian pertama mengunduh modelnya ke .kapkup/tts.
 */

// File ini mengimpor paket natif sherpa-onnx, jadi hanya boleh dipakai dari skrip CLI, bukan route handler.

type Log = (message: string) => void;

function runTar(archive: string, into: string): Promise<void> {
  // Di Windows dipakai tar bawaan sistem (bsdtar): tar milik Git membaca "F:\..." sebagai nama host.
  const bin = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-xjf", archive, "-C", into], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", () => reject(new Error("Program tar tidak ditemukan untuk membuka model suara")));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Gagal membuka model suara: ${stderr.trim().slice(0, 200)}`))));
  });
}

/** Mengunduh dan membuka model bila belum ada. Aman dipanggil berulang. */
export async function installTts(log: Log = () => undefined): Promise<void> {
  if (ttsReady()) return;
  const dir = ttsDir();
  await fsp.mkdir(dir, { recursive: true });
  const archive = path.join(dir, "model.tar.bz2");
  try {
    log(`Mengunduh model suara (${TTS_DOWNLOAD_MB} MB, sekali saja)…`);
    const response = await fetch(TTS_MODEL_URL);
    if (!response.ok || !response.body) throw new Error(`Gagal mengunduh model suara (HTTP ${response.status})`);
    const total = Number(response.headers.get("content-length")) || 0;
    let received = 0;
    let shown = -1;
    const source = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
    source.on("data", (chunk: Buffer) => {
      received += chunk.length;
      const percent = total ? Math.floor((received / total) * 10) * 10 : -1;
      if (percent !== shown) {
        shown = percent;
        if (percent >= 0) log(`Mengunduh model suara… ${percent}%`);
      }
    });
    await pipeline(source, fs.createWriteStream(archive));
    log("Membuka model suara…");
    await runTar(archive, dir);
    if (!ttsReady()) throw new Error("Model suara terunduh tetapi isinya tidak lengkap");
  } finally {
    await fsp.rm(archive, { force: true });
  }
}

let engine: OfflineTts | null = null;

function loadEngine(): OfflineTts {
  if (engine) return engine;
  const file = (name: keyof typeof TTS_MODEL_FILES) => path.join(ttsModelDir(), TTS_MODEL_FILES[name]);
  engine = new OfflineTts({
    model: {
      supertonic: {
        durationPredictor: file("durationPredictor"),
        textEncoder: file("textEncoder"),
        vectorEstimator: file("vectorEstimator"),
        vocoder: file("vocoder"),
        ttsJson: file("ttsJson"),
        unicodeIndexer: file("unicodeIndexer"),
        voiceStyle: file("voiceStyle"),
      },
      numThreads: 2,
      provider: "cpu",
      debug: false,
    },
    maxNumSentences: 1,
  });
  return engine;
}

export type SpeakOptions = {
  /** Nomor suara, lihat TTS_VOICES. */
  voice?: number;
  /** 1 = kecepatan normal. */
  speed?: number;
  language?: TtsLanguage;
  log?: Log;
};

/**
 * Membuat file suara dari teks di folder `media/` project dan mendaftarkannya sebagai aset.
 * Tidak mengubah project.json; pemanggil yang menambahkan asetnya ke project.
 */
export async function speak(projectId: string, text: string, options: SpeakOptions = {}): Promise<Asset> {
  const log = options.log ?? (() => undefined);
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new WorkspaceError("Teks masih kosong");
  if (clean.length > TTS_MAX_CHARS) throw new WorkspaceError(`Teks terlalu panjang (maksimal ${TTS_MAX_CHARS} karakter)`);
  const voice = TTS_VOICES.find((candidate) => candidate.id === (options.voice ?? 0));
  if (!voice) throw new WorkspaceError("Suara tidak dikenal");
  const language = options.language ?? "id";
  if (!TTS_LANGUAGES.some((candidate) => candidate.value === language)) throw new WorkspaceError("Bahasa tidak didukung");
  const speed = Math.min(2, Math.max(0.5, options.speed ?? 1));
  await statProject(projectId);

  await installTts(log);
  log("Membuat suara…");
  const audio = loadEngine().generate({
    text: clean,
    enableExternalBuffer: false,
    generationConfig: new GenerationConfig({ sid: voice.id, speed, numSteps: 10, extra: { lang: language } }),
  });
  if (audio.samples.length === 0) throw new WorkspaceError("Suara tidak berhasil dibuat dari teks ini");
  // Tiap suara keluar dengan kekerasan berbeda (puncak 0,3–0,6); disamakan ke sekitar -1 dB.
  let peak = 0;
  for (const sample of audio.samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0.01) {
    const gain = 0.89 / peak;
    for (let i = 0; i < audio.samples.length; i++) audio.samples[i] *= gain;
  }

  const mediaDir = path.join(projectDir(projectId), "media");
  await fsp.mkdir(mediaDir, { recursive: true });
  const title = clean.split(" ").slice(0, 5).join(" ");
  const fileName = uniqueMediaName(projectId, `suara-${title}.wav`);
  const target = path.join(mediaDir, fileName);
  try {
    writeWave(target, { samples: audio.samples, sampleRate: audio.sampleRate });
    return await registerMedia(projectId, fileName, `Suara: ${title}${clean.length > title.length ? "…" : ""}`);
  } catch (error) {
    await fsp.rm(target, { force: true });
    throw error;
  }
}
