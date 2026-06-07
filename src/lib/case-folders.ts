/**
 * Case folder taxonomy — defines the device file-manager structure for the
 * "حالات مركز زركون" (Zircon Center Cases) Android app.
 *
 * Root folder:  حالات مركز زركون
 *   ├─ الطبيب/<اسم الطبيب>/<اسم المريض>/<الفئة>     (uploaded / images / downloaded)
 *   ├─ المصمم/<اسم الطبيب>/<كود الحالة>/...
 *   ├─ الفني/<اسم الطبيب>/<كود الحالة>/...
 *   └─ الإداري/<اسم الطبيب>/<كود الحالة>/...        (full reference archive)
 *
 * The same helpers run on web (File System Access API) and on native
 * (Capacitor Filesystem) so the layout stays identical everywhere.
 */

export const ROOT_FOLDER = "حالات مركز زركون";

export const ROLE_FOLDERS = {
  doctor: "الطبيب",
  designer: "المصمم",
  technician: "الفني",
  admin: "الإداري",
} as const;

export type CaseRole = keyof typeof ROLE_FOLDERS;

/** File categories used inside a patient/case folder (mainly for the doctor). */
export const FILE_CATEGORIES = {
  uploaded: "ملفات الحالة المرفوعة",
  images: "الصور المرسلة",
  downloaded: "ملفات تم تنزيلها",
} as const;

export type FileCategory = keyof typeof FILE_CATEGORIES;

export interface CaseFileLocation {
  role: CaseRole;
  doctorName?: string;
  patientName?: string;
  caseCode?: string;
  category?: FileCategory;
}

/** Remove characters that are illegal in file/folder names across platforms. */
export function sanitizeSegment(seg: string | undefined | null): string {
  const s = (seg ?? "").toString().trim();
  if (!s) return "غير معروف";
  return s
    .replace(/[\\/:*?"<>|]/g, "_") // illegal on Android/Windows
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "") // no trailing dots
    .slice(0, 80) || "غير معروف";
}

/**
 * Build the ordered list of folder segments (under the root) for a given
 * location. Empty/missing segments are skipped so callers can pass partial
 * context safely.
 */
export function buildCasePath(loc: CaseFileLocation): string[] {
  const segs: string[] = [ROLE_FOLDERS[loc.role]];

  if (loc.role === "doctor") {
    if (loc.doctorName) segs.push(sanitizeSegment(loc.doctorName));
    if (loc.patientName) segs.push(sanitizeSegment(loc.patientName));
    if (loc.category) segs.push(FILE_CATEGORIES[loc.category]);
    return segs;
  }

  // designer / technician / admin: organised by doctor then case code.
  if (loc.doctorName) segs.push(sanitizeSegment(loc.doctorName));
  if (loc.caseCode) segs.push(sanitizeSegment(loc.caseCode));
  if (loc.category) segs.push(FILE_CATEGORIES[loc.category]);
  return segs;
}

/** Human-readable display path (with the root prefix), for toasts/labels. */
export function displayCasePath(loc: CaseFileLocation, filename?: string): string {
  const parts = [ROOT_FOLDER, ...buildCasePath(loc)];
  if (filename) parts.push(filename);
  return parts.join("/");
}

/** The base subfolders created on first run inside the root folder. */
export function baseStructure(): string[][] {
  return (Object.keys(ROLE_FOLDERS) as CaseRole[]).map((r) => [ROLE_FOLDERS[r]]);
}
