"use client";

import { ArrowUpRight, Clapperboard, Clock, FolderOpen, Plus, Search, Timer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ASPECT_PRESETS } from "@/lib/project/schema";
import type { ProjectSummary } from "@/lib/server/workspace";
import { cn, formatTime } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; projects: ProjectSummary[] };

const COMPANY = { name: "PT. Garuda Nexa Bahtera", url: "https://garudanexa.com" };

// Bentuk komponen mengikuti panel admin Garuda Nexa: kartu membulat bergaris
// tipis tanpa bayangan, tombol dan input setinggi 44px dengan sudut membulat.
const GUTTER = "px-3 sm:px-6 lg:px-8";
const CARD = "rounded-[20px] bg-surface ring-1 ring-inset ring-border max-sm:rounded-2xl";
// Fokus input cukup ditandai garis tepi 1px. Tanda `!` perlu karena aturan
// `:focus-visible` di globals.css berada di luar layer dan mengalahkan utilitas biasa.
const FIELD =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-muted-foreground " +
  "hover:border-input focus:border-primary focus:outline-none! max-sm:text-[16px]";
const BUTTON =
  "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold tracking-[-0.01em] " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50";
const BADGE = "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium tabular-nums";

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** "9:16", "16:9", ... atau ukuran piksel bila bukan rasio baku. */
function ratioLabel(width: number, height: number): string {
  return ASPECT_PRESETS.find((preset) => preset.width === width && preset.height === height)?.id ?? `${width}×${height}`;
}

/** 95000 ms -> "1 mnt 35 dtk". */
function humanDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} dtk`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 === 0 ? `${minutes} mnt` : `${minutes} mnt ${seconds % 60} dtk`;
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={cn(CARD, "flex items-start justify-between gap-3 p-3.5 sm:p-5")}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground sm:text-[13px]">{label}</p>
        <p className="mt-1.5 truncate text-xl font-semibold tracking-[-0.02em] tabular-nums sm:text-[28px] sm:leading-tight">{value}</p>
      </div>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-[18px]" />
      </span>
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: ProjectSummary; onDelete: (project: ProjectSummary) => void }) {
  return (
    <li className="relative">
      <Link
        href={`/editor/${project.id}`}
        className={cn(CARD, "group block p-2 transition-[box-shadow,background-color] hover:bg-muted hover:ring-input")}
      >
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[14px] bg-stage">
          {project.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- thumbnail lokal dari folder project
            <img
              src={`/api/projects/${project.id}/files/${project.thumbnail}`}
              alt=""
              className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <Clapperboard className="size-8 text-muted-foreground" aria-hidden />
          )}
          <span className={cn(BADGE, "absolute top-2 left-2 bg-background/75 text-foreground backdrop-blur")}>
            {ratioLabel(project.width, project.height)}
          </span>
          {project.durationMs > 0 && (
            <span className={cn(BADGE, "absolute right-2 bottom-2 bg-background/75 text-foreground backdrop-blur")}>
              {formatTime(project.durationMs, true)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 px-2 pt-3 pb-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">{project.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">Diubah {dateFormat.format(project.updatedAt)}</p>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </div>
      </Link>
      {/* Di luar Link supaya klik tombol hapus tidak ikut membuka project. */}
      <button
        type="button"
        onClick={() => onDelete(project)}
        aria-label={`Hapus project ${project.name}`}
        title="Hapus project"
        className="absolute top-4 right-4 flex size-8 cursor-pointer items-center justify-center rounded-full bg-background/75 text-foreground backdrop-blur transition-colors before:absolute before:-inset-1.5 hover:bg-danger hover:text-primary-foreground"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

function DeleteDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectSummary;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gagal menghapus project");
      onDeleted(project.id);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-title"
      aria-describedby="delete-description"
      onCancel={(event) => {
        // Esc tidak menutup dialog selagi penghapusan berjalan.
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
      className={cn(CARD, "m-auto w-[calc(100%-1.5rem)] max-w-md p-5 text-foreground backdrop:bg-background/80 sm:p-6")}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <Trash2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="delete-title" className="text-base font-semibold tracking-[-0.01em]">
            Hapus project ini?
          </h2>
          <p id="delete-description" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium break-words text-foreground">{project.name}</span> beserta semua media dan hasil export di
            dalamnya akan dihapus dari komputer kamu. Ini tidak bisa dibatalkan.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={() => ref.current?.close()}
          className={cn(BUTTON, "bg-surface text-foreground ring-1 ring-inset ring-border hover:bg-muted hover:ring-input")}
        >
          Batal
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className={cn(BUTTON, "bg-danger/10 text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger/20")}
        >
          <Trash2 className="size-4" aria-hidden />
          {busy ? "Menghapus…" : "Hapus project"}
        </button>
      </div>
    </dialog>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [name, setName] = React.useState("");
  const [ratio, setRatio] = React.useState<string>(ASPECT_PRESETS[0].id);
  const [creating, setCreating] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [toDelete, setToDelete] = React.useState<ProjectSummary | null>(null);

  const removeFromList = (id: string) => {
    setState((current) =>
      current.status === "ready" ? { status: "ready", projects: current.projects.filter((project) => project.id !== id) } : current,
    );
    setToDelete(null);
  };

  React.useEffect(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Gagal memuat daftar project");
        setState({ status: "ready", projects: data.projects as ProjectSummary[] });
      })
      .catch((cause: Error) => setState({ status: "error", message: cause.message }));
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const preset = ASPECT_PRESETS.find((p) => p.id === ratio) ?? ASPECT_PRESETS[0];
    setCreating(true);
    setFormError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Tanpa judul", width: preset.width, height: preset.height }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gagal membuat project");
      router.push(`/editor/${data.id}`);
    } catch (cause) {
      setFormError((cause as Error).message);
      setCreating(false);
    }
  };

  const projects = state.status === "ready" ? state.projects : [];
  const shown = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  const totalMs = projects.reduce((sum, project) => sum + (project.durationMs ?? 0), 0);
  const latest = projects[0];
  const ready = state.status === "ready";
  const grid = "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 sm:gap-4";

  return (
    <div className="theme-garuda flex min-h-full flex-col bg-background text-foreground">
      <header className={cn("flex h-14 shrink-0 items-center justify-between gap-4", GUTTER)}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-9 items-center justify-center">
            <Logo className="h-5" />
          </span>
          <p className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">Kapkup</span>
            <span className="text-xs text-muted-foreground">Editor video</span>
          </p>
        </div>
        <a
          href="#project-name"
          className={cn(BUTTON, "h-9 bg-surface px-3.5 text-foreground ring-1 ring-inset ring-border hover:bg-muted hover:ring-input")}
        >
          <Plus className="size-4" />
          Project baru
        </a>
      </header>

      <main className={cn("flex w-full flex-1 flex-col gap-4 pt-4 pb-8 sm:gap-6 sm:pt-7 sm:pb-10", GUTTER)}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] sm:text-[28px] sm:leading-tight sm:tracking-[-0.02em]">
              Project
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:mt-1.5 sm:text-sm">
              Rangkai video, teks, dan musik di timeline. Semua tersimpan di komputer kamu.
            </p>
          </div>
          {projects.length > 0 && (
            <label className="relative block w-full lg:w-72">
              <span className="sr-only">Cari project</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari project"
                className={cn(FIELD, "pl-10")}
              />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatTile label="Jumlah project" value={ready ? String(projects.length) : "–"} icon={FolderOpen} />
          <StatTile label="Total durasi" value={ready ? (totalMs > 0 ? humanDuration(totalMs) : "0 dtk") : "–"} icon={Timer} />
          <div className="col-span-2 lg:col-span-1">
            <StatTile label="Terakhir diubah" value={latest ? latest.name : "–"} icon={Clock} />
          </div>
        </div>

        <section aria-labelledby="new-title" className={cn(CARD, "p-3.5 sm:p-5")}>
          <h2 id="new-title" className="text-sm font-semibold tracking-[-0.01em]">
            Project baru
          </h2>
          <form onSubmit={create} className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="min-w-0 xl:w-96">
              <label htmlFor="project-name" className="sr-only">
                Nama project
              </label>
              <input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Nama project, mis. Promo November"
                className={cn(FIELD, "bg-background")}
              />
            </div>
            <fieldset className="min-w-0 flex-1">
              <legend className="sr-only">Rasio layar</legend>
              <div className="flex flex-wrap gap-2">
                {ASPECT_PRESETS.map((preset) => (
                  <label
                    key={preset.id}
                    className={cn(
                      "flex h-11 cursor-pointer items-center rounded-xl px-3.5 text-sm font-medium ring-1 ring-inset transition-colors",
                      "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      ratio === preset.id
                        ? "bg-primary/15 text-foreground ring-primary"
                        : "text-muted-foreground ring-border hover:bg-muted hover:text-foreground hover:ring-input",
                    )}
                  >
                    <input
                      type="radio"
                      name="ratio"
                      className="sr-only"
                      checked={ratio === preset.id}
                      onChange={() => setRatio(preset.id)}
                    />
                    {preset.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <button type="submit" disabled={creating} className={cn(BUTTON, "bg-primary text-primary-foreground hover:bg-primary/85")}>
              <Plus className="size-4" />
              {creating ? "Membuat…" : "Buat project"}
            </button>
          </form>
          {formError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {formError}
            </p>
          )}
        </section>

        <section aria-labelledby="list-title" className="flex flex-1 flex-col gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <h2 id="list-title" className="text-sm font-semibold tracking-[-0.01em]">
              Project kamu
            </h2>
            {projects.length > 0 && <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{projects.length}</span>}
          </div>

          {state.status === "loading" && (
            <ul className={grid} aria-busy="true" aria-label="Memuat project">
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className={cn(CARD, "p-2")}>
                  <div className="aspect-video animate-pulse rounded-[14px] bg-muted" />
                  <div className="space-y-2 px-2 pt-3 pb-1.5">
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {state.status === "error" && (
            <p role="alert" className={cn(CARD, "p-5 text-sm text-danger ring-danger/40")}>
              {state.message}
            </p>
          )}

          {ready && projects.length === 0 && (
            <div className={cn(CARD, "flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center")}>
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Clapperboard className="size-6" aria-hidden />
              </span>
              <p className="text-base font-semibold">Belum ada project</p>
              <p className="max-w-sm text-sm text-muted-foreground">Beri nama di kotak Project baru di atas, lalu klik Buat project.</p>
            </div>
          )}

          {ready && projects.length > 0 && shown.length === 0 && (
            <div className={cn(CARD, "flex flex-col items-center gap-3 p-10 text-center")}>
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Search className="size-6" aria-hidden />
              </span>
              <p className="text-base font-semibold">Tidak ditemukan</p>
              <p className="text-sm text-muted-foreground">Tidak ada project bernama &ldquo;{query.trim()}&rdquo;.</p>
            </div>
          )}

          {shown.length > 0 && (
            <ul className={grid}>
              {shown.map((project) => (
                <ProjectCard key={project.id} project={project} onDelete={setToDelete} />
              ))}
            </ul>
          )}
        </section>
      </main>

      {toDelete && <DeleteDialog key={toDelete.id} project={toDelete} onClose={() => setToDelete(null)} onDeleted={removeFromList} />}

      <footer
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border py-4 text-xs text-muted-foreground",
          GUTTER,
        )}
      >
        <p>
          © {new Date().getFullYear()}{" "}
          <a
            href={COMPANY.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {COMPANY.name}
          </a>
          . Semua hak dilindungi.
        </p>
        <p>Kapkup · Editor video lokal</p>
      </footer>
    </div>
  );
}
