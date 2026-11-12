"use client";

import { ChevronLeft, CircleAlert, Check, LoaderCircle, Upload } from "lucide-react";
import Link from "next/link";
import { contentDurationMs } from "@/lib/project/schema";
import { useEditor } from "@/store/editor";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

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
      <Check className="size-3.5" /> Tersimpan
    </span>
  );
}

export function TopBar({ onExport }: { onExport: () => void }) {
  const name = useEditor((state) => state.project?.name ?? "");
  const rename = useEditor((state) => state.rename);
  const empty = useEditor((state) => (state.project ? contentDurationMs(state.project) === 0 : true));

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 px-2">
      <Link
        href="/"
        className="flex h-7 items-center gap-1 rounded-md pr-2 pl-1 text-sm font-semibold text-foreground hover:bg-muted"
        aria-label="Kembali ke daftar project"
      >
        <ChevronLeft className="size-4 text-muted-foreground" />
        <Logo className="mr-0.5 h-4" />
        Kapkup
      </Link>
      <div className="flex flex-1 items-center justify-center gap-3">
        <input
          aria-label="Nama project"
          value={name}
          onChange={(event) => rename(event.target.value)}
          maxLength={80}
          className="h-7 w-64 rounded-md border border-transparent bg-transparent px-2 text-center text-sm text-foreground hover:border-input focus:border-input focus:bg-background"
        />
        <SaveStatus />
      </div>
      <Button variant="primary" onClick={onExport} disabled={empty} title={empty ? "Timeline masih kosong" : undefined}>
        <Upload className="size-4" />
        Export
      </Button>
    </header>
  );
}
