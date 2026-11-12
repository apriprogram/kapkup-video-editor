import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { fail, type IdContext } from "@/lib/server/http";
import { readProject } from "@/lib/server/workspace";

const bodySchema = z.object({ ms: z.number().min(0) });

/**
 * Membuat sampul project (cover.png) dari frame pada waktu `ms`, lewat proses
 * render yang sama dengan export supaya tampilannya persis seperti hasil akhir.
 */
export async function POST(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return Response.json({ error: "Permintaan tidak valid" }, { status: 400 });
    const { project } = await readProject(id);
    const scale = Math.min(1, 480 / Math.min(project.settings.width, project.settings.height));
    const root = process.cwd();

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(root, "scripts", "render.ts"),
          "--project", id,
          "--still", "cover.png",
          "--ms", String(Math.round(body.data.ms)),
          "--scale", String(scale),
        ],
        { cwd: root, windowsHide: true },
      );
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve();
        const lines = stderr.trim().split("\n");
        reject(new Error(lines[lines.length - 1] || "Gagal membuat sampul"));
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
