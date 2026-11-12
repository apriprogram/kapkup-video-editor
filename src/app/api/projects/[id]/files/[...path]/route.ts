import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fail } from "@/lib/server/http";
import { resolveInProject } from "@/lib/server/workspace";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".json": "application/json",
};

type Context = { params: Promise<{ id: string; path: string[] }> };

/** Menyajikan file project (media, cache, hasil export) dengan dukungan Range untuk seek video. */
export async function GET(request: Request, { params }: Context) {
  try {
    const { id, path: segments } = await params;
    const relative = segments.join("/");
    if (segments[0]?.startsWith(".") || relative === "project.json") {
      return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
    }
    const file = resolveInProject(id, relative);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(file);
    } catch {
      return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
    }
    if (!stat.isFile()) return Response.json({ error: "Tidak ditemukan" }, { status: 404 });

    const headers: Record<string, string> = {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
      "Last-Modified": stat.mtime.toUTCString(),
    };
    if (new URL(request.url).searchParams.has("download")) {
      headers["Content-Disposition"] = `attachment; filename="${path.basename(file)}"`;
    }

    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      let start: number;
      let end: number;
      if (range[1]) {
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      } else {
        start = Math.max(0, stat.size - Number(range[2]));
        end = stat.size - 1;
      }
      if (start > end || start >= stat.size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
      }
      const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }

    const stream = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
    return new Response(stream, { headers: { ...headers, "Content-Length": String(stat.size) } });
  } catch (error) {
    return fail(error);
  }
}
