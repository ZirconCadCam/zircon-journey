import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  RefreshCw, Loader2, FileArchive, FileCode2, ExternalLink, Search, Clock, CheckCircle2, AlertTriangle,
  Eye, EyeOff,
} from "lucide-react";
import { listRevisionRounds, type RevisionRound } from "@/lib/revision-rounds";
import { getRoundsSeenAt, markRoundsSeen } from "@/lib/revision-round-alerts";
import { InAppFileViewer } from "@/components/in-app-file-viewer";
import { getSignedUrl } from "@/lib/chat";
import { toast } from "sonner";

function fmt(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
  } catch { return "—"; }
}

/**
 * Designer "متابعة" tab: every revision round for every case, with the
 * attached HTML / design file of each round and a direct link to the case.
 */
export function DesignerFollowupPanel({ doctorSlot, scope }: { doctorSlot?: number; scope?: string } = {}) {
  const seenAt = useRef<number>(getRoundsSeenAt(scope ?? (doctorSlot != null ? `doctor${doctorSlot}` : "designer")));
  const [rows, setRows] = useState<RevisionRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewer, setViewer] = useState<{ url: string; name: string; mime?: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const all = await listRevisionRounds();
      setRows(doctorSlot == null ? all : all.filter(r => r.doctor_slot === doctorSlot));
    }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    // opening the tab counts as "seen" — the badge resets for next time
    markRoundsSeen(scope ?? (doctorSlot != null ? `doctor${doctorSlot}` : "designer"));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [doctorSlot, scope]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = rows.filter(r =>
      !term
      || (r.case_code ?? "").toLowerCase().includes(term)
      || (r.patient_name ?? "").toLowerCase().includes(term)
      || (r.doctor_name ?? "").toLowerCase().includes(term));
    const map = new Map<string, RevisionRound[]>();
    for (const r of filtered) {
      const list = map.get(r.case_id) ?? [];
      list.push(r);
      map.set(r.case_id, list);
    }
    return [...map.entries()].map(([caseId, list]) => ({
      caseId,
      list: [...list].sort((a, b) => b.round - a.round),
    }));
  }, [rows, q]);

  async function openFile(path: string, name: string, mime?: string) {
    const url = /^https?:\/\//i.test(path) ? path : (await getSignedUrl(path, 3600));
    if (!url) { toast.error("تعذر فتح الملف"); return; }
    setViewer({ url, name, mime });
  }

  /** Toggle an inline HTML preview for a round — no manual download needed. */
  async function togglePreview(roundId: string, path: string) {
    if (previews[roundId]) {
      setPreviews(p => { const n = { ...p }; delete n[roundId]; return n; });
      return;
    }
    setPreviewBusy(roundId);
    try {
      const url = /^https?:\/\//i.test(path) ? path : (await getSignedUrl(path, 3600));
      if (!url) { toast.error("تعذر تحميل المعاينة"); return; }
      const res = await fetch(url);
      const html = await res.text();
      setPreviews(p => ({ ...p, [roundId]: html }));
    } catch { toast.error("تعذر تحميل المعاينة"); }
    finally { setPreviewBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm font-extrabold flex items-center gap-2">
          <RefreshCw className="size-4 text-gold" /> متابعة جولات التعديل
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="ابحث برقم الحالة أو اسم المريض أو الطبيب…"
            className="w-full rounded-xl border border-input bg-background ps-9 pe-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <button onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-2 text-xs font-bold hover:bg-gold/10">
          <RefreshCw className="size-3.5" /> تحديث
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="size-5 mx-auto mb-2 animate-spin text-gold" /> جارٍ تحميل جولات التعديل…
        </div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground rounded-2xl border border-dashed border-border">
          لا توجد جولات تعديل مسجّلة بعد.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ caseId, list }) => {
            const head = list[0];
            return (
              <div key={caseId} className="rounded-2xl border border-border bg-card shadow-luxury overflow-hidden">
                <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-extrabold text-sm">
                      {head.case_code || "—"} — {head.patient_name || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {head.doctor_name || "—"} · {list.length} جولة تعديل
                    </div>
                  </div>
                  <Link to="/cases/$id" params={{ id: caseId }}
                    className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold shadow-gold">
                    <ExternalLink className="size-3.5" /> فتح الحالة
                  </Link>
                </div>

                <ul className="divide-y divide-border">
                  {list.map(r => {
                    const done = !!(r.rar_path || r.html_path);
                    return (
                      <li key={r.id} className="p-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="rounded-full bg-gold/15 text-gold px-2.5 py-0.5 text-[11px] font-extrabold">
                            الجولة {r.round}
                          </span>
                          {new Date(r.requested_at).getTime() > seenAt.current && (
                            <span className="rounded-full bg-red-500 text-white px-2 py-0.5 text-[10px] font-extrabold animate-pulse">
                              جديد
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="size-3" /> {fmt(r.requested_at)}
                          </span>
                          {r.shade && (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold">
                              اللون: {r.shade}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${done ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
                            {done ? <><CheckCircle2 className="size-3" /> تم الرد</> : <><AlertTriangle className="size-3" /> بانتظار المصمم</>}
                          </span>
                        </div>

                        {r.doctor_notes && (
                          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs whitespace-pre-wrap">
                            <span className="font-bold">ملاحظات الطبيب: </span>{r.doctor_notes}
                          </div>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          {r.rar_path ? (
                            <button onClick={() => openFile(r.rar_path!, r.rar_name || "التصميم المعدّل")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition">
                              <FileArchive className="size-3.5" /> {r.rar_name || "ملف التصميم"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">لا يوجد ملف تصميم لهذه الجولة</span>
                          )}
                          {r.html_path ? (
                            <button onClick={() => openFile(r.html_path!, r.html_name || "تقرير.html", "text/html")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 hover:bg-sky-500 hover:text-white transition">
                              <FileCode2 className="size-3.5" /> {r.html_name || "ملف HTML"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">بدون ملف HTML</span>
                          )}
                          {r.html_path && (
                            <button onClick={() => togglePreview(r.id, r.html_path!)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-1.5 text-xs font-bold hover:bg-gold/10">
                              {previewBusy === r.id
                                ? <><Loader2 className="size-3.5 animate-spin" /> جارٍ التحضير…</>
                                : previews[r.id]
                                  ? <><EyeOff className="size-3.5" /> إخفاء المعاينة</>
                                  : <><Eye className="size-3.5" /> معاينة داخل الصفحة</>}
                            </button>
                          )}
                        </div>

                        {previews[r.id] && (
                          <iframe
                            title={`معاينة ${r.html_name || "HTML"}`}
                            srcDoc={previews[r.id]}
                            sandbox="allow-same-origin"
                            className="w-full h-[520px] rounded-xl border border-border bg-white"
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <InAppFileViewer
        open={!!viewer}
        onOpenChange={(v) => { if (!v) setViewer(null); }}
        url={viewer?.url ?? null}
        name={viewer?.name ?? ""}
        mime={viewer?.mime ?? null}
        subfolder="جولات التعديل"
      />
    </div>
  );
}
