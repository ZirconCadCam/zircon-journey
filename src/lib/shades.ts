/**
 * VITA-style tooth shade → approximate display color.
 *
 * These hex values are visual approximations of the classical VITA shade
 * guide (and common bleach shades) so designers / technicians can recall the
 * target tooth color at a glance before designing or manufacturing.
 */
export const SHADE_COLORS: Record<string, string> = {
  // A — reddish-brown
  A1: "#E8E0CC", A2: "#E0D4B4", A3: "#D6C49E", "A3.5": "#CBB488", A4: "#BD9F6E",
  // B — reddish-yellow
  B1: "#ECE7D2", B2: "#E2D8B6", B3: "#D2BE92", B4: "#C6AE7C",
  // C — greyish
  C1: "#DAD4C0", C2: "#C9BFA0", C3: "#B6A988", C4: "#9C8C6C",
  // D — reddish-grey
  D2: "#D5CDB6", D3: "#C3B697", D4: "#B4A482",
  // Bleach (very light)
  BL1: "#F4F1E9", BL2: "#EFEBDD", BL3: "#E8E3D2", BL4: "#E1DBC6",
  // Some labs use numeric bleach codes
  OM1: "#F5F2EA", OM2: "#F0ECDF", OM3: "#EAE5D5",
};

/** Resolve an approximate hex color for a shade code (case-insensitive). */
export function shadeColor(shade?: string | null): string | null {
  if (!shade) return null;
  const key = shade.trim().toUpperCase();
  return SHADE_COLORS[key] ?? null;
}

/** Decide whether a hex color is light (to pick a readable contrasting outline). */
export function isLightColor(hex: string): boolean {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}
