import manifest from "./web-fonts.json";

/**
 * Font web yang filenya ikut di `public/fonts`, sehingga tampil sama di komputer mana
 * pun (tidak perlu terpasang di sistem). Daftarnya di web-fonts.json dan ditambah
 * lewat `npx tsx scripts/add-web-fonts.ts "<tautan css2 Google Fonts>"`.
 */
export type WebFontFace = {
  /** Path relatif terhadap folder `public`. */
  file: string;
  style: string;
  /** Satu angka ("700") atau rentang font variabel ("100 900"). */
  weight: string;
  unicodeRange: string;
};

export type WebFont = { family: string; faces: WebFontFace[] };

export const WEB_FONTS: WebFont[] = manifest;

export function findWebFont(family: string): WebFont | undefined {
  const wanted = family.trim().toLowerCase();
  return WEB_FONTS.find((font) => font.family.toLowerCase() === wanted);
}
