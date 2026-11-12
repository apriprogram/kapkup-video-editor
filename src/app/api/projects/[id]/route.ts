import { checkProject, projectSchema } from "@/lib/project/schema";
import { fail, type IdContext } from "@/lib/server/http";
import { readProject, statProject, writeProject } from "@/lib/server/workspace";

/** `?stat=1` hanya mengembalikan waktu ubah file, untuk mendeteksi perubahan dari luar. */
export async function GET(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    if (new URL(request.url).searchParams.has("stat")) {
      return Response.json({ mtimeMs: await statProject(id) });
    }
    const { project, mtimeMs } = await readProject(id);
    return Response.json({ project, mtimeMs, issues: checkProject(project) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, { params }: IdContext) {
  try {
    const { id } = await params;
    await statProject(id);
    const body = (await request.json()) as { project?: unknown };
    const parsed = projectSchema.safeParse(body.project);
    if (!parsed.success) return Response.json({ error: "Isi project tidak valid" }, { status: 400 });
    return Response.json({ mtimeMs: await writeProject(id, parsed.data) });
  } catch (error) {
    return fail(error);
  }
}
