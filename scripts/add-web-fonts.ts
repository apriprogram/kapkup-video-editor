/**
 * Menambah font web dari Google Fonts ke Kapkup.
 *
 *   npx tsx scripts/add-web-fonts.ts "https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap"
 *
 * File woff2-nya diunduh ke public/fonts dan didaftarkan di src/lib/project/web-fonts.json,
 * sehingga preview dan render memakai font yang sama tanpa perlu internet.
 * Hanya huruf Latin (latin dan latin-ext) yang diambil; cukup untuk bahasa Indonesia dan Inggris.
 */
import fsp from "node:fs/promises";
import path from "node:path";

type Face = { file: string; style: string; weight: string; unicodeRange: string };
type Font = { family: string; faces: Face[] };

const SUBSETS = new Set(["latin", "latin-ext"]);
// Google memberi woff2 (dan font variabel) hanya kepada browser modern, jadi dipakai tanda pengenal Chrome.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "src", "lib", "project", "web-fonts.json");

async function main(): Promise<number> {
  const url = process.argv[2] ?? "";
  if (!url.startsWith("https://fonts.googleapis.com/css2?")) {
    console.error('Pemakaian: tsx scripts/add-web-fonts.ts "https://fonts.googleapis.com/css2?family=..."');
    return 2;
  }
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Google Fonts menjawab HTTP ${response.status}`);
  const css = await response.text();

  const added = new Map<string, Font>();
  for (const [, subset, body] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (!SUBSETS.has(subset)) continue;
    const field = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1].trim() ?? "";
    const family = field("font-family").replace(/^['"]|['"]$/g, "");
    const style = field("font-style") || "normal";
    const weight = field("font-weight") || "400";
    const source = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/.exec(body)?.[1];
    if (!family || !source) continue;

    const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const name = `${slug}-${style}-${weight.replace(/\s+/g, "-")}-${subset}.woff2`;
    const folder = path.join(ROOT, "public", "fonts", slug);
    await fsp.mkdir(folder, { recursive: true });
    const file = await fetch(source);
    if (!file.ok) throw new Error(`Gagal mengunduh ${source} (HTTP ${file.status})`);
    await fsp.writeFile(path.join(folder, name), Buffer.from(await file.arrayBuffer()));

    const font = added.get(family) ?? { family, faces: [] };
    font.faces.push({ file: `fonts/${slug}/${name}`, style, weight, unicodeRange: field("unicode-range") });
    added.set(family, font);
  }
  if (added.size === 0) throw new Error("Tidak ada font Latin di tautan itu");

  // Font yang sudah terdaftar dipertahankan; keluarga yang sama diganti dengan yang baru.
  const existing = (await fsp.readFile(MANIFEST, "utf8").then((text) => JSON.parse(text) as Font[], () => [])).filter(
    (font) => !added.has(font.family),
  );
  const fonts = [...existing, ...added.values()].sort((a, b) => a.family.localeCompare(b.family));
  await fsp.writeFile(MANIFEST, JSON.stringify(fonts, null, 2) + "\n", "utf8");
  for (const font of added.values()) console.log(`${font.family}: ${font.faces.length} file`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
