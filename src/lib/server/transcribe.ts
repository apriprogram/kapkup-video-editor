import fsp from "node:fs/promises";
import path from "node:path";
import {
  downloadWhisperModel,
  installWhisperCpp,
  toCaptions,
  transcribe,
  type Language,
  type WhisperModel,
} from "@remotion/install-whisper-cpp";
import { wordsForClip, wordsFromTokens } from "../project/captions";
import type { CaptionWord } from "../project/schema";
import { findItem } from "../timeline/ops";
import { ffBin, run } from "./media";
import { DEFAULT_WHISPER_MODEL, WHISPER_VERSION, whisperDir } from "./whisper-config";
import { WorkspaceError, projectDir, readProject } from "./workspace";

/**
 * Caption otomatis dengan Whisper.cpp (berjalan lokal, tanpa layanan cloud).
 * Pemakaian pertama mengunduh program Whisper dan file modelnya ke .kapkup/whisper.
 */

// File ini mengimpor paket Whisper, jadi hanya boleh dipakai dari skrip CLI, bukan route handler.

export type TranscribeResult = {
  words: CaptionWord[];
  placement: { startMs: number; inMs: number; durationMs: number };
};

export async function transcribeClip(
  projectId: string,
  itemId: string,
  options: { model?: WhisperModel; language?: string | null; log?: (message: string) => void } = {},
): Promise<TranscribeResult> {
  const model = options.model ?? DEFAULT_WHISPER_MODEL;
  const log = options.log ?? (() => undefined);
  const { project } = await readProject(projectId);
  const found = findItem(project, itemId);
  if (!found || (found.item.type !== "video" && found.item.type !== "audio")) {
    throw new WorkspaceError("Klip video atau audio tidak ditemukan", 404);
  }
  const item = found.item;
  const asset = project.assets.find((candidate) => candidate.id === item.assetId);
  if (!asset) throw new WorkspaceError("Media klip ini tidak ada", 404);
  if (!asset.hasAudio) throw new WorkspaceError("Klip ini tidak punya suara");

  const dir = projectDir(projectId);
  const speed = item.type === "video" ? item.speed : 1;
  const wav = path.join(dir, "cache", `${item.id}.16k.wav`);
  await fsp.mkdir(path.dirname(wav), { recursive: true });

  try {
    // Whisper membutuhkan WAV 16-bit 16 kHz; hanya bagian sumber yang dipakai klip yang diambil.
    log("Menyiapkan audio…");
    await run(ffBin("ffmpeg"), [
      "-y", "-v", "error",
      "-ss", (item.inMs / 1000).toFixed(3),
      "-t", ((item.durationMs * speed) / 1000).toFixed(3),
      "-i", path.join(dir, asset.path),
      "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav,
    ]);

    const to = whisperDir();
    log("Memeriksa program Whisper (diunduh bila belum ada)…");
    await installWhisperCpp({ to, version: WHISPER_VERSION, printOutput: false });
    log(`Memeriksa model "${model}" (diunduh bila belum ada)…`);
    await downloadWhisperModel({ model, folder: to, printOutput: false });

    log("Mentranskripsi…");
    const whisperCppOutput = await transcribe({
      inputPath: wav,
      whisperPath: to,
      whisperCppVersion: WHISPER_VERSION,
      model,
      modelFolder: to,
      tokenLevelTimestamps: true,
      language: (options.language || null) as Language | null,
      printOutput: false,
    });
    const { captions } = toCaptions({ whisperCppOutput });
    // Waktu dari Whisper dihitung dari awal potongan audio, yaitu awal klip.
    const words = wordsForClip(wordsFromTokens(captions), { inMs: 0, durationMs: item.durationMs, speed });
    return { words, placement: { startMs: item.startMs, inMs: 0, durationMs: item.durationMs } };
  } finally {
    await fsp.rm(wav, { force: true });
  }
}
