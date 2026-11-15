import * as React from "react";
import { WEB_FONTS } from "@/lib/project/web-fonts";
import { loadWebFont } from "@/remotion/web-fonts";
import type { SelectOption } from "@/components/ui/select";

/** Font yang hampir pasti ada di Windows; dipakai bila daftar font komputer belum/tidak terbaca. */
const BASIC_FONTS = [
  "Arial",
  "Arial Black",
  "Segoe UI",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Impact",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Comic Sans MS",
];

// Satu permintaan untuk seluruh editor; semua dropdown font memakai hasil yang sama.
let request: Promise<string[]> | null = null;

function loadSystemFonts(): Promise<string[]> {
  request ??= fetch("/api/fonts")
    .then((response) => (response.ok ? (response.json() as Promise<{ fonts: string[] }>) : { fonts: [] }))
    .then((data) => data.fonts)
    .catch(() => []);
  return request;
}

/**
 * Pilihan untuk dropdown font: font web bawaan Kapkup (tampil sama di komputer mana pun),
 * lalu semua font yang terpasang di komputer ini. Font yang sedang dipakai klip tetap
 * ditampilkan walau tidak ada di keduanya, dengan keterangannya.
 */
export function useFontOptions(current: string): SelectOption<string>[] {
  const [system, setSystem] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void loadSystemFonts().then((fonts) => !cancelled && setSystem(fonts));
    // Supaya nama font web di daftar tampil dengan fontnya sendiri.
    for (const font of WEB_FONTS) void loadWebFont(font.family);
    return () => {
      cancelled = true;
    };
  }, []);

  return React.useMemo(() => {
    const web = WEB_FONTS.map((font) => font.family);
    const taken = new Set(web.map((font) => font.toLowerCase()));
    const installed = (system && system.length > 0 ? system : BASIC_FONTS).filter((font) => !taken.has(font.toLowerCase()));
    for (const font of installed) taken.add(font.toLowerCase());
    const options: SelectOption<string>[] = [
      ...web.map((font) => ({ value: font, label: font, hint: "Font web, ikut tersimpan di Kapkup" })),
      ...installed.map((font) => ({ value: font, label: font })),
    ];
    if (current && !taken.has(current.toLowerCase())) {
      // Daftar belum selesai dimuat: jangan dulu dicap "tidak terpasang".
      options.unshift({ value: current, label: current, hint: system ? "Tidak terpasang di komputer ini" : undefined });
    }
    return options;
  }, [system, current]);
}

/** Menampilkan nama font dengan font itu sendiri. */
export function fontPreviewStyle(option: SelectOption<string>): React.CSSProperties {
  return { fontFamily: `"${option.value}", Arial, sans-serif` };
}
