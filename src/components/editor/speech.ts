import * as React from "react";
import { toast } from "sonner";
import type { Asset } from "@/lib/project/schema";
import { useEditor } from "@/store/editor";

/** Bagian teks-ke-suara yang dipakai bersama oleh tab Suara dan panel Properti klip teks. */

export type TtsInfo = {
  ready: boolean;
  downloadMb: number;
  maxChars: number;
  voices: { id: number; label: string; gender: "female" | "male" }[];
  languages: { value: string; label: string }[];
};

export type TtsPrefs = { voice: string; language: string; speed: number };

const PREFS_KEY = "kapkup.tts";
const DEFAULT_PREFS: TtsPrefs = { voice: "0", language: "id", speed: 1 };

/** Suara, bahasa, dan kecepatan yang terakhir dipakai; diingat di browser ini. */
export function readTtsPrefs(): TtsPrefs {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null") as Partial<TtsPrefs> | null;
    return {
      voice: typeof saved?.voice === "string" ? saved.voice : DEFAULT_PREFS.voice,
      language: typeof saved?.language === "string" ? saved.language : DEFAULT_PREFS.language,
      speed: typeof saved?.speed === "number" ? Math.min(1.5, Math.max(0.7, saved.speed)) : DEFAULT_PREFS.speed,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function saveTtsPrefs(prefs: TtsPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Tanpa penyimpanan, pilihan hanya berlaku sampai halaman dimuat ulang.
  }
}

/** Pilihan suara yang sama di semua tempat: mengubahnya di satu panel ikut tersimpan. */
export function useTtsPrefs(): [TtsPrefs, (patch: Partial<TtsPrefs>) => void] {
  const [prefs, setPrefs] = React.useState<TtsPrefs>(readTtsPrefs);
  const update = React.useCallback((patch: Partial<TtsPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      saveTtsPrefs(next);
      return next;
    });
  }, []);
  return [prefs, update];
}

/** Daftar suara dan status model (sudah terunduh atau belum) dari server. */
export function useTtsInfo(projectId: string | null): TtsInfo | null {
  const [info, setInfo] = React.useState<TtsInfo | null>(null);
  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/tts`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<TtsInfo>) : null))
      .then((data) => !cancelled && data && setInfo(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return info;
}

let running = false;

/**
 * Mengubah teks menjadi klip audio dan menaruhnya di timeline: di `startMs` bila
 * diberikan (mis. awal klip teksnya), kalau tidak di garis waktu. Mengembalikan
 * asetnya, atau null bila dibatalkan atau gagal.
 */
export async function createSpeech(
  projectId: string,
  info: TtsInfo,
  options: { text: string; prefs: TtsPrefs; startMs?: number },
): Promise<Asset | null> {
  const text = options.text.replace(/\s+/g, " ").trim();
  if (!text) {
    toast.info("Teksnya masih kosong");
    return null;
  }
  if (text.length > info.maxChars) {
    toast.info(`Teks terlalu panjang (maksimal ${info.maxChars} karakter)`);
    return null;
  }
  if (running) {
    toast.info("Suara lain masih dibuat", { description: "Tunggu sampai selesai dulu." });
    return null;
  }
  // Status model dibaca ulang: bisa saja sudah terunduh lewat panel lain sejak halaman dibuka.
  const endpoint = `/api/projects/${projectId}/tts`;
  const ready = await fetch(endpoint, { cache: "no-store" })
    .then((response) => response.json() as Promise<TtsInfo>)
    .then((data) => data.ready)
    .catch(() => info.ready);
  if (
    !ready &&
    !window.confirm(
      "Teks ke suara berjalan di komputer ini, tanpa mengirim teks ke internet.\n\n" +
        `Pemakaian pertama mengunduh model suaranya (sekitar ${info.downloadMb} MB, sekali saja). Lanjutkan?`,
    )
  ) {
    return null;
  }
  running = true;
  const progress = toast.loading(ready ? "Membuat suara…" : "Mengunduh model suara lalu membuat suara…");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: Number(options.prefs.voice), speed: options.prefs.speed, language: options.prefs.language }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Teks ke suara gagal");
    const asset = data.asset as Asset;
    const state = useEditor.getState();
    state.addAsset(asset);
    // Suara harus mulai tepat di waktu itu, jadi ditaruh di track audio yang kosong di sana.
    state.addAssetToTimeline(asset.id, { startMs: options.startMs, freeTrack: true });
    toast.success("Suara ditambahkan ke timeline", { id: progress, description: "Klipnya ada di track audio dan sudah terpilih." });
    return asset;
  } catch (cause) {
    toast.error("Teks ke suara gagal", { id: progress, description: (cause as Error).message });
    return null;
  } finally {
    running = false;
  }
}
