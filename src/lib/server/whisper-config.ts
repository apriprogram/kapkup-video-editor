import fs from "node:fs";
import path from "node:path";

/**
 * Pengaturan Whisper tanpa mengimpor paket Whisper-nya, supaya aman dipakai
 * route handler. Transkripsi sendiri berjalan sebagai proses terpisah (CLI).
 */

// Di Windows, Remotion hanya menyediakan binari sampai 1.6.0; waktu per kata butuh 1.5.5 ke atas.
export const WHISPER_VERSION = "1.5.5";
export const WHISPER_MODELS = ["tiny", "base", "small", "medium"] as const;
export type WhisperModelName = (typeof WHISPER_MODELS)[number];
export const DEFAULT_WHISPER_MODEL: WhisperModelName = "small";

export function whisperDir(): string {
  return path.join(process.cwd(), ".kapkup", "whisper");
}

/** Apakah model sudah ada di komputer ini (belum = pemakaian pertama akan mengunduh). */
export function whisperReady(model: WhisperModelName = DEFAULT_WHISPER_MODEL): boolean {
  return fs.existsSync(path.join(whisperDir(), `ggml-${model}.bin`));
}
