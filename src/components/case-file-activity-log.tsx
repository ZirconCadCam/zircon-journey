/**
 * Compact per-case file activity panel — shows the most recent uploads and
 * downloads (file name, who, status, and time) so users can track activity.
 */
import { useEffect, useState, useCallback } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, History, CheckCircle2, XCircle, Ban } from "lucide-react";
import { fetchFileActivity, type FileActivityRow } from "@/lib/file-activity";
import { supabase } from "@/integrations/supabase/client";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const days = Math.floor(h / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Date(iso).toLocaleDateString("ar");
}

function StatusIcon({ s }: { s: FileActivityRow["status"] }) {
  if (s === "failed") return <XCircle className="size-3.5 text-destructive" />;
  if (s === "canceled") return <Ban className="size-3.5 text-muted-foreground" />;
  return <CheckCircle2 className="size-3.5 text-emerald-600" />;
}

export function CaseFileActivityLog({ caseId }: { caseId: string }) {
  const [rows, setRows] = useState<FileActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await fetchFileActivity(caseId));
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`file-activity-${caseId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "file_activity", filter: `case_id=eq.${caseId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [caseId, load]);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <History className="size-4 text-gold" /> سجل عمليات الملفات
        </div>
        <button onClick={load} className="rounded-lg border border-border p-1.5 hover:border-gold" aria-label="تحديث">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2 text-center">لا توجد عمليات بعد</div>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-auto">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg bg-card/70 border border-border/60 px-2 py-1.5">
              <span className="shrink-0 grid place-items-center size-7 rounded-lg bg-muted">
                {r.action === "upload"
                  ? <ArrowUpFromLine className="size-3.5 text-sky-600" />
                  : <ArrowDownToLine className="size-3.5 text-gold" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-bold">{r.file_name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {r.action === "upload" ? "رفع" : "تنزيل"}
                  {r.actor ? ` • ${r.actor}` : ""}
                  {` • ${timeAgo(r.created_at)}`}
                </div>
              </div>
              <StatusIcon s={r.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
