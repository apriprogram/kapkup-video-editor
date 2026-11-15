import React from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import type { Project } from "../lib/project/schema";
import { findWebFont } from "../lib/project/web-fonts";

/**
 * Memuat font web (file di `public/fonts`) untuk preview dan render. Tanpa ini render
 * bisa mengambil frame sebelum font selesai dimuat dan teks tampil dengan font cadangan.
 */

const loading = new Map<string, Promise<void>>();

/** Mendaftarkan semua file sebuah font web ke halaman dan menunggu sampai siap. Aman dipanggil berulang. */
export function loadWebFont(family: string): Promise<void> {
  const font = findWebFont(family);
  if (!font || typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  let promise = loading.get(font.family);
  if (!promise) {
    promise = Promise.all(
      font.faces.map((face) => {
        const entry = new FontFace(font.family, `url("${staticFile(face.file)}") format("woff2")`, {
          style: face.style,
          weight: face.weight,
          unicodeRange: face.unicodeRange,
        });
        document.fonts.add(entry);
        return entry.load();
      }),
    ).then(
      () => undefined,
      // File font tidak terbaca: teks memakai font cadangan, render tetap jalan.
      () => undefined,
    );
    loading.set(font.family, promise);
  }
  return promise;
}

function usedWebFonts(project: Project): string[] {
  const names = new Set<string>();
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.type !== "text" && item.type !== "captions") continue;
      const font = findWebFont(item.style.fontFamily);
      if (font) names.add(font.family);
    }
  }
  return [...names].sort();
}

/** Menahan render sampai semua font web yang dipakai project selesai dimuat. */
export function useWebFonts(project: Project): void {
  const families = usedWebFonts(project).join("|");
  // Pola Remotion: delayRender dipanggil saat render pertama supaya frame pertama pun menunggu.
  const [handle] = React.useState(() => delayRender("Memuat font web"));
  const released = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    const names = families ? families.split("|") : [];
    void Promise.all(names.map(loadWebFont)).then(() => {
      if (cancelled || released.current) return;
      released.current = true;
      continueRender(handle);
    });
    return () => {
      cancelled = true;
    };
  }, [families, handle]);
}
