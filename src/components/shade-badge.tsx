import { Palette } from "lucide-react";
import { shadeColor } from "@/lib/shades";

/**
 * Visually distinctive tooth-shade badge.
 *
 * Renders the actual approximate tooth color as a swatch next to the shade
 * code so designers / technicians remember the target color before designing
 * and manufacturing. Highlighted with a gold ring to stand out in case data.
 */
export function ShadeBadge({
  shade,
  size = "md",
  className = "",
}: {
  shade?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (!shade) return null;
  const color = shadeColor(shade);

  const dims =
    size === "sm"
      ? { pad: "px-2 py-1", text: "text-xs", swatch: "size-4", icon: "size-3" }
      : size === "lg"
        ? { pad: "px-3.5 py-2", text: "text-base", swatch: "size-7", icon: "size-4" }
        : { pad: "px-3 py-1.5", text: "text-sm", swatch: "size-5", icon: "size-3.5" };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border-2 border-gold/70 bg-gold/10 font-extrabold shadow-gold ${dims.pad} ${dims.text} ${className}`}
      title={`لون السن: ${shade}`}
    >
      <Palette className={`${dims.icon} text-gold shrink-0`} />
      <span className="text-muted-foreground font-bold">اللون</span>
      <span
        className={`${dims.swatch} rounded-full ring-2 ring-foreground/20 shadow-inner shrink-0`}
        style={{
          background: color
            ? `radial-gradient(circle at 30% 30%, #ffffff55, ${color})`
            : "repeating-linear-gradient(45deg,#ccc,#ccc 3px,#eee 3px,#eee 6px)",
        }}
        aria-hidden
      />
      <span className="text-gold tracking-wide">{shade}</span>
    </span>
  );
}
