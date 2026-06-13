/**
 * Best-effort extraction of patient + case metadata from a dental scan ZIP.
 *
 * Dental scanners and CAD systems (3Shape, Medit, exocad, Dental Wings…)
 * embed an order/manifest file inside the exported archive — usually XML
 * or JSON (e.g. 3Shape `*.dcm` / `*.xorder`, exocad `*.constructionInfo`,
 * Medit `*.json`). We read the textual entries and mine them with a set of
 * tolerant patterns so the doctor's "حالة جديدة" form can be auto-filled.
 *
 * Everything here is best-effort: any field we cannot confidently find is
 * simply left out and reported back as "missing".
 */

export interface ExtractedCase {
  patient_name?: string;
  patient_phone?: string;
  patient_age?: string;
  patient_gender?: string;
  tooth_number?: string; // FDI codes, comma separated
  teeth_count?: string;
  shade?: string;
}

export interface ExtractResult {
  data: ExtractedCase;
  /** Arabic labels of the fields we successfully extracted. */
  found: string[];
  /** Arabic labels of the fields we could not find. */
  missing: string[];
}

const FIELD_LABELS: Record<keyof ExtractedCase, string> = {
  patient_name: "اسم المريض",
  patient_phone: "رقم الهاتف",
  patient_age: "العمر",
  patient_gender: "الجنس",
  tooth_number: "رقم السن (FDI)",
  teeth_count: "عدد الأسنان",
  shade: "اللون (Shade)",
};

const VALID_SHADES = [
  "A1","A2","A3","A3.5","A4","B1","B2","B3","B4",
  "C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4",
];

// Entries worth reading as text (metadata, not the heavy mesh/scan binaries).
const TEXT_EXT = /\.(xml|json|txt|ini|csv|info|constructioninfo|dentalproject|xorder|order|log|dat|meta|cfg|html?)$/i;
const META_HINT = /(order|manifest|patient|info|case|project|construction)/i;
const DCM_EXT = /\.dcm$/i; // 3Shape projects: XML wrapped in a .dcm container
const MAX_ENTRY_BYTES = 6 * 1024 * 1024;

function firstMatch(haystack: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = haystack.match(re);
    if (m && m[1] && m[1].trim()) return m[1].trim();
  }
  return null;
}

function cleanName(raw: string): string | null {
  const v = raw.replace(/\s+/g, " ").trim();
  if (v.length < 2 || v.length > 80) return null;
  // Reject obvious non-names (paths, numbers, guids).
  if (/^[\d\s.+\-]+$/.test(v)) return null;
  if (/[\\/]/.test(v)) return null;
  return v;
}

/** Pull patient/case data out of a single block of text. */
function mineText(text: string, acc: ExtractedCase, teeth: Set<string>) {
  // ---- Patient name -------------------------------------------------------
  if (!acc.patient_name) {
    const direct = firstMatch(text, [
      /<\s*(?:PatientName|Patient_Name|Name)\s*>\s*([^<]{2,80})\s*<\//i,
      /["']?(?:patient[_\s]*name|patientname|fullname)["']?\s*[:=]\s*["']([^"']{2,80})["']/i,
      /(?:اسم\s*المريض|المريض)\s*[:：=]\s*([^\n\r<,"']{2,80})/,
    ]);
    if (direct) acc.patient_name = cleanName(direct) ?? undefined;
    if (!acc.patient_name) {
      const first = firstMatch(text, [/<\s*PatientFirstName\s*>\s*([^<]{1,40})\s*<\//i, /["']?patientfirstname["']?\s*[:=]\s*["']([^"']{1,40})["']/i]);
      const last = firstMatch(text, [/<\s*PatientLastName\s*>\s*([^<]{1,40})\s*<\//i, /["']?patientlastname["']?\s*[:=]\s*["']([^"']{1,40})["']/i]);
      const joined = [first, last].filter(Boolean).join(" ").trim();
      if (joined) acc.patient_name = cleanName(joined) ?? undefined;
    }
  }

  // ---- Phone --------------------------------------------------------------
  if (!acc.patient_phone) {
    const phone = firstMatch(text, [
      /<\s*(?:Phone|Mobile|Tel(?:ephone)?|Contact)\s*>\s*([0-9+\-\s]{7,15})\s*<\//i,
      /["']?(?:phone|mobile|tel|telephone|contact)["']?\s*[:=]\s*["']?([0-9+\-\s]{7,15})/i,
      /(?:الهاتف|الجوال|رقم\s*الهاتف|الموبايل)\s*[:：=]\s*([0-9+\-\s]{7,15})/,
    ]);
    if (phone) {
      const digits = phone.replace(/\s+/g, " ").trim();
      if (digits.replace(/\D/g, "").length >= 7) acc.patient_phone = digits;
    }
  }

  // ---- Age ----------------------------------------------------------------
  if (!acc.patient_age) {
    const age = firstMatch(text, [
      /<\s*(?:Age|PatientAge)\s*>\s*(\d{1,3})\s*<\//i,
      /["']?(?:age|patient[_\s]*age)["']?\s*[:=]\s*["']?(\d{1,3})/i,
      /(?:العمر|السن)\s*[:：=]\s*(\d{1,3})/,
    ]);
    if (age && Number(age) > 0 && Number(age) <= 120) acc.patient_age = age;
  }

  // ---- Gender -------------------------------------------------------------
  if (!acc.patient_gender) {
    const g = firstMatch(text, [
      /<\s*(?:Gender|Sex)\s*>\s*(male|female|m|f|ذكر|أنثى|انثى)\s*<\//i,
      /["']?(?:gender|sex)["']?\s*[:=]\s*["']?(male|female|m|f|ذكر|أنثى|انثى)/i,
      /(?:الجنس)\s*[:：=]\s*(ذكر|أنثى|انثى|male|female)/,
    ]);
    if (g) {
      const v = g.toLowerCase();
      if (/^m|ذكر/.test(v)) acc.patient_gender = "male";
      else if (/^f|أنثى|انثى/.test(v)) acc.patient_gender = "female";
    }
  }

  // ---- Shade --------------------------------------------------------------
  if (!acc.shade) {
    const shade = firstMatch(text, [
      /<\s*(?:Shade|Color|Colour|VitaShade)\s*>\s*([A-D][1-4](?:\.5)?|BL[1-4]|OM[1-3])\s*<\//i,
      /["']?(?:shade|color|colour|vita)["']?\s*[:=]\s*["']?([A-D][1-4](?:\.5)?|BL[1-4]|OM[1-3])\b/i,
      /(?:اللون|الدرجة)\s*[:：=]\s*([A-D][1-4](?:\.5)?|BL[1-4]|OM[1-3])\b/i,
    ]);
    if (shade) {
      const norm = shade.toUpperCase();
      if (VALID_SHADES.includes(norm)) acc.shade = norm;
    }
  }

  // ---- Tooth numbers (FDI) ------------------------------------------------
  // 3Shape & friends repeat a tooth element per restoration.
  const toothPatterns = [
    /<\s*(?:ToothNumber|Tooth|FDI|ToothNo|ToothIndex)\s*>\s*([1-4][1-8])\s*<\//gi,
    /["']?(?:tooth[_\s]*(?:number|no|num)?|fdi)["']?\s*[:=]\s*["']?([1-4][1-8])\b/gi,
    /(?:رقم\s*السن|السن)\s*[:：=]\s*([1-4][1-8])\b/g,
  ];
  for (const re of toothPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) teeth.add(m[1]);
    }
  }
}

/** Recursively mine a parsed JSON object for known keys. */
function mineJson(obj: unknown, acc: ExtractedCase, teeth: Set<string>) {
  if (!obj || typeof obj !== "object") return;
  for (const [rawKey, val] of Object.entries(obj as Record<string, unknown>)) {
    const key = rawKey.toLowerCase().replace(/[_\s]/g, "");
    if (val && typeof val === "object") {
      mineJson(val, acc, teeth);
      continue;
    }
    const sval = val == null ? "" : String(val).trim();
    if (!sval) continue;
    if (!acc.patient_name && /(patientname|fullname)/.test(key)) acc.patient_name = cleanName(sval) ?? acc.patient_name;
    else if (!acc.patient_phone && /(phone|mobile|tel|contact)/.test(key) && sval.replace(/\D/g, "").length >= 7) acc.patient_phone = sval;
    else if (!acc.patient_age && /(age)/.test(key) && /^\d{1,3}$/.test(sval) && Number(sval) <= 120) acc.patient_age = sval;
    else if (!acc.patient_gender && /(gender|sex)/.test(key)) {
      if (/^m|ذكر/i.test(sval)) acc.patient_gender = "male";
      else if (/^f|أنثى|انثى/i.test(sval)) acc.patient_gender = "female";
    } else if (!acc.shade && /(shade|vita|colou?r)/.test(key)) {
      const norm = sval.toUpperCase();
      if (VALID_SHADES.includes(norm)) acc.shade = norm;
    } else if (/(tooth|fdi)/.test(key)) {
      const mm = sval.match(/[1-4][1-8]/g);
      mm?.forEach((t) => teeth.add(t));
    }
  }
}

/**
 * Extract patient + case metadata from a scan ZIP file (browser only).
 */
export async function extractScanMetadata(file: File): Promise<ExtractResult> {
  const acc: ExtractedCase = {};
  const teeth = new Set<string>();

  try {
    const buf = await file.arrayBuffer();
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buf);

    const entries: { name: string; entry: any }[] = [];
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const wanted = TEXT_EXT.test(path) || META_HINT.test(path) || DCM_EXT.test(path);
      if (wanted) entries.push({ name: path, entry });
    });

    for (const { name, entry } of entries) {
      const size = (entry as any)._data?.uncompressedSize ?? 0;
      if (size && size > MAX_ENTRY_BYTES) continue;
      let text = "";
      try {
        text = await entry.async("string");
      } catch {
        continue;
      }
      if (!text) continue;

      // Try structured JSON first when it looks like JSON.
      const trimmed = text.trimStart();
      if (/\.json$/i.test(name) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          mineJson(JSON.parse(text), acc, teeth);
        } catch {
          /* fall through to text mining */
        }
      }
      mineText(text, acc, teeth);
    }
  } catch {
    // Corrupt / non-zip — return empty result, caller will notify.
  }

  if (teeth.size > 0) {
    const sorted = Array.from(teeth).sort((a, b) => Number(a) - Number(b));
    acc.tooth_number = sorted.join("، ");
    if (!acc.teeth_count) acc.teeth_count = String(sorted.length);
  }

  const found: string[] = [];
  const missing: string[] = [];
  (Object.keys(FIELD_LABELS) as (keyof ExtractedCase)[]).forEach((k) => {
    if (acc[k]) found.push(FIELD_LABELS[k]);
    else missing.push(FIELD_LABELS[k]);
  });

  return { data: acc, found, missing };
}
