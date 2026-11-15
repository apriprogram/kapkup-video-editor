"use client";

import { AudioLines, LoaderCircle } from "lucide-react";
import * as React from "react";
import { applyVariables, type Asset, type TextItem } from "@/lib/project/schema";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Section, Slider, TextArea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { createSpeech, useTtsInfo, useTtsPrefs, type TtsInfo, type TtsPrefs } from "./speech";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Pilihan suara, bahasa, dan kecepatan; dipakai tab Suara dan panel Properti klip teks. */
function VoiceFields({ info, prefs, onChange }: { info: TtsInfo | null; prefs: TtsPrefs; onChange: (patch: Partial<TtsPrefs>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Suara">
          <Select
            aria-label="Suara"
            value={prefs.voice}
            onChange={(voice) => onChange({ voice })}
            options={(info?.voices ?? []).map((item) => ({ value: String(item.id), label: item.label }))}
            disabled={!info}
          />
        </Field>
        <Field label="Bahasa teks">
          <Select
            aria-label="Bahasa teks"
            value={prefs.language}
            onChange={(language) => onChange({ language })}
            options={info?.languages ?? []}
            disabled={!info}
          />
        </Field>
      </div>
      <Field label={`Kecepatan bicara · ${prefs.speed.toFixed(2)}x`}>
        <Slider aria-label="Kecepatan bicara" min={0.7} max={1.5} step={0.05} value={prefs.speed} onChange={(speed) => onChange({ speed })} />
      </Field>
    </>
  );
}

/** Tab Suara: teks bebas diubah menjadi klip audio (mesin suara lokal) lalu ditaruh di garis waktu. */
export function TtsPanel({ projectId }: { projectId: string }) {
  const info = useTtsInfo(projectId);
  const [prefs, setPrefs] = useTtsPrefs();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [last, setLast] = React.useState<Asset | null>(null);
  const maxChars = info?.maxChars ?? 3000;

  const run = async () => {
    if (!info || busy) return;
    setBusy(true);
    try {
      const asset = await createSpeech(projectId, info, { text, prefs });
      if (asset) setLast(asset);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div>
        <p className="text-xs font-semibold">Teks jadi suara</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tulis kalimatnya, pilih suara, lalu suaranya masuk ke timeline sebagai klip audio di garis waktu.
        </p>
      </div>

      <Field label="Teks yang dibacakan">
        <TextArea
          aria-label="Teks yang dibacakan"
          value={text}
          maxLength={maxChars}
          rows={5}
          placeholder="Contoh: Halo, selamat datang di channel kami."
          onChange={(event) => setText(event.target.value)}
          className="min-h-28"
        />
        <span className="self-end text-[11px] text-muted-foreground tabular-nums">
          {text.length} / {maxChars}
        </span>
      </Field>

      <VoiceFields info={info} prefs={prefs} onChange={setPrefs} />

      <Button variant="primary" onClick={run} disabled={!info || !text.trim() || busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <AudioLines className="size-4" />}
        {busy ? "Membuat suara…" : "Buat suara"}
      </Button>

      {last && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-2.5">
          <p className="truncate text-xs font-medium" title={last.name}>
            {last.name}
          </p>
          <audio controls preload="metadata" src={`/api/projects/${projectId}/files/${last.path}`} className="h-8 w-full" />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {info && !info.ready
          ? `Pemakaian pertama mengunduh model suara sekitar ${info.downloadMb} MB. Setelah itu berjalan tanpa internet.`
          : "Suara dibuat di komputer ini; teks tidak dikirim ke internet. Untuk membacakan teks yang sudah ada di video, pilih klip teksnya lalu buka bagian Teks jadi suara di panel Properti."}
      </p>
    </div>
  );
}

/** Di panel Properti klip teks: isi teks itu dibacakan, dan suaranya mulai tepat di awal klip teksnya. */
export function TextSpeechSection({ item }: { item: TextItem }) {
  const projectId = useEditor((state) => state.projectId);
  const info = useTtsInfo(projectId);
  const [prefs, setPrefs] = useTtsPrefs();
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    const state = useEditor.getState();
    if (!projectId || !info || busy || !state.project) return;
    setBusy(true);
    try {
      // Penanda {{nama}} dibacakan sebagai nilainya, sama seperti yang tampil di video.
      await createSpeech(projectId, info, { text: applyVariables(item.text, state.project.variables), prefs, startMs: item.startMs });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Teks jadi suara">
      <VoiceFields info={info} prefs={prefs} onChange={setPrefs} />
      <Button size="sm" onClick={run} disabled={!info || busy || !item.text.trim()}>
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5 text-primary" />}
        {busy ? "Membuat suara…" : "Bacakan teks ini"}
      </Button>
      <p className="text-xs text-muted-foreground">Suaranya menjadi klip audio yang mulai bersamaan dengan teks ini.</p>
    </Section>
  );
}
