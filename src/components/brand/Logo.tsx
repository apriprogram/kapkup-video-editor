import { cn } from "@/lib/utils";

const MASK = "url(/brand/logo.svg)";

/**
 * Logo Kapkup (public/brand/logo.svg). Digambar lewat mask supaya warnanya
 * mengikuti warna teks di sekitarnya, jadi ikut tema terang maupun gelap.
 * Atur tingginya lewat `className` (mis. "h-5"); lebarnya menyesuaikan.
 */
export function Logo({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        aspectRatio: "768 / 662",
        maskImage: MASK,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: MASK,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
