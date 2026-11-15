"use client";

import { Trash2, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { TRANSITIONS } from "@/lib/project/catalog";
import { findItem } from "@/lib/timeline/ops";
import { useEditor } from "@/store/editor";
import { Button, IconButton } from "@/components/ui/button";
import { Slider } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

const OPTIONS = TRANSITIONS.map((entry) => ({ value: entry.id, label: entry.label }));
const WIDTH = 256;

/**
 * Kotak kecil di atas lencana transisi di timeline: ganti jenis, atur durasi, hapus.
 * `anchor` = titik tengah-atas lencana dalam koordinat layar saat lencana diklik.
 */
export function TransitionPopover({ itemId, anchor }: { itemId: string; anchor: { x: number; y: number } }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const item = useEditor((state) => {
    const found = state.project ? findItem(state.project, itemId) : null;
    return found && (found.item.type === "video" || found.item.type === "image") ? found.item : null;
  });
  const transition = item?.transitionIn ?? null;
  const gone = transition === null;

  React.useEffect(() => {
    const close = () => useEditor.getState().editTransition(null);
    // Transisinya sudah tidak ada (dihapus atau di-undo): pilihan ikut ditutup.
    if (gone) {
      close();
      return;
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      // Daftar dropdown digambar di luar kotak ini; lencana mengurus buka-tutupnya sendiri.
      if (!target || ref.current?.contains(target) || target.closest("[data-select-popup], [data-transition-badge]")) return;
      close();
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", close);
    };
  }, [gone]);

  if (!item || !transition) return null;
  const { setTransition, editTransition } = useEditor.getState();
  const maxSeconds = Math.max(0.1, Math.min(3, item.durationMs / 1000));
  // Di atas lencana; kalau tempatnya sempit (track paling atas), di bawahnya.
  const above = anchor.y > 230;

  return createPortal(
    <div
      ref={ref}
      role="group"
      aria-label="Pengaturan transisi"
      style={{
        left: Math.min(Math.max(8, anchor.x - WIDTH / 2), window.innerWidth - WIDTH - 8),
        width: WIDTH,
        ...(above ? { bottom: window.innerHeight - anchor.y + 10 } : { top: anchor.y + 30 }),
      }}
      className="fixed z-[60] flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3 text-foreground shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Transisi</p>
        <IconButton label="Tutup" className="size-6" onClick={() => editTransition(null)}>
          <X />
        </IconButton>
      </div>
      <Select
        aria-label="Jenis transisi"
        value={transition.type}
        onChange={(type) => setTransition(itemId, { type, durationMs: transition.durationMs })}
        options={OPTIONS}
        searchable
      />
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">Durasi</span>
        <Slider
          aria-label="Durasi transisi (detik)"
          className="flex-1"
          min={0.1}
          max={maxSeconds}
          step={0.05}
          value={transition.durationMs / 1000}
          onChange={(value) => setTransition(itemId, { type: transition.type, durationMs: Math.round(value * 1000) })}
        />
        <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums">{(transition.durationMs / 1000).toFixed(2)} dtk</span>
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          setTransition(itemId, null);
          editTransition(null);
        }}
      >
        <Trash2 className="size-3.5" />
        Hapus transisi
      </Button>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Cara lain: seret garis putih di awal klip untuk mengubah durasi, atau tekan Delete untuk menghapus.
      </p>
    </div>,
    document.body,
  );
}
