import { z } from "zod";
import { fail } from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/workspace";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().int().min(1).max(120).default(30),
});

export async function GET() {
  try {
    return Response.json({ projects: await listProjects() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.safeParse(await request.json());
    if (!body.success) return Response.json({ error: "Data project tidak valid" }, { status: 400 });
    const { name, ...settings } = body.data;
    const id = await createProject(name, settings);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
