import { toast } from "sonner";
import type { Item, Project } from "@/lib/project/schema";
import { useEditor } from "@/store/editor";

type SpokenItem = Extract<Item, { type: "video" | "audio" }>;

/**
 * Bahasa ucapan untuk caption otomatis. Bawaannya Indonesia: pada ucapan pendek,
 * deteksi otomatis Whisper sering salah menebak dan menuliskannya dalam bahasa Inggris
 * (terjadi pada uji 13 November 2026). Pilihan pengguna diingat di browser ini.
 */
export type CaptionLanguage = "id" | "en" | "auto";

export const CAPTION_LANGUAGES: readonly { value: CaptionLanguage; label: string }[] = [
  { value: "id", label: "Indonesia" },
  { value: "en", label: "Inggris" },
  { value: "auto", label: "Deteksi otomatis" },
];

const LANGUAGE_KEY = "kapkup.caption-language";

export function readCaptionLanguage(): CaptionLanguage {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    return saved === "en" || saved === "auto" ? saved : "id";
  } catch {
    return "id";
  }
}

export function saveCaptionLanguage(language: CaptionLanguage): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Tanpa penyimpanan, pilihan hanya berlaku sampai halaman dimuat ulang.
  }
}

let running = false;

/**
 * Klip yang akan ditranskripsi: klip video/audio yang sedang dipilih; kalau tidak ada,
 * klip bersuara yang paling panjang di timeline (biasanya video utamanya).
 */
export function findCaptionTarget(project: Project, selectedIds: string[]): SpokenItem | null {
  const hasSound = (item: Item): item is SpokenItem =>
    (item.type === "video" || item.type === "audio") &&
    item.volume > 0 &&
    Boolean(project.assets.find((asset) => asset.id === item.assetId)?.hasAudio);
  const all = project.tracks.filter((track) => !track.muted).flatMap((track) => track.items);
  const selected = all.find((item) => selectedIds.includes(item.id) && (item.type === "video" || item.type === "audio"));
  if (selected && (selected.type === "video" || selected.type === "audio")) return selected;
  return all.filter(hasSound).sort((a, b) => b.durationMs - a.durationMs)[0] ?? null;
}

/**
 * Membuat caption per kata dari suara sebuah klip (Whisper di komputer ini) lalu
 * menaruhnya di timeline. Mengembalikan true bila caption berhasil dibuat.
 */
export async function runAutoCaption(itemId: string, language: CaptionLanguage = readCaptionLanguage()): Promise<boolean> {
  const projectId = useEditor.getState().projectId;
  if (!projectId) return false;
  if (running) {
    toast.info("Caption otomatis masih berjalan", { description: "Tunggu sampai transkripsi yang sedang berjalan selesai." });
    return false;
  }
  const endpoint = `/api/projects/${projectId}/transcribe`;
  running = true;
  const progress = toast.loading("Membuat caption dari suara…", { description: "Bisa beberapa menit untuk video panjang." });
  // Hasil akhir menggantikan pemberitahuan "sedang berjalan" itu sendiri (id yang sama),
  // supaya tidak ada pemberitahuan yang tertinggal.
  const finish = (kind: "success" | "info" | "error", title: string, description?: string) =>
    toast[kind](title, { id: progress, description });
  try {
    const status = (await fetch(endpoint, { cache: "no-store" }).then((response) => response.json())) as { ready: boolean };
    if (
      !status.ready &&
      !window.confirm(
        "Caption otomatis memakai Whisper yang berjalan di komputer ini.\n\n" +
          "Pemakaian pertama mengunduh program Whisper dan modelnya (sekitar 500 MB, sekali saja). Lanjutkan?",
      )
    ) {
      toast.dismiss(progress);
      return false;
    }
    // Project harus sudah tersimpan supaya server membaca posisi klip yang terbaru.
    for (let i = 0; i < 40 && (useEditor.getState().dirty || useEditor.getState().saveState === "saving"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, language: language === "auto" ? null : language }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Transkripsi gagal");
    if (data.words.length === 0) {
      finish("info", "Tidak ada ucapan yang terdeteksi di klip ini");
      return false;
    }
    useEditor.getState().addCaptions(data.words, data.placement);
    finish("success", `Caption dibuat (${data.words.length} kata)`, "Pilih klip caption di timeline untuk mengubah gayanya.");
    return true;
  } catch (cause) {
    finish("error", "Caption otomatis gagal", (cause as Error).message);
    return false;
  } finally {
    running = false;
  }
}
