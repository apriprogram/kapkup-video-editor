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
  // Dropdown buatan sendiri (components/ui/select.tsx) memakai tombol ber-role combobox.
  if (target.closest('[role="combobox"], [role="listbox"]')) return true;
  return target instanceof HTMLInputElement && target.type !== "range";
}

/**
 * Lembar kerja: "vertical" menaruh player setinggi layar di kanan (cocok untuk video
 * tegak seperti Story/Reels); "horizontal" menaruh player di tengah atas dengan
 * timeline selebar layar (cocok untuk video mendatar).
 */
export type WorkspaceLayout = "vertical" | "horizontal";

const LAYOUT_KEY = "kapkup.layout";

function readLayout(projectId: string): WorkspaceLayout | null {
  try {
    const saved = window.localStorage.getItem(`${LAYOUT_KEY}:${projectId}`);
    return saved === "vertical" || saved === "horizontal" ? saved : null;
  } catch {
    return null;
  }
}

export function Editor({ projectId }: { projectId: string }) {
  const loaded = useEditor((state) => state.projectId === projectId && state.project !== null);
  const [error, setError] = React.useState<string | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);

  // Lembar kerja: pilihan pengguna diingat per project; kalau belum memilih, ikut bentuk kanvas.
  const [layoutChoice, setLayoutChoice] = React.useState<WorkspaceLayout | null>(() =>
    typeof window === "undefined" ? null : readLayout(projectId),
  );
  const landscape = useEditor((state) => (state.project ? state.project.settings.width > state.project.settings.height : false));
  const layout: WorkspaceLayout = layoutChoice ?? (landscape ? "horizontal" : "vertical");
  const chooseLayout = (next: WorkspaceLayout) => {
    setLayoutChoice(next);
    try {
      window.localStorage.setItem(`${LAYOUT_KEY}:${projectId}`, next);
    } catch {
      // Tanpa penyimpanan, pilihan hanya berlaku selama tab terbuka.
    }
  };

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
      <TopBar onExport={() => setExportOpen(true)} layout={layout} onLayoutChange={chooseLayout} />
      <Workspace projectId={projectId} layout={layout} />
      {exportOpen && <ExportDialog projectId={projectId} onClose={() => setExportOpen(false)} />}
    </div>
  );
}

// --- Susunan panel ---

type PanelSizes = { player: number; inspector: number; timeline: number; library: number };

const DEFAULT_SIZES: PanelSizes = { player: 440, inspector: 320, timeline: 330, library: 400 };
const SIZES_KEY = "kapkup.panel-sizes";
/** Lebar pembatas antarpanel (kelas w-1.5 / h-1.5 pada Splitter). */
const GAP = 6;

const between = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

function clampSizes(sizes: PanelSizes): PanelSizes {
  const width = typeof window === "undefined" ? 1440 : window.innerWidth;
  const height = typeof window === "undefined" ? 900 : window.innerHeight;
  const player = between(sizes.player, 260, width - 700);
  const inspector = between(sizes.inspector, 240, width - player - 380);
  return {
    player,
    inspector,
    timeline: between(sizes.timeline, 150, height - 280),
    // Hanya dipakai lembar kerja horizontal: pustaka | player | properti.
    library: between(sizes.library, 280, width - inspector - 380),
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
 * Susunan panel memakai grid bernama. Urutan elemen di DOM sama untuk kedua lembar
 * kerja; hanya petak grid-nya yang berpindah, supaya player tidak dibuat ulang
 * (posisi putar dan video yang sudah dimuat tetap) saat lembar kerja diganti.
 * Semua pembatas bisa diseret; ukurannya diingat di browser ini.
 */
function Workspace({ projectId, layout }: { projectId: string; layout: WorkspaceLayout }) {
  const [sizes, setSizes] = React.useState<PanelSizes>(loadSizes);

  /** `direction` 1 = menyeret ke kanan/bawah memperbesar panel, -1 = memperkecil. */
  const resize = React.useCallback((key: keyof PanelSizes, delta: number, direction: 1 | -1 = -1) => {
    setSizes((current) => {
      const next = clampSizes({ ...current, [key]: current[key] + delta * direction });
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

  const horizontal = layout === "horizontal";
  const grid: React.CSSProperties = horizontal
    ? {
        gridTemplateColumns: `${sizes.library}px ${GAP}px minmax(0, 1fr) ${GAP}px ${sizes.inspector}px`,
        gridTemplateRows: `minmax(0, 1fr) ${GAP}px ${sizes.timeline}px`,
        gridTemplateAreas: '"library s1 player s3 inspector" "s2 s2 s2 s2 s2" "timeline timeline timeline timeline timeline"',
      }
    : {
        gridTemplateColumns: `minmax(0, 1fr) ${GAP}px ${sizes.inspector}px ${GAP}px ${sizes.player}px`,
        gridTemplateRows: `minmax(0, 1fr) ${GAP}px ${sizes.timeline}px`,
        gridTemplateAreas: '"library s1 inspector s3 player" "s2 s2 s2 s3 player" "timeline timeline timeline s3 player"',
      };
  const cell = "flex min-h-0 min-w-0";

  return (
    <div className="grid min-h-0 flex-1 px-1.5 pb-1.5" style={grid} data-layout={layout}>
      <div className={cell} style={{ gridArea: "library" }}>
        <LibraryPanel projectId={projectId} />
      </div>
      <Splitter
        orientation="vertical"
        style={{ gridArea: "s1" }}
        label={horizontal ? "Ubah lebar panel pustaka" : "Ubah lebar panel properti"}
        onDrag={(delta) => (horizontal ? resize("library", delta, 1) : resize("inspector", delta))}
      />
      <div className={cell} style={{ gridArea: "inspector" }}>
        <Inspector />
      </div>
      <Splitter orientation="horizontal" style={{ gridArea: "s2" }} label="Ubah tinggi timeline" onDrag={(delta) => resize("timeline", delta)} />
      <div className={`${cell} flex-col overflow-hidden rounded-xl bg-surface`} style={{ gridArea: "timeline" }}>
        <Toolbar />
        <Timeline projectId={projectId} />
      </div>
      <Splitter
        orientation="vertical"
        style={{ gridArea: "s3" }}
        label={horizontal ? "Ubah lebar panel properti" : "Ubah lebar player"}
        onDrag={(delta) => resize(horizontal ? "inspector" : "player", delta)}
      />
      <div className={cell} style={{ gridArea: "player" }}>
        <Preview projectId={projectId} />
      </div>
    </div>
  );
}
