/**
 * Patient & case data extraction from an uploaded dental scan ZIP.
 *
 * Dental scanners (3Shape, exocad, Medit, iTero, …) embed an order/manifest
 * file inside the exported .zip — usually XML, JSON, INI, or plain text.
 * We open the archive in the browser with JSZip, scan every text-like entry,
 * and best-effort extract:
 *   - patient name   → الاسم
 *   - patient phone  → رقم الهاتف
 *   - tooth numbers  → أرقام الأسنان (FDI 11-48)
 *   - teeth count    → عدد الأسنان
 *
 * Each field is independent: a field that can't be found is simply omitted,
 * so the caller can decide what to fill and what to notify about.
 */

export interface ScanExtraction {
  patient_name?: string;
  patient_phone?: string;
  tooth_number?: string; // comma-joined FDI numbers
  teeth_count?: string;
}

const TEXT_EXT =
  /\.(xml|json|txt|ini|cfg|info|csv|constructioninfo|dentalproject|meditproject|order|manifest|properties|conf)$/i;

/** Heuristic: should we try to read this entry as UTF-8 text? */
function looksTextual(name: string): boolean {
  if (TEXT_EXT.test(name)) return true;
  // Some scanners drop an extension-less manifest.
  return !/\.[a-z0-9]{2,5}$/i.test(name);
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const v = m[1].trim();
      if (v) return v;
    }
  }
  return null;
}

function extractName(text: string): string | null {
  // Combined first + last name (common in 3Shape / exocad order XML).
  const first = firstMatch(text, [
    /<(?:Patient)?FirstName>\s*([^<]+?)\s*<\//i,
    /["']?(?:patient_?)?first_?name["']?\s*[:=]\s*["']([^"'\n<]+)["']/i,
  ]);
  const last = firstMatch(text, [
    /<(?:Patient)?LastName>\s*([^<]+?)\s*<\//i,
    /["']?(?:patient_?)?last_?name["']?\s*[:=]\s*["']([^"'\n<]+)["']/i,
  ]);
  if (first || last) {
    const full = [first, last].filter(Boolean).join(" ").trim();
    if (full) return full;
  }

  // Single full-name field.
  return firstMatch(text, [
    /<(?:Patient(?:Full)?Name|PatientName|FullName|Name)>\s*([^<]+?)\s*<\//i,
    /["']?(?:patient_?name|patientname|patient_?full_?name|full_?name)["']?\s*[:=]\s*["']([^"'\n<]+)["']/i,
    /(?:patient(?:\s*name)?|اسم(?:\s*المريض)?)\s*[:=]\s*([^\n\r<;,]{2,80})/i,
  ]);
}

function extractPhone(text: string): string | null {
  const raw = firstMatch(text, [
    /<(?:Patient)?(?:Phone|PhoneNumber|Mobile|Tel|Telephone|Contact)>\s*([^<]+?)\s*<\//i,
    /["']?(?:patient_?)?(?:phone|phone_?number|mobile|tel|telephone|contact)["']?\s*[:=]\s*["']([^"'\n<]+)["']/i,
    /(?:phone|mobile|tel|هاتف|جوال|رقم(?:\s*الهاتف)?)\s*[:=]\s*([+\d][\d+\-\s]{6,18})/i,
  ]);
  if (!raw) return null;
  // Keep only digits / + and basic separators, validate length.
  const cleaned = raw.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return cleaned;
}

/** Pull FDI tooth numbers (11-48) from explicit tooth tags or attributes. */
function extractTeeth(text: string): string[] {
  const found = new Set<string>();

  // Tooth tags / attributes: <Tooth number="11">, <ToothNumber>24</ToothNumber>,
  // "tooth":36, ToothFdi="14"
  const patterns = [
    /<Tooth(?:Number|Fdi|ID)?[^>]*?(?:number|fdi|id)?\s*=\s*["'](\d{2})["']/gi,
    /<ToothNumber>\s*(\d{2})\s*<\/ToothNumber>/gi,
    /<(?:ToothFdi|FDI|TeethNumber)>\s*(\d{2})\s*<\//gi,
    /["'](?:tooth(?:_?number)?|fdi|teeth)["']\s*:\s*"?(\d{2})"?/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = Number(m[1]);
      const q = Math.floor(n / 10);
      const i = n % 10;
      if (q >= 1 && q <= 4 && i >= 1 && i <= 8) found.add(m[1]);
    }
  }

  return Array.from(found).sort((a, b) => Number(a) - Number(b));
}

function extractExplicitCount(text: string): string | null {
  return firstMatch(text, [
    /<(?:TeethCount|ToothCount|NumberOfTeeth|UnitsCount)>\s*(\d{1,2})\s*<\//i,
    /["']?(?:teeth_?count|tooth_?count|units?_?count|number_?of_?teeth)["']?\s*[:=]\s*"?(\d{1,2})"?/i,
    /(?:عدد(?:\s*الأسنان)?)\s*[:=]\s*(\d{1,2})/i,
  ]);
}

export async function extractScanData(file: File): Promise<ScanExtraction> {
  const result: ScanExtraction = {};
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return result;
  }

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);

  // Gather text from candidate entries (cap total to keep it fast).
  const entries: { name: string; entry: any }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && looksTextual(path)) entries.push({ name: path, entry });
  });

  // Prefer obvious manifest/order files first.
  entries.sort((a, b) => {
    const score = (n: string) =>
      /(order|manifest|patient|info|construction|project|dental)/i.test(n) ? 0 : 1;
    return score(a.name) - score(b.name);
  });

  let combined = "";
  const teeth = new Set<string>();

  for (const { entry } of entries) {
    if (combined.length > 600_000) break;
    let content = "";
    try {
      content = await entry.async("string");
    } catch {
      continue;
    }
    combined += "\n" + content;

    for (const t of extractTeeth(content)) teeth.add(t);
  }

  const name = extractName(combined);
  if (name) result.patient_name = name.slice(0, 80);

  const phone = extractPhone(combined);
  if (phone) result.patient_phone = phone;

  if (teeth.size > 0) {
    const sorted = Array.from(teeth).sort((a, b) => Number(a) - Number(b));
    result.tooth_number = sorted.join("، ");
    result.teeth_count = String(sorted.length);
  }

  // An explicit count in the file overrides the derived one.
  const explicit = extractExplicitCount(combined);
  if (explicit) result.teeth_count = explicit;

  return result;
}
