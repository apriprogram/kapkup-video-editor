import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { fail, type IdContext } from "@/lib/server/http";
import { isSupportedMedia, registerMedia, uniqueMediaName } from "@/lib/server/media";
import { projectDir, statProject } from "@/lib/server/workspace";

/**
 * Impor media: isi file dikirim langsung sebagai body (bukan multipart) supaya
 * video besar ditulis ke disk sambil mengalir, tanpa ditampung di memori.
 */
export async function POST(request: Request, { params }: IdContext) {
  let target: string | null = null;
  try {
    const { id } = await params;
    await statProject(id);
    const original = new URL(request.url).searchParams.get("name") ?? "";
    if (!original || !isSupportedMedia(original)) {
      return Response.json({ error: "Jenis file tidak didukung" }, { status: 415 });
    }
    if (!request.body) return Response.json({ error: "File kosong" }, { status: 400 });

    const fileName = uniqueMediaName(id, original);
    const mediaDir = path.join(projectDir(id), "media");
    await fsp.mkdir(mediaDir, { recursive: true });
    target = path.join(mediaDir, fileName);
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>),
      fs.createWriteStream(target),
    );

    const asset = await registerMedia(id, fileName, original);
    return Response.json({ asset }, { status: 201 });
  } catch (error) {
    if (target) await fsp.rm(target, { force: true });
    return fail(error);
  }
}
