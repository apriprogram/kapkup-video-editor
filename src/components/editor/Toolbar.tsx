"use client";

import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Captions,
  Copy,
  Film,
  FlipHorizontal2,
  LoaderCircle,
  Magnet,
  Maximize2,
  MousePointer2,
  Music,
  Redo2,
  RotateCw,
  Scissors,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { contentDurationMs, isVisual } from "@/lib/project/schema";
import { findItem } from "@/lib/timeline/ops";
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC, useEditor } from "@/store/editor";
import { Button, IconButton } from "@/components/ui/button";
import { Slider } from "@/components/ui/field";
import { findCaptionTarget, runAutoCaption } from "./autoCaption";
import { TIMELINE_HEADER_WIDTH } from "./Timeline";

function Divider() {
  return <span className="mx-1.5 h-4 w-px shrink-0 bg-border" aria-hidden />;
}

/** Satu klik: suara klip terpilih (atau klip bersuara terpanjang) dijadikan caption per kata. */
function AutoCaptionButton() {
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    const { project, selectedIds } = useEditor.getState();
    const target = project && findCaptionTarget(project, selectedIds);
    if (!target) {
      toast.info("Belum ada klip yang bersuara", { description: "Tambahkan video atau audio yang berisi ucapan ke timeline dulu." });
      return;
    }
    setBusy(true);
    try {
      await runAutoCaption(target.id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      onClick={run}
      disabled={busy}
      title="Caption otomatis: ubah ucapan di klip terpilih (atau klip bersuara terpanjang) menjadi teks caption. Bahasa ucapan diatur di panel Properti klip, bagian Caption otomatis (bawaan: Indonesia)"
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Captions className="size-3.5 text-primary" />}
      {busy ? "Mentranskripsi…" : "Caption otomatis"}
    </Button>
  );
}

export function Toolbar() {
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);
  const selectionCount = useEditor((state) => state.selectedIds.length);
  const selected = useEditor((state) =>
    state.project && state.selectedIds.length === 1 ? (findItem(state.project, state.selectedIds[0])?.item ?? null) : null,
  );
  const snap = useEditor((state) => state.snap);
  const pxPerSec = useEditor((state) => state.pxPerSec);
  const {
    undo,
    redo,
    splitAtPlayhead,
    trimToPlayhead,
    deleteSelected,
    duplicateSelected,
    toggleSnap,
    setPxPerSec,
    addTrack,
    updateItem,
    setTransform,
  } = useEditor.getState();

  const hasSelection = selectionCount > 0;
  const media = selected && (selected.type === "video" || selected.type === "image") ? selected : null;
  const visual = selected && isVisual(selected) ? selected : null;

  const fit = () => {
    const { project } = useEditor.getState();
    const scroller = document.querySelector<HTMLElement>("[data-timeline-scroll]");
    if (!project || !scroller) return;
    const seconds = Math.max(1, contentDurationMs(project) / 1000);
    setPxPerSec((scroller.clientWidth - TIMELINE_HEADER_WIDTH - 48) / seconds);
    scroller.scrollLeft = 0;
  };

  // Slider zoom memakai skala logaritmik supaya terasa rata di semua tingkat zoom.
  const sliderValue = Math.log(pxPerSec / MIN_PX_PER_SEC) / Math.log(MAX_PX_PER_SEC / MIN_PX_PER_SEC);
  const fromSlider = (value: number) => MIN_PX_PER_SEC * Math.pow(MAX_PX_PER_SEC / MIN_PX_PER_SEC, value);

  return (
    <div role="toolbar" aria-label="Alat timeline" className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2">
      <IconButton label="Alat pilih: klik untuk memilih, seret area kosong untuk kotak seleksi" active>
        <MousePointer2 />
      </IconButton>
      <Divider />
      <IconButton label="Urungkan (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
        <Undo2 />
      </IconButton>
      <IconButton label="Ulangi (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
        <Redo2 />
      </IconButton>
      <Divider />
      <IconButton label="Belah di garis waktu (Ctrl+B)" onClick={splitAtPlayhead}>
        <Scissors />
      </IconButton>
      <IconButton label="Buang bagian kiri garis waktu (Q)" onClick={() => trimToPlayhead("start")}>
        <ArrowLeftToLine />
      </IconButton>
      <IconButton label="Buang bagian kanan garis waktu (W)" onClick={() => trimToPlayhead("end")}>
        <ArrowRightToLine />
      </IconButton>
      <IconButton label="Hapus klip terpilih (Delete)" onClick={deleteSelected} disabled={!hasSelection}>
        <Trash2 />
      </IconButton>
      <IconButton label="Gandakan klip terpilih (Ctrl+D)" onClick={duplicateSelected} disabled={!hasSelection}>
        <Copy />
      </IconButton>
      <Divider />
      <IconButton
        label="Cerminkan (balik mendatar)"
        disabled={!media}
        active={media?.flipX}
        onClick={() =>
          media &&
          updateItem(
            media.id,
            (target) => {
              if (target.type === "video" || target.type === "image") target.flipX = !target.flipX;
            },
            "flipX",
          )
        }
      >
        <FlipHorizontal2 />
      </IconButton>
      <IconButton
        label="Putar 90°"
        disabled={!visual}
        onClick={() => {
          if (!visual) return;
          const next = ((Math.round(visual.transform.rotation / 90) + 1) * 90) % 360;
          setTransform(visual.id, { rotation: next > 180 ? next - 360 : next });
        }}
      >
        <RotateCw />
      </IconButton>
      <Divider />
      <IconButton label="Tambah track teks" onClick={() => addTrack("text")}>
        <Type />
      </IconButton>
      <IconButton label="Tambah track video" onClick={() => addTrack("video")}>
        <Film />
      </IconButton>
      <IconButton label="Tambah track audio" onClick={() => addTrack("audio")}>
        <Music />
      </IconButton>
      <Divider />
      <AutoCaptionButton />

      <div className="flex-1" />

      <IconButton label={snap ? "Tempel otomatis: aktif" : "Tempel otomatis: mati"} active={snap} onClick={toggleSnap}>
        <Magnet />
      </IconButton>
      <Divider />
      <IconButton label="Perkecil timeline" onClick={() => setPxPerSec(pxPerSec / 1.4)}>
        <ZoomOut />
      </IconButton>
      <Slider
        aria-label="Zoom timeline"
        className="w-24 shrink-0"
        min={0}
        max={1}
        step={0.01}
        value={sliderValue}
        onChange={(value) => setPxPerSec(fromSlider(value))}
      />
      <IconButton label="Perbesar timeline" onClick={() => setPxPerSec(pxPerSec * 1.4)}>
        <ZoomIn />
      </IconButton>
      <IconButton label="Paskan seluruh timeline" onClick={fit}>
        <Maximize2 />
      </IconButton>
    </div>
  );
}
