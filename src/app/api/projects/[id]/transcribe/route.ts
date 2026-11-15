import { z } from "zod";
import { runCli } from "@/lib/server/cli";
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
    return Response.json(
      await runCli(["transcribe-json", id, itemId, model, ...(language ? [language] : [])], { failure: "Transkripsi gagal" }),
    );
  } catch (error) {
    return fail(error);
  }
}
