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
  // VITA 3D-Master (value 0-5, hue L/M/R, chroma)
  // Level 1 (lightest)
  "1M1": "#EFE9D6", "1M2": "#EAE2C9",
  // Level 2
  "2M1": "#E6DDC2", "2M2": "#E0D5B4", "2M3": "#D9CBA4",
  "2L1.5": "#E4DCBE", "2L2.5": "#DCD0AC",
  "2R1.5": "#E2D7BB", "2R2.5": "#D8CAA6",
  // Level 3
  "3M1": "#DACFAE", "3M2": "#D2C49E", "3M3": "#C9B98E",
  "3L1.5": "#D7CCA8", "3L2.5": "#CCBE96",
  "3R1.5": "#D4C7A2", "3R2.5": "#CBBB90",
  // Level 4
  "4M1": "#CBBE96", "4M2": "#C2B286", "4M3": "#B8A576",
  "4L1.5": "#C8BA90", "4L2.5": "#BCAC7E",
  "4R1.5": "#C5B68A", "4R2.5": "#BAA878",
  // Level 5 (darkest)
  "5M1": "#BBAC7F", "5M2": "#B09F6F", "5M3": "#A4925F",
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
