import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Menjalankan scripts/kapkup-cli.ts sebagai proses terpisah dan mengambil baris JSON
 * terakhir dari keluarannya. Dipakai untuk pekerjaan yang memuat paket natif atau
 * berjalan lama (Whisper, teks-ke-suara) supaya tidak ikut dibundel ke server Next.
 */
export function runCli(args: string[], options: { stdin?: string; failure?: string } = {}): Promise<unknown> {
  const root = process.cwd();
  const failure = options.failure ?? "Proses gagal";
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "scripts", "kapkup-cli.ts"), ...args],
      { cwd: root, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const lines = stderr.trim().split("\n");
        return reject(new Error(lines[lines.length - 1] || failure));
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() ?? ""));
      } catch {
        reject(new Error(`${failure}: hasilnya tidak terbaca`));
      }
    });
    child.stdin.end(options.stdin ?? "");
  });
}
