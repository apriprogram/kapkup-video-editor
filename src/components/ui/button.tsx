import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors " +
  "disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75",
  secondary: "bg-muted text-foreground hover:bg-input active:bg-input/80",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-input",
  danger: "bg-danger/15 text-danger hover:bg-danger/25 active:bg-danger/30",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3.5 text-sm",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

/** Kelas tombol untuk elemen lain yang harus tampak seperti tombol, mis. tautan unduh. */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export type IconButtonProps = Omit<ButtonProps, "size"> & {
  /** Wajib: dibacakan screen reader dan tampil sebagai tooltip. */
  label: string;
  active?: boolean;
};

export function IconButton({ label, active, variant = "ghost", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(base, variants[variant], "size-7 [&_svg]:size-4", active && "bg-muted text-primary", className)}
      {...props}
    />
  );
}
