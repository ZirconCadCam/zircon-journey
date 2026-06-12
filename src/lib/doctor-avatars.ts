import ahmedAlshatbi from "@/assets/doctors/ahmed-alshatbi.jpg.asset.json";
import hamedFaisal from "@/assets/doctors/hamed-faisal.jpg.asset.json";
import taghreedAlaghbari from "@/assets/doctors/taghreed-alaghbari.png.asset.json";
import mohammedAlasadi from "@/assets/doctors/mohammed-alasadi.jpg.asset.json";
import mohammedAlshatbi from "@/assets/doctors/mohammed-alshatbi.png.asset.json";
import mohammedAlbadji from "@/assets/doctors/mohammed-albadji.png.asset.json";
import husamBajash from "@/assets/doctors/husam-bajash.jpg.asset.json";
import abdulrahmanAlzawahi from "@/assets/doctors/abdulrahman-alzawahi.jpg.asset.json";
import { getOverrideUrl } from "@/lib/avatar-store";

/**
 * Normalize an Arabic doctor name for matching:
 * - strip the "د." / "دكتور" honorific prefix
 * - unify alef/hamza/ya/ta-marbuta variants
 * - collapse whitespace and remove tatweel/diacritics
 */
export function normalizeDoctorName(raw: string): string {
  return (raw || "")
    .replace(/^\s*(د\.?|دكتور|الدكتور|دكتوره|الدكتوره)\s*/u, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keyword sets (normalized) → avatar URL. Matched if all keywords are present. */
const ENTRIES: { keys: string[]; url: string }[] = [
  { keys: ["احمد", "الشطبي"], url: ahmedAlshatbi.url },
  { keys: ["حامد", "فيصل"], url: hamedFaisal.url },
  { keys: ["تغريد", "الاغبري"], url: taghreedAlaghbari.url },
  { keys: ["محمد", "الاسدي"], url: mohammedAlasadi.url },
  { keys: ["محمد", "الشطبي"], url: mohammedAlshatbi.url },
  { keys: ["محمد", "البدجي"], url: mohammedAlbadji.url },
  { keys: ["حسام", "بجاش"], url: husamBajash.url },
  { keys: ["عبدالرحمن", "الزواحي"], url: abdulrahmanAlzawahi.url },
];

/** Subject key used to store an admin-assigned photo for a doctor. */
export function doctorSubject(name: string | null | undefined): string {
  return `doctor:${normalizeDoctorName(name || "")}`;
}

/**
 * Return the avatar URL for a doctor name. Admin-assigned photos (stored in
 * avatar_overrides) take priority over the built-in bundled photos.
 */
export function getDoctorAvatar(name: string | null | undefined): string | null {
  if (!name) return null;
  const override = getOverrideUrl(doctorSubject(name));
  if (override) return override;
  const n = normalizeDoctorName(name);
  if (!n) return null;
  for (const e of ENTRIES) {
    if (e.keys.every(k => n.includes(k))) return e.url;
  }
  return null;
}

