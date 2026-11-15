import fs from "node:fs";
import path from "node:path";

/**
 * Pengaturan teks-ke-suara tanpa mengimpor paket natifnya (sherpa-onnx-node),
 * supaya aman dipakai route handler. Pembuatan suara berjalan sebagai proses terpisah (CLI).
 *
 * Mesin: Supertonic 3 lewat sherpa-onnx. Berjalan di komputer ini, tanpa layanan cloud.
 * Pemakaian pertama mengunduh modelnya ke .kapkup/tts.
 */
export const TTS_MODEL = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11";
export const TTS_MODEL_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/${TTS_MODEL}.tar.bz2`;
/** Ukuran unduhan, untuk ditampilkan saat meminta izin pengguna. */
export const TTS_DOWNLOAD_MB = 123;
export const TTS_MAX_CHARS = 3000;

/** File yang harus ada supaya model dianggap terpasang lengkap. */
export const TTS_MODEL_FILES = {
  durationPredictor: "duration_predictor.int8.onnx",
  textEncoder: "text_encoder.int8.onnx",
  vectorEstimator: "vector_estimator.int8.onnx",
  vocoder: "vocoder.int8.onnx",
  ttsJson: "tts.json",
  unicodeIndexer: "unicode_indexer.bin",
  voiceStyle: "voice.bin",
} as const;

export const TTS_LANGUAGES = [
  { value: "id", label: "Indonesia" },
  { value: "en", label: "Inggris" },
] as const;
export type TtsLanguage = (typeof TTS_LANGUAGES)[number]["value"];

/**
 * Nomor suara (`sid`) di dalam model. Pembagian perempuan/laki-laki diukur dari nada
 * dasarnya (13 Nov 2026): suara 0–4 sekitar 160–200 Hz, suara 5–9 sekitar 85–130 Hz.
 */
export const TTS_VOICES = [
  { id: 0, label: "Perempuan 1", gender: "female" },
  { id: 1, label: "Perempuan 2", gender: "female" },
  { id: 2, label: "Perempuan 3", gender: "female" },
  { id: 3, label: "Perempuan 4", gender: "female" },
  { id: 4, label: "Perempuan 5", gender: "female" },
  { id: 5, label: "Laki-laki 1", gender: "male" },
  { id: 6, label: "Laki-laki 2", gender: "male" },
  { id: 7, label: "Laki-laki 3", gender: "male" },
  { id: 8, label: "Laki-laki 4", gender: "male" },
  { id: 9, label: "Laki-laki 5", gender: "male" },
] as const;

export function ttsDir(): string {
  return path.join(process.cwd(), ".kapkup", "tts");
}

export function ttsModelDir(): string {
  return path.join(ttsDir(), TTS_MODEL);
}

/** Apakah model sudah ada di komputer ini (belum = pemakaian pertama akan mengunduh). */
export function ttsReady(): boolean {
  return Object.values(TTS_MODEL_FILES).every((file) => fs.existsSync(path.join(ttsModelDir(), file)));
}
