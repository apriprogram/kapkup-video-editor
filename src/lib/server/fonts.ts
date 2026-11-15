import { spawn } from "node:child_process";

/**
 * Daftar nama keluarga font yang terpasang di komputer ini. Render berjalan di
 * komputer yang sama (Chrome milik Remotion), jadi font apa pun di daftar ini
 * tampil sama di preview dan di hasil export.
 */

/** Font simbol/ikon: namanya muncul di sistem, tetapi huruf biasa tampil sebagai gambar. */
const SYMBOL_FONTS = new Set(
  [
    "Marlett",
    "Symbol",
    "Webdings",
    "Wingdings",
    "Wingdings 2",
    "Wingdings 3",
    "MT Extra",
    "MS Outlook",
    "MS Reference Specialty",
    "Bookshelf Symbol 7",
    "Segoe MDL2 Assets",
    "Segoe Fluent Icons",
    "Segoe UI Symbol",
    "Segoe UI Emoji",
    "HoloLens MDL2 Assets",
  ].map((name) => name.toLowerCase()),
);

const CACHE_MS = 60_000;
let cache: { at: number; fonts: string[] } | null = null;

function capture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks).toString("utf8")) : reject(new Error(`${bin} keluar dengan kode ${code}`))));
  });
}

async function readFamilies(): Promise<string[]> {
  if (process.platform === "win32") {
    // Daftar yang sama dengan yang dilihat aplikasi Windows lain, termasuk font yang dipasang per pengguna.
    const script =
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; " +
      "(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";
    return (await capture("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script])).split(/\r?\n/);
  }
  // macOS dan Linux: fontconfig, bila tersedia.
  return (await capture("fc-list", ["--format", "%{family[0]}\n"])).split("\n");
}

/** Nama font terpasang, terurut abjad. Kosong bila daftar tidak bisa dibaca. */
export async function listSystemFonts(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.fonts;
  let names: string[];
  try {
    names = await readFamilies();
  } catch {
    return [];
  }
  const fonts = [...new Set(names.map((name) => name.trim()).filter((name) => name && !name.startsWith("@")))]
    .filter((name) => !SYMBOL_FONTS.has(name.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  // Daftar kosong tidak disimpan, supaya permintaan berikutnya mencoba lagi.
  if (fonts.length > 0) cache = { at: Date.now(), fonts };
  return fonts;
}
