import { z } from "zod";
import { runCli } from "@/lib/server/cli";
import { fail, type IdContext } from "@/lib/server/http";
import { TTS_DOWNLOAD_MB, TTS_LANGUAGES, TTS_MAX_CHARS, TTS_VOICES, ttsReady } from "@/lib/server/tts-config";
import { statProject } from "@/lib/server/workspace";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(TTS_MAX_CHARS),
  voice: z.number().int().min(0).max(TTS_VOICES.length - 1).default(0),
  speed: z.number().min(0.5).max(2).default(1),
  language: z.enum(TTS_LANGUAGES.map((language) => language.value) as [string, ...string[]]).default("id"),
});

export async function GET() {
  return Response.json({
    ready: ttsReady(),
    downloadMb: TTS_DOWNLOAD_MB,
    maxChars: TTS_MAX_CHARS,
    voices: TTS_VOICES,
    languages: TTS_LANGUAGES,
  });
}

/**
 * Membuat file suara dari teks dan mengembalikan asetnya. Aset tidak ditulis ke
 * project.json; editor yang menambahkannya, supaya perubahan lain tidak tertimpa.
 */
export async function POST(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    await statProject(id);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: `Teks wajib diisi (maksimal ${TTS_MAX_CHARS} karakter)` }, { status: 400 });
    const { text, voice, speed, language } = body.data;
    const result = await runCli(["tts-json", id, String(voice), String(speed), language], {
      stdin: text,
      failure: "Teks ke suara gagal",
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
