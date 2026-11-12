"use client";

import * as React from "react";
import { clamp, cn } from "@/lib/utils";

const inputClass =
  "h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground " +
  "placeholder:text-muted-foreground disabled:opacity-40";

export function Section({
  title,
  actions,
  children,
}: {
  title: string;
  /** Tombol kecil di kanan judul, mis. reset atau keyframe. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="mb-2.5 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {actions && <div className="flex items-center gap-0.5">{actions}</div>}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={htmlFor} className="w-16 shrink-0 text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

type NumberInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Jumlah angka di belakang koma yang ditampilkan. */
  digits?: number;
  className?: string;
  "aria-label"?: string;
};

/** Input angka yang baru menerapkan nilainya saat valid, supaya mengetik "1." tidak melompat. */
export function NumberInput({ value, onChange, min, max, step = 1, digits = 0, className, ...rest }: NumberInputProps) {
  const shown = Number(value.toFixed(digits)).toString();
  const [draft, setDraft] = React.useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(",", "."));
    if (raw.trim() !== "" && Number.isFinite(parsed)) {
      onChange(clamp(parsed, min ?? -Infinity, max ?? Infinity));
    }
    setDraft(null);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={cn(inputClass, "w-16 shrink-0 text-right tabular-nums", className)}
      value={draft ?? shown}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => draft !== null && commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(null);
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const direction = event.key === "ArrowUp" ? 1 : -1;
          onChange(clamp(value + direction * step, min ?? -Infinity, max ?? Infinity));
          setDraft(null);
        }
      }}
    />
  );
}

type SliderFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  digits?: number;
  /** Isi tambahan di ujung kanan baris, mis. tombol keyframe. */
  after?: React.ReactNode;
};

export function SliderField({ label, value, onChange, min, max, step = 1, digits = 0, after }: SliderFieldProps) {
  const id = React.useId();
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="range"
        className="h-7 min-w-0 flex-1 cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={clamp(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <NumberInput aria-label={label} value={value} onChange={onChange} min={min} max={max} step={step} digits={digits} />
      {after}
    </Row>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="color"
        value={hex}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5"
      />
      <span className="text-xs text-muted-foreground tabular-nums">{hex.toUpperCase()}</span>
    </Row>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  const id = React.useId();
  return (
    <Row label={label} htmlFor={id}>
      <select id={id} className={cn(inputClass, "cursor-pointer")} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "h-auto min-h-16 resize-y py-1.5 leading-snug", props.className)} />;
}
