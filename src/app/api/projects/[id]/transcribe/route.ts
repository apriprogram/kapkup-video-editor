import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { fail, type IdContext } from "@/lib/server/http";
import { DEFAULT_WHISPER_MODEL, WHISPER_MODELS, whisperReady } from "@/lib/server/whisper-config";
import { statProject } from "@/lib/server/workspace";

const bodySchema = z.object({
  itemId: z.string().regex(/^[\w-]+$/),
  model: z.enum(WHISPER_MODELS).optional(),
  /** Kode bahasa (mis. "id", "en"); kosong = deteksi otomatis. */
  language: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .nullable()
    .optional(),
});

export async function GET() {
  return Response.json({ ready: whisperReady(), model: DEFAULT_WHISPER_MODEL, models: WHISPER_MODELS });
}

/** Menjalankan CLI sebagai proses terpisah dan mengambil baris JSON terakhir dari keluarannya. */
function runCli(args: string[]): Promise<unknown> {
  const root = process.cwd();
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
        return reject(new Error(lines[lines.length - 1] || "Transkripsi gagal"));
      }
      try {
        resolve(JSON.parse(stdout.trim().split("\n").pop() ?? ""));
      } catch {
        reject(new Error("Hasil transkripsi tidak terbaca"));
      }
    });
  });
}

/**
 * Mentranskripsi suara sebuah klip. Hasilnya dikembalikan ke editor (tidak ditulis ke
 * project.json) supaya tidak menimpa perubahan yang dibuat selama proses berjalan.
 */
export async function POST(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    await statProject(id);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
    const { itemId, model = DEFAULT_WHISPER_MODEL, language } = body.data;
    return Response.json(await runCli(["transcribe-json", id, itemId, model, ...(language ? [language] : [])]));
  } catch (error) {
    return fail(error);
  }
}
