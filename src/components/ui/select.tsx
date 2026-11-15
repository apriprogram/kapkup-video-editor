"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type SelectOption<T extends string> = { value: T; label: string; hint?: string };

type SelectProps<T extends string> = {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  className?: string;
  disabled?: boolean;
  /** Menaruh kotak pencarian di atas daftar; untuk daftar panjang seperti font. */
  searchable?: boolean;
  /** Gaya tambahan untuk teks tiap pilihan, mis. menampilkan nama font dengan font itu sendiri. */
  optionStyle?: (option: SelectOption<T>) => React.CSSProperties | undefined;
  "aria-label"?: string;
};

type Box = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const MAX_HEIGHT = 272;

/**
 * Dropdown seragam untuk seluruh editor. Daftarnya digambar di `body` supaya tidak
 * terpotong panel yang bisa digulir. Tanpa pencarian, fokus tetap di tombol (pola
 * combobox); dengan `searchable`, fokus pindah ke kotak pencarian selagi terbuka.
 */
export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  className,
  disabled,
  searchable = false,
  optionStyle,
  ...rest
}: SelectProps<T>) {
  const listId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const typed = React.useRef({ text: "", at: 0 });
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [query, setQuery] = React.useState("");
  const [box, setBox] = React.useState<Box | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const current = options.find((option) => option.value === value);
  const shown = React.useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return searchable && wanted ? options.filter((option) => option.label.toLowerCase().includes(wanted)) : options;
  }, [options, query, searchable]);

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (disabled || !rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 160 && above > below;
    setBox({
      left: rect.left,
      width: rect.width,
      ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      maxHeight: Math.max(96, Math.min(MAX_HEIGHT + (searchable ? 40 : 0), up ? above : below)),
    });
    setQuery("");
    setActive(selectedIndex);
    setOpen(true);
  };

  /** Menutup lewat keyboard atau pilihan: fokus dikembalikan ke tombol. */
  const close = () => {
    setOpen(false);
    if (searchable) triggerRef.current?.focus();
  };

  const pick = (index: number) => {
    const option = shown[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  };

  // Tutup saat klik di luar, saat panel digulir, atau saat jendela berubah ukuran.
  React.useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node && (triggerRef.current?.contains(target) || popupRef.current?.contains(target));
    const onPointer = (event: PointerEvent) => !inside(event.target) && setOpen(false);
    const onScroll = (event: Event) => !popupRef.current?.contains(event.target as Node) && setOpen(false);
    const onResize = () => setOpen(false);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  /** Dipakai tombol dan kotak pencarian. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const { key } = event;
    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") {
        event.preventDefault();
        event.stopPropagation();
        show();
      }
      return;
    }
    // Selagi terbuka, tombol tidak boleh sampai ke shortcut editor atau menutup dialog.
    event.stopPropagation();
    const last = shown.length - 1;
    if (key === "Escape" || key === "Tab") {
      if (key === "Escape") event.preventDefault();
      close();
    } else if (key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(last, index + 1));
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (key === "Home" && !searchable) {
      event.preventDefault();
      setActive(0);
    } else if (key === "End" && !searchable) {
      event.preventDefault();
      setActive(last);
    } else if (key === "Enter" || (key === " " && !searchable)) {
      event.preventDefault();
      pick(active);
    } else if (key.length === 1 && !searchable) {
      // Ketik huruf untuk melompat ke pilihan yang diawali huruf itu.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at > 600 ? "" : typed.current.text) + key.toLowerCase(), at: now };
      const match = shown.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  };

  return (
    <>
      <button
        {...rest}
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && !searchable ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-7 w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border bg-background pr-1.5 pl-2 text-left text-xs text-foreground transition-colors",
          "hover:border-input focus-visible:border-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
          open && "border-ring",
          className,
        )}
      >
        <span className="min-w-0 truncate" style={current ? optionStyle?.(current) : undefined}>
          {current?.label ?? "Pilih…"}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open &&
        box &&
        createPortal(
          <div
            ref={popupRef}
            data-select-popup
            style={{ left: box.left, top: box.top, bottom: box.bottom, minWidth: box.width, maxHeight: box.maxHeight }}
            className="fixed z-[70] flex max-w-[320px] flex-col overflow-hidden rounded-lg border border-border bg-surface text-foreground shadow-xl"
          >
            {searchable && (
              <label className="relative block shrink-0 border-b border-border p-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  placeholder="Cari…"
                  aria-label={`Cari ${rest["aria-label"] ?? "pilihan"}`}
                  aria-controls={listId}
                  aria-activedescendant={`${listId}-${active}`}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  className="h-7 w-full rounded-md border border-border bg-background pr-2 pl-7 text-xs text-foreground placeholder:text-muted-foreground"
                />
              </label>
            )}
            <ul ref={listRef} id={listId} role="listbox" aria-label={rest["aria-label"]} className="min-h-0 flex-1 overflow-y-auto p-1">
              {shown.map((option, index) => {
                const selected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    // Tanpa ini fokus berpindah sebelum klik sampai.
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => active !== index && setActive(index)}
                    onClick={() => pick(index)}
                    className={cn(
                      // Pilihan di luar layar tidak digambar dulu, supaya daftar ratusan font tetap ringan.
                      "flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs [contain-intrinsic-size:auto_28px] [content-visibility:auto]",
                      index === active ? "bg-muted text-foreground" : "text-muted-foreground",
                      selected && "font-medium text-primary",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={optionStyle?.(option)}>
                        {option.label}
                      </span>
                      {option.hint && <span className="block truncate text-[11px] font-normal text-muted-foreground">{option.hint}</span>}
                    </span>
                    {selected && <Check className="size-3.5 shrink-0" aria-hidden />}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Tidak ditemukan</li>}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
