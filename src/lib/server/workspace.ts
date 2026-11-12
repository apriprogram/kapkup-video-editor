import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  contentDurationMs,
  createEmptyProject,
  projectSchema,
  type Project,
  type Settings,
} from "../project/schema";

/** Folder tempat semua project disimpan. Bisa dipindah lewat KAPKUP_WORKSPACE. */
export const WORKSPACE = process.env.KAPKUP_WORKSPACE
  ? path.resolve(process.env.KAPKUP_WORKSPACE)
  : path.join(process.cwd(), "workspace");

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function projectDir(id: string): string {
  if (!ID_PATTERN.test(id)) throw new WorkspaceError("ID project tidak valid");
  return path.join(WORKSPACE, id);
}

export function projectFile(id: string): string {
  return path.join(projectDir(id), "project.json");
}

/** Path absolut sebuah file di dalam folder project; menolak keluar dari folder. */
export function resolveInProject(id: string, relative: string): string {
  const dir = projectDir(id);
  const full = path.resolve(dir, relative);
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new WorkspaceError("Path di luar folder project");
  }
  return full;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "project";
}

export type ProjectSummary = {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  /** Panjang isi timeline; 0 bila masih kosong. */
  durationMs: number;
  thumbnail: string | null;
};

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!fs.existsSync(WORKSPACE)) return [];
  const entries = await fsp.readdir(WORKSPACE, { withFileTypes: true });
  const result: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue;
    try {
      const { project, mtimeMs } = await readProject(entry.name);
      result.push({
        id: entry.name,
        name: project.name,
        updatedAt: mtimeMs,
        width: project.settings.width,
        height: project.settings.height,
        durationMs: contentDurationMs(project),
        // Sampul buatan pengguna didahulukan; kalau belum ada, pakai thumbnail media pertama.
        thumbnail: fs.existsSync(path.join(WORKSPACE, entry.name, "cover.png"))
          ? "cover.png"
          : (project.assets.find((a) => a.thumbnail)?.thumbnail ?? null),
      });
    } catch {
      // Folder tanpa project.json yang valid dilewati.
    }
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readProject(id: string): Promise<{ project: Project; mtimeMs: number }> {
  const file = projectFile(id);
  let raw: string;
  let mtimeMs: number;
  try {
    raw = await fsp.readFile(file, "utf8");
    mtimeMs = (await fsp.stat(file)).mtimeMs;
  } catch {
    throw new WorkspaceError("Project tidak ditemukan", 404);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new WorkspaceError(`project.json bukan JSON yang valid: ${(error as Error).message}`, 422);
  }
  const parsed = projectSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new WorkspaceError(`project.json tidak sesuai format: ${detail}`, 422);
  }
  return { project: parsed.data, mtimeMs };
}

export async function statProject(id: string): Promise<number> {
  try {
    return (await fsp.stat(projectFile(id))).mtimeMs;
  } catch {
    throw new WorkspaceError("Project tidak ditemukan", 404);
  }
}

/**
 * Di Windows, rename gagal sesaat (EPERM/EBUSY) bila file tujuan sedang dibaca
 * proses lain, mis. permintaan lain, antivirus, atau editor teks. Dicoba ulang sebentar.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 8 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

/** Menulis lewat file sementara supaya project.json tidak pernah setengah tertulis. */
export async function writeProject(id: string, project: Project): Promise<number> {
  const file = projectFile(id);
  const data = projectSchema.parse(project);
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(data, null, 2) + "\n", "utf8");
  try {
    await renameWithRetry(temp, file);
  } catch (error) {
    await fsp.rm(temp, { force: true });
    throw error;
  }
  return (await fsp.stat(file)).mtimeMs;
}

export async function createProject(name: string, settings?: Partial<Settings>): Promise<string> {
  await fsp.mkdir(WORKSPACE, { recursive: true });
  const base = slugify(name);
  let id = base;
  for (let n = 2; fs.existsSync(path.join(WORKSPACE, id)); n++) id = `${base}-${n}`;
  const dir = projectDir(id);
  for (const sub of ["media", "cache", "exports"]) {
    await fsp.mkdir(path.join(dir, sub), { recursive: true });
  }
  await writeProject(id, createEmptyProject(name.trim() || "Tanpa judul", settings));
  return id;
}
