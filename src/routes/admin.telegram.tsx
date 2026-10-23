import { hasTicket } from "@/lib/staff-tickets";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Send, RefreshCw, Trash2, AlertTriangle, Clock, Loader2, FileText, Search, Pause, History, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { hasValidStaffSession } from "@/lib/staff-session";
import { listTelegramOutbox, retryTelegramOutbox, deleteTelegramOutbox, pauseTelegramOutbox, removeTelegramOutboxDoc, getTelegramPerms, TG_PERMS } from "@/lib/secure-ops.functions";
import { setAppFlag } from "@/lib/app-flags";
import { kickTelegramDrain } from "@/lib/telegram-outbox";
import { useBatchSelection, BatchToolbar, RowCheck } from "@/components/batch-toolbar";

export const Route = createFileRoute("/admin/telegram")({
  head: () => ({
    meta: [
      { title: "المتعذر إرسالها للتلجرام — مركز زركون" },
      { name: "description", content: "متابعة الملفات والبيانات المتعذر إرسالها لجروب تلجرام وإعادة إرسالها." },
      { property: "og:title", content: "المتعذر إرسالها للتلجرام — مركز زركون" },
      { property: "og:description", content: "طابور إرسال تلجرام: المتعذرة وقيد الانتظار مع إعادة الإرسال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TelegramOutboxPage,
});

type Row = {
  id: string; caption: string; documents: any; status: string; attempts: number;
  last_error: string | null; created_at: string; caption_sent: boolean; docs_total: number | null;
};
type Log = { id: string; outbox_id: string; action: string; actor: string | null; result: string | null; error: string | null; created_at: string };
const ACTION: Record<string, string> = { retry: "إعادة إرسال", pause: "إيقاف الإرسال", remove_file: "حذف ملف", send: "محاولة إرسال" };
const RESULT: Record<string, string> = { ok: "تم", queued: "أُضيفت للطابور", sent: "نجحت ✓", failed: "فشلت ✗" };
const ACTOR = "الإدارة";

const STATUS: Record<string, { label: string; cls: string }> = {
  failed: { label: "متعذر", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  pending: { label: "في الانتظار", cls: "bg-gold/20 text-foreground border-gold/50" },
  sending: { label: "جارِ الإرسال", cls: "bg-primary/10 text-primary border-primary/30" },
  paused: { label: "موقوف", cls: "bg-muted text-muted-foreground border-border" },
};

const PERIODS = [
  { id: "all", label: "كل الفترات", ms: 0 },
  { id: "24h", label: "آخر 24 ساعة", ms: 864e5 },
  { id: "7d", label: "آخر 7 أيام", ms: 7 * 864e5 },
  { id: "30d", label: "آخر 30 يوماً", ms: 30 * 864e5 },
] as const;

function TelegramOutboxPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"all" | "failed" | "pending" | "sending" | "paused">("all");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("all");
  const [kind, setKind] = useState<"all" | "files" | "text">("all");
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [perms, setPerms] = useState({ retry: true, pause: true, remove: true });
  const [showPerms, setShowPerms] = useState(false);

  async function togglePerm(k: keyof typeof perms) {
    const pw = prompt("أدخل كلمة مرور الإدارة لتغيير الصلاحية");
    if (!pw) return;
    const err = await setAppFlag(TG_PERMS[k], !perms[k], pw);
    if (err) { toast.error("تعذر تغيير الصلاحية: " + err); return; }
    setPerms((p) => ({ ...p, [k]: !p[k] }));
    toast.success("حُفظت الصلاحية");
  }

  async function load() {
    setLoading(true);
    const res = await listTelegramOutbox({ data: { status: "all" } });
    if (res.error) toast.error("تعذر تحميل الطابور: " + res.error);
    setRows(res.rows as Row[]);
    setLogs((res as any).logs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!hasValidStaffSession("admin") && !hasTicket("admin")) { nav({ to: "/staff/$role", params: { role: "admin" } }); return; }
    void load();
    void getTelegramPerms().then(setPerms).catch(() => {});
  }, [nav]);

  // Live progress: refresh quietly while something is queued or sending,
  // only while this page is open and visible; stops by itself when idle.
  const active = rows.some((r) => r.status === "pending" || r.status === "sending");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await listTelegramOutbox({ data: { status: "all" } });
      if (!res.error) { setRows(res.rows as Row[]); setLogs((res as any).logs ?? []); }
    }, 4000);
    return () => clearInterval(t);
  }, [active]);

  const docsOf = (r: Row) => (Array.isArray(r.documents) ? r.documents : []) as { filename: string }[];

  const filtered = useMemo(() => {
    const p = PERIODS.find((x) => x.id === period)!;
    const since = p.ms ? Date.now() - p.ms : 0;
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (since && new Date(r.created_at).getTime() < since) return false;
      const n = docsOf(r).length;
      if (kind === "files" && n === 0) return false;
      if (kind === "text" && n > 0) return false;
      if (term) {
        const hay = (r.caption + " " + docsOf(r).map((d) => d.filename).join(" ") + " " + (r.last_error ?? "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, status, period, kind, q]);

  const sel = useBatchSelection(filtered.map((r) => r.id));
  const counts = useMemo(() => ({
    failed: rows.filter((r) => r.status === "failed").length,
    pending: rows.filter((r) => r.status === "pending").length,
    sending: rows.filter((r) => r.status === "sending").length,
  }), [rows]);

  async function retry(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    const res = await retryTelegramOutbox({ data: { ids, actor: ACTOR } });
    setBusy(false);
    if (!res.ok) { toast.error("تعذرت إعادة الإرسال: " + res.error); return; }
    kickTelegramDrain();
    toast.success(`أُعيدت ${ids.length} رسالة للإرسال — ستصل للجروب خلال لحظات`);
    sel.clear();
    setTimeout(load, 4000);
  }

  async function pause(ids: string[]) {
    setBusy(true);
    const res = await pauseTelegramOutbox({ data: { ids, actor: ACTOR } });
    setBusy(false);
    if (!res.ok) { toast.error("تعذر الإيقاف: " + res.error); return; }
    toast.success("أُوقف الإرسال"); sel.clear(); void load();
  }

  async function removeDoc(id: string, index: number, name: string) {
    if (!confirm(`حذف الملف «${name}» من الطابور؟`)) return;
    setBusy(true);
    const res = await removeTelegramOutboxDoc({ data: { id, index, actor: ACTOR } });
    setBusy(false);
    if (!res.ok) { toast.error("تعذر حذف الملف: " + res.error); return; }
    toast.success("حُذف الملف"); void load();
  }

  async function remove(ids: string[]) {
    setBusy(true);
    const res = await deleteTelegramOutbox({ data: { ids } });
    setBusy(false);
    if (!res.ok) { toast.error("تعذر الحذف: " + res.error); return; }
    toast.success("حُذفت من الطابور");
    sel.clear();
    void load();
  }

  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-bold transition ${active ? "gradient-gold text-gold-foreground border-gold" : "border-border hover:bg-muted/40"}`;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link to="/staff/$role" params={{ role: "admin" }} className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground">
            <ArrowRight className="size-4" /> رجوع للإدارة
          </Link>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted/40">
            <RefreshCw className={`size-3.5 ${loading || active ? "animate-spin" : ""}`} /> {active ? "تحديث مباشر" : "تحديث"}
          </button>
        </div>

        <h1 className="flex items-center gap-2 text-xl font-black"><Send className="size-5 text-gold" /> المتعذر إرسالها للتلجرام</h1>

        <div className="rounded-xl border border-border bg-card p-3">
          <button onClick={() => setShowPerms(!showPerms)} className="flex w-full items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4 text-gold" /> صلاحيات الإدارة على الطابور
          </button>
          {showPerms && (
            <div className="mt-2 space-y-1.5">
              {([["retry", "إعادة الإرسال"], ["pause", "إيقاف الإرسال"], ["remove", "حذف الملفات والرسائل من الطابور"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{l}</span>
                  <button onClick={() => togglePerm(k)} className={`rounded-full px-3 py-1 text-xs font-bold ${perms[k] ? "gradient-gold text-gold-foreground" : "bg-muted text-muted-foreground"}`}>
                    {perms[k] ? "مسموح" : "ممنوع"}
                  </button>
                </label>
              ))}
              <p className="text-[11px] text-muted-foreground">تغيير الصلاحية يتطلب كلمة مرور الإدارة، ويُطبَّق على الخادم أيضاً.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([["failed", "متعذرة", AlertTriangle], ["pending", "في الانتظار", Clock], ["sending", "جارِ الإرسال", Loader2]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setStatus(status === k ? "all" : k)}
              className={`rounded-xl border p-3 text-right transition ${status === k ? "border-gold bg-gold/10" : "border-border bg-card hover:bg-muted/30"}`}>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><I className="size-3.5" />{l}</div>
              <div className="text-2xl font-black">{counts[k]}</div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "failed", "pending", "sending", "paused"] as const).map((s) => (
              <button key={s} className={chip(status === s)} onClick={() => setStatus(s)}>{s === "all" ? "كل الحالات" : STATUS[s].label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((p) => <button key={p.id} className={chip(period === p.id)} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([["all", "الكل"], ["files", "بملفات"], ["text", "بيانات فقط"]] as const).map(([k, l]) => (
              <button key={k} className={chip(kind === k)} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالبيانات أو اسم الملف أو سبب الخطأ"
              className="w-full rounded-lg border border-input bg-background py-2 pr-9 pl-3 text-sm outline-none focus:border-gold" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <BatchToolbar sel={sel} busy={busy} actions={[
            ...(perms.retry ? [{ key: "retry", label: "إعادة الإرسال", icon: <Send className="size-3.5" />, onClick: retry }] : []),
            ...(perms.pause ? [{ key: "pause", label: "إيقاف الإرسال", icon: <Pause className="size-3.5" />, onClick: pause }] : []),
            ...(!perms.remove ? [] : [{ key: "del", label: "حذف من الطابور", icon: <Trash2 className="size-3.5" />, danger: true, onClick: remove }]),
          ]} />
          {perms.retry && counts.failed > 0 && !sel.active && (
            <button disabled={busy} onClick={() => retry(rows.filter((r) => r.status === "failed").map((r) => r.id))}
              className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-50">
              <Send className="size-3.5" /> إعادة إرسال كل المتعذرة ({counts.failed})
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="mx-auto size-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">لا توجد رسائل متعذرة أو في الانتظار ✓</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const docs = docsOf(r);
              const st = STATUS[r.status] ?? { label: r.status, cls: "border-border" };
              const total = (r.docs_total ?? docs.length) + 1;
              const done = (r.caption_sent ? 1 : 0) + Math.max(0, (r.docs_total ?? docs.length) - docs.length);
              const pct = Math.round((done / total) * 100);
              const rowLogs = logs.filter((l) => l.outbox_id === r.id);
              return (
                <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <RowCheck sel={sel} id={r.id} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full border px-2 py-0.5 font-bold ${st.cls}`}>{st.label}</span>
                        <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-EG")}</span>
                        <span className="text-muted-foreground">محاولات: {r.attempts}</span>
                        {r.caption_sent && <span className="text-muted-foreground">• البيانات أُرسلت</span>}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm line-clamp-4">{r.caption}</p>
                      {docs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {docs.map((d, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"><FileText className="size-3" />{d.filename}
                              {perms.remove && <button disabled={busy} title="حذف الملف" onClick={() => removeDoc(r.id, i, d.filename)} className="text-destructive hover:opacity-70"><X className="size-3" /></button>}</span>
                          ))}
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground"><span>التقدم: {done} من {total}</span><span>{pct}%</span></div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-all ${r.status === "failed" ? "bg-destructive" : r.status === "sending" ? "bg-primary animate-pulse" : "gradient-gold"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      {r.last_error && <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive break-words">السبب: {r.last_error}</p>}
                    </div>
                    {!sel.active && (
                      <div className="shrink-0 flex flex-col gap-1">
                        {perms.retry && <button disabled={busy} onClick={() => retry([r.id])} title="إعادة الإرسال"
                          className="inline-flex items-center gap-1 rounded-lg border border-gold/60 bg-gold/10 px-2.5 py-1.5 text-xs font-bold hover:gradient-gold disabled:opacity-50">
                          <Send className="size-3.5" /> إرسال
                        </button>}
                        {perms.pause && r.status !== "paused" && (
                          <button disabled={busy} onClick={() => pause([r.id])} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-muted/40 disabled:opacity-50">
                            <Pause className="size-3.5" /> إيقاف
                          </button>
                        )}
                        <button onClick={() => setOpenLog(openLog === r.id ? null : r.id)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold hover:bg-muted/40">
                          <History className="size-3.5" /> السجل ({rowLogs.length})
                        </button>
                      </div>
                    )}
                  </div>
                  {openLog === r.id && (
                    <div className="rounded-lg border border-border bg-muted/20 p-2">
                      {rowLogs.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد محاولات مسجلة بعد</p> : (
                        <ul className="space-y-1">
                          {rowLogs.map((l) => (
                            <li key={l.id} className="text-xs border-b border-border/50 pb-1 last:border-0">
                              <div className="flex flex-wrap gap-2">
                                <span className="font-bold">{ACTION[l.action] ?? l.action}</span>
                                <span>بواسطة: {l.actor ?? "—"}</span>
                                <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("ar-EG")}</span>
                                <span className={l.result === "failed" ? "text-destructive font-bold" : "font-bold"}>{RESULT[l.result ?? ""] ?? l.result}</span>
                              </div>
                              {l.error && <p className={`break-words ${l.result === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{l.error}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
