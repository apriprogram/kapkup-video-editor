import { WorkspaceError } from "./workspace";

export function fail(error: unknown): Response {
  const status = error instanceof WorkspaceError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Terjadi kesalahan";
  if (status >= 500) console.error("[kapkup]", error);
  return Response.json({ error: message }, { status });
}

export type IdContext = { params: Promise<{ id: string }> };
