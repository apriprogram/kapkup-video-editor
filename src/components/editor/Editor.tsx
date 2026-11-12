"use client";

import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import type { Project } from "@/lib/project/schema";
import { pausePlayer, seekToFrame, togglePlay, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "./ExportDialog";
import { Splitter } from "@/components/ui/splitter";
import { Inspector } from "./Inspector";
import { LibraryPanel } from "./LibraryPanel";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";

const SAVE_DELAY_MS = 600;
const POLL_MS = 1500;

type LoadResponse = { project: Project; mtimeMs: number; issues: string[] };

async function fetchProject(id: string): Promise<LoadResponse> {
  const response = await fetch(`/api/projects/${id}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Gagal memuat project");
  return data as LoadResponse;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  return target instanceof HTMLInputElement && target.type !== "range";
}

export function Editor({ projectId }: { projectId: string }) {
  const loaded = useEditor((state) => state.projectId === projectId && state.project !== null);
  const [error, setError] = React.useState<string | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);

  // Muat project saat halaman dibuka.
  React.useEffect(() => {
    let cancelled = false;
    fetchProject(projectId)
      .then(({ project, mtimeMs, issues }) => {
        if (cancelled) return;
        useEditor.getState().load(projectId, project, mtimeMs);
        if (issues.length > 0) toast.warning(`Ada ${issues.length} masalah di project`, { description: issues[0] });
      })
      .catch((cause: Error) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Simpan otomatis setiap ada perubahan.
  const project = useEditor((state) => state.project);
  const dirty = useEditor((state) => state.dirty);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    if (!loaded || !dirty || !project) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      const state = useEditor.getState();
      state.markSaving();
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project }),
        });
        if (!response.ok) throw new Error();
        const { mtimeMs } = (await response.json()) as { mtimeMs: number };
        useEditor.getState().markSaved(project, mtimeMs);
      } catch {
        useEditor.getState().markSaveError();
        // Coba lagi sendiri; perubahan tetap aman di editor selama tab terbuka.
        retryTimer = setTimeout(() => setRetry((count) => count + 1), 3000);
      }
    }, SAVE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(retryTimer);
    };
  }, [loaded, dirty, project, projectId, retry]);

  // Pantau project.json: bila diubah dari luar (mis. oleh Claude), muat ulang.
  React.useEffect(() => {
    if (!loaded) return;
    let busy = false;
    let lastBad = 0;
    const timer = setInterval(async () => {
      const state = useEditor.getState();
      if (busy || state.saveState === "saving") return;
      busy = true;
      try {
        const response = await fetch(`/api/projects/${projectId}?stat=1`, { cache: "no-store" });
        if (!response.ok) return;
        const { mtimeMs } = (await response.json()) as { mtimeMs: number };
        const current = useEditor.getState();
        if (mtimeMs === current.mtimeMs || mtimeMs === lastBad || current.saveState === "saving") return;
        try {
          const fresh = await fetchProject(projectId);
          const hadLocalChanges = useEditor.getState().dirty;
          useEditor.getState().replaceFromDisk(fresh.project, fresh.mtimeMs);
          if (hadLocalChanges) {
            toast.warning("File project diubah dari luar", {
              description: "Versi dari file dipakai. Tekan Ctrl+Z untuk kembali ke versi kamu.",
            });
          } else {
            toast.info("Project diperbarui dari file");
          }
          if (fresh.issues.length > 0) {
            toast.warning(`Ada ${fresh.issues.length} masalah di project`, { description: fresh.issues[0] });
          }
        } catch (cause) {
          lastBad = mtimeMs;
          toast.error("File project tidak bisa dibaca", { description: (cause as Error).message });
        }
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loaded, projectId]);

  // Shortcut keyboard.
  React.useEffect(() => {
    if (!loaded) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.querySelector("[role=dialog]")) return;
      const state = useEditor.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        state.redo();
      } else if (mod && key === "a") {
        event.preventDefault();
        state.selectAll();
      } else if (mod && key === "b") {
        event.preventDefault();
        state.splitAtPlayhead();
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        state.deleteAnySelection();
      } else if (mod && key === "d") {
        event.preventDefault();
        state.duplicateSelected();
      } else if (!mod && key === "q") {
        state.trimToPlayhead("start");
      } else if (!mod && key === "w") {
        state.trimToPlayhead("end");
      } else if (key === "arrowleft" || key === "arrowright") {
        event.preventDefault();
        pausePlayer();
        seekToFrame(state.frame + (key === "arrowleft" ? -1 : 1) * (event.shiftKey ? 10 : 1));
      } else if (key === "home") {
        seekToFrame(0);
      } else if (key === "escape") {
        state.clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loaded]);

  // Jangan tutup tab selagi ada perubahan yang belum tersimpan.
  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (error) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Project tidak bisa dibuka</h1>
        <p className="max-w-prose text-muted-foreground">{error}</p>
        <Link href="/">
          <Button variant="primary">Kembali ke daftar project</Button>
        </Link>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="flex h-full items-center justify-center text-muted-foreground" aria-busy="true">
        Memuat project…
      </main>
    );
  }

  return (
    <div className="flex h-full min-w-[1100px] flex-col bg-background">
      <TopBar onExport={() => setExportOpen(true)} />
      <Workspace projectId={projectId} />
      {exportOpen && <ExportDialog projectId={projectId} onClose={() => setExportOpen(false)} />}
    </div>
  );
}

// --- Susunan panel ---

type PanelSizes = { player: number; inspector: number; timeline: number };

const DEFAULT_SIZES: PanelSizes = { player: 440, inspector: 320, timeline: 330 };
const SIZES_KEY = "kapkup.panel-sizes";

function clampSizes(sizes: PanelSizes): PanelSizes {
  const width = typeof window === "undefined" ? 1440 : window.innerWidth;
  const height = typeof window === "undefined" ? 900 : window.innerHeight;
  const player = Math.round(Math.min(Math.max(sizes.player, 260), Math.max(260, width - 700)));
  return {
    player,
    inspector: Math.round(Math.min(Math.max(sizes.inspector, 240), Math.max(240, width - player - 380))),
    timeline: Math.round(Math.min(Math.max(sizes.timeline, 150), Math.max(150, height - 280))),
  };
}

function loadSizes(): PanelSizes {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SIZES_KEY) ?? "null") as Partial<PanelSizes> | null;
    return clampSizes({ ...DEFAULT_SIZES, ...saved });
  } catch {
    return clampSizes(DEFAULT_SIZES);
  }
}

/**
 * Kiri atas: pustaka + properti. Kiri bawah: timeline. Kanan: player setinggi layar.
 * Semua pembatas bisa diseret; ukurannya diingat di browser ini.
 */
function Workspace({ projectId }: { projectId: string }) {
  const [sizes, setSizes] = React.useState<PanelSizes>(loadSizes);

  const resize = React.useCallback((key: keyof PanelSizes, delta: number) => {
    setSizes((current) => {
      const next = clampSizes({ ...current, [key]: current[key] - delta });
      try {
        window.localStorage.setItem(SIZES_KEY, JSON.stringify(next));
      } catch {
        // Tanpa penyimpanan, ukuran hanya berlaku selama tab terbuka.
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    const onResize = () => setSizes((current) => clampSizes(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 px-1 pb-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <LibraryPanel projectId={projectId} />
          <Splitter orientation="vertical" label="Ubah lebar panel properti" onDrag={(delta) => resize("inspector", delta)} />
          <Inspector style={{ width: sizes.inspector }} />
        </div>
        <Splitter orientation="horizontal" label="Ubah tinggi timeline" onDrag={(delta) => resize("timeline", delta)} />
        <div className="flex shrink-0 flex-col overflow-hidden rounded-md bg-surface" style={{ height: sizes.timeline }}>
          <Toolbar />
          <Timeline projectId={projectId} />
        </div>
      </div>
      <Splitter orientation="vertical" label="Ubah lebar player" onDrag={(delta) => resize("player", delta)} />
      <Preview projectId={projectId} style={{ width: sizes.player }} />
    </div>
  );
}
