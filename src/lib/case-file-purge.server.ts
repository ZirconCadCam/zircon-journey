/**
 * Auto-delete zip/rar/html files of archived cases 15 days after archiving,
 * but only when every one of those files was delivered to the Telegram group
 * (a row exists in telegram_file_links). Case text data is never touched; the
 * file columns stay so the UI can resolve the Telegram link by path.
 */
import { objectKey } from "@/lib/telegram-file-links";

const PURGE_AFTER_DAYS = 15;
const FILE_RE = /\.(zip|rar|html?)$/i;

function bucketOf(url: string): string {
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]!) : "case-files";
}

export async function purgeArchivedCaseFiles(limit = 5): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const before = new Date(Date.now() - PURGE_AFTER_DAYS * 86400000).toISOString();

  const { data: cases } = await db.from("slot_cases")
    .select("id, archive_reviewed_at, updated_at, scan_path, scan_name, revision_design_file_path, revision_design_file_name, design_html_path, design_html_name, extra_zip_path, extra_zip_name")
    .eq("final_archived", true).is("files_purged_at", null).is("trashed_at", null)
    .lt("updated_at", before).limit(40);

  let purged = 0;
  for (const c of (cases ?? []) as any[]) {
    if (purged >= limit) break;
    const archivedAt = c.archive_reviewed_at ?? c.updated_at;
    if (!archivedAt || archivedAt > before) continue;

    const files: { url: string; name: string }[] = [];
    const add = (url: string | null, name: string | null) => {
      if (!url) return;
      const n = name || url.split("?")[0]!.split("/").pop() || "";
      if (FILE_RE.test(n) || FILE_RE.test(url.split("?")[0]!)) files.push({ url, name: n });
    };
    add(c.scan_path, c.scan_name);
    add(c.revision_design_file_path, c.revision_design_file_name);
    add(c.design_html_path, c.design_html_name);
    add(c.extra_zip_path, c.extra_zip_name);
    const { data: rounds } = await db.from("case_revision_rounds")
      .select("rar_path, rar_name, html_path, html_name").eq("case_id", c.id);
    for (const r of (rounds ?? []) as any[]) { add(r.rar_path, r.rar_name); add(r.html_path, r.html_name); }

    if (files.length === 0) { await db.from("slot_cases").update({ files_purged_at: new Date().toISOString() }).eq("id", c.id); continue; }

    const keys = files.map(f => objectKey(f.url)).filter(Boolean) as string[];
    if (keys.length !== files.length) continue;
    const { data: links } = await db.from("telegram_file_links").select("object_path").in("object_path", keys);
    const have = new Set(((links ?? []) as any[]).map(l => l.object_path));
    if (!keys.every(k => have.has(k))) continue; // condition 1 not met

    const byBucket = new Map<string, string[]>();
    files.forEach((f, i) => {
      const b = /^https?:/i.test(f.url) ? bucketOf(f.url) : "case-files";
      byBucket.set(b, [...(byBucket.get(b) ?? []), keys[i]!]);
    });
    let ok = true;
    for (const [b, paths] of byBucket) {
      const { error } = await supabaseAdmin.storage.from(b).remove(paths);
      if (error) ok = false;
    }
    if (ok) {
      await db.from("slot_cases").update({ files_purged_at: new Date().toISOString() }).eq("id", c.id);
      purged++;
    }
  }
  return purged;
}
