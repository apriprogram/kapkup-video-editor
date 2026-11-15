"use client";

import { ChevronLeft, CircleAlert, Check, LoaderCircle, PanelRight, PanelTop, Upload } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { contentDurationMs } from "@/lib/project/schema";
import { cn } from "@/lib/utils";
import { useEditor } from "@/store/editor";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import type { WorkspaceLayout } from "./Editor";

function SaveStatus() {
  const saveState = useEditor((state) => state.saveState);
  const dirty = useEditor((state) => state.dirty);
  if (saveState === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-danger" role="status">
        <CircleAlert className="size-3.5" /> Gagal menyimpan
      </span>
    );
  }
  if (saveState === "saving" || dirty) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
        <LoaderCircle className="size-3.5 animate-spin" /> Menyimpan…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
      <Check className="size-3.5 text-success" /> Tersimpan
    </span>
  );
}

const LAYOUTS: { id: WorkspaceLayout; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "vertical", label: "Vertikal", hint: "Player tinggi di kanan. Cocok untuk Story, Reels, dan TikTok.", icon: PanelRight },
  { id: "horizontal", label: "Horizontal", hint: "Player lebar di tengah atas, timeline selebar layar. Cocok untuk video 16:9.", icon: PanelTop },
];

/** Pilihan lembar kerja: letak player mengikuti bentuk video yang sedang dibuat. */
function LayoutSwitch({ value, onChange }: { value: WorkspaceLayout; onChange: (value: WorkspaceLayout) => void }) {
  return (
    <div role="radiogroup" aria-label="Lembar kerja" className="flex h-8 items-center gap-0.5 rounded-lg bg-surface p-0.5">
      {LAYOUTS.map((option) => {
        const Icon = option.icon;
        const checked = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            title={`Lembar kerja ${option.label.toLowerCase()}: ${option.hint}`}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              checked ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("size-3.5", checked && "text-primary")} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TopBar({
  onExport,
  layout,
  onLayoutChange,
}: {
  onExport: () => void;
  layout: WorkspaceLayout;
  onLayoutChange: (value: WorkspaceLayout) => void;
}) {
  const name = useEditor((state) => state.project?.name ?? "");
  const rename = useEditor((state) => state.rename);
  const empty = useEditor((state) => (state.project ? contentDurationMs(state.project) === 0 : true));

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-2.5">
      <div className="flex items-center">
        <Link
          href="/"
          className="flex h-8 items-center gap-1.5 rounded-lg pr-2.5 pl-1 text-sm font-semibold text-foreground hover:bg-muted"
          aria-label="Kembali ke daftar project"
          title="Kembali ke daftar project"
        >
          <ChevronLeft className="size-4 text-muted-foreground" />
          <Logo className="h-4" />
          Kapkup
        </Link>
      </div>
      <div className="flex min-w-0 items-center justify-center gap-3">
        <input
          aria-label="Nama project"
          title="Klik untuk mengganti nama project"
          value={name}
          onChange={(event) => rename(event.target.value)}
          maxLength={80}
          className="h-8 w-64 min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-center text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-surface focus:bg-surface"
        />
        <SaveStatus />
      </div>
      <div className="flex items-center justify-end gap-2.5">
        <LayoutSwitch value={layout} onChange={onLayoutChange} />
        <Button variant="primary" onClick={onExport} disabled={empty} title={empty ? "Timeline masih kosong" : undefined}>
          <Upload className="size-4" />
          Export
        </Button>
      </div>
    </header>
  );
}
