import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Timer, Check, Loader2, ExternalLink, Search, Stethoscope, Filter,
  Hammer, Wrench, Archive, ShieldCheck, ChevronsRight, Printer, FileDown,
} from "lucide-react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { printHtmlDocument } from "@/lib/print-report";

/** Cases that have been sitting in the doctor's page for longer than this
 *  many days become eligible for administrative completion. */
const OVERDUE_DAYS = 20;

interface Row {
  id: string;
  case_code: string;
  patient_name: string;
  tooth_number: string | null;
  teeth_count: string | null;
  shade: string | null;
  doctor_slot: number;
  created_at: string;
  doctor_decision: string | null;
  permanent_fabrication_done: boolean | null;
  permanent_installed_by_doctor: boolean | null;
  final_archived: boolean | null;
}

interface DoctorMini { slot: number; name: string; branch: string | null }

type StepKey = "approve" | "mill" | "install" | "archive";

const STEPS: { key: StepKey; label: string; icon: typeof Check }[] = [
  { key: "approve", label: "اعتماد نهائي", icon: ShieldCheck },
  { key: "mill", label: "تم نحت الدائم", icon: Hammer },
  { key: "install", label: "تم التركيب", icon: Wrench },
  { key: "archive", label: "مؤرشف نهائياً", icon: Archive },
];

function patchFor(step: StepKey): Record<string, unknown> {
  const now = new Date().toISOString();
  switch (step) {
    case "approve":
      return { doctor_decision: "approved" };
    case "mill":
      return {
        doctor_decision: "approved",
        permanent_fabrication_done: true,
        permanent_shipped_to_secretary: true,
        perm_ship_sent_at: now,
      };
    case "install":
      return {
        doctor_decision: "approved",
        permanent_fabrication_done: true,
        permanent_shipped_to_secretary: true,
        permanent_received_by_secretary: true,
        permanent_delivered_to_doctor: true,
        permanent_installed_by_doctor: true,
        received_permanent: true,
      };
    case "archive":
      return {
        doctor_decision: "approved",
        permanent_fabrication_done: true,
        permanent_shipped_to_secretary: true,
        permanent_received_by_secretary: true,
        permanent_delivered_to_doctor: true,
        permanent_installed_by_doctor: true,
        received_permanent: true,
        final_archived: true,
        archived: true,
        archive_approval: "approved",
        archive_reviewed_at: now,
        archive_reviewed_by: "الإدارة",
        archive_reject_reason: null,
      };
  }
}

function doneFlags(r: Row): Record<StepKey, boolean> {
  return {
    approve: r.doctor_decision === "approved",
    mill: !!r.permanent_fabrication_done,
    install: !!r.permanent_installed_by_doctor,
    archive: !!r.final_archived,
  };
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

/** أول مستوى ناقص للحالة (نص عربي). */
function pendingStepLabel(r: Row): string {
  const done = doneFlags(r);
  const next = STEPS.find(s => !done[s.key]);
  return next ? next.label : "—";
}

/** يبني كشف HTML للطباعة/PDF لحالات طبيب واحد غير المكتملة. */
function buildOverdueReportHtml(doctorName: string, branch: string | null, rows: Row[]): string {
  const title = `${doctorName} متأخر في التبويب ${rows.length}`;
  const branchLabel = branch === "sanaa" ? "فرع صنعاء" : branch === "ibb" ? "فرع إب" : "";
  const today = new Date().toLocaleDateString("ar-EG");
  const body = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.case_code ?? ""}</td>
      <td>${r.patient_name ?? ""}</td>
      <td>${r.tooth_number ?? "—"}</td>
      <td>${r.teeth_count ?? "—"}</td>
      <td>${r.shade ?? "—"}</td>
      <td>${daysSince(r.created_at)} يوم</td>
      <td>${pendingStepLabel(r)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { font-family: "Segoe UI", Tahoma, sans-serif; }
  body { color: #241a12; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #6b5847; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d8c9b6; padding: 6px 8px; text-align: right; }
  thead th { background: #f2e7d8; font-weight: 800; }
  tfoot td { background: #faf5ee; font-weight: 800; }
</style></head>
<body>
  <h1>كشف الحالات غير المكتملة (متأخرة أكثر من ${OVERDUE_DAYS} يوماً)</h1>
  <div class="sub">الطبيب: <b>${doctorName}</b>${branchLabel ? ` • ${branchLabel}` : ""} • عدد الحالات: <b>${rows.length}</b> • تاريخ الطباعة: ${today}</div>
  <table>
    <thead><tr>
      <th>#</th><th>رقم الحالة</th><th>المريض</th><th>السن</th><th>عدد الأسنان</th>
      <th>اللون</th><th>مدة التأخير</th><th>المستوى الناقص</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="8">المجموع: ${rows.length} حالة غير مكتملة</td></tr></tfoot>
  </table>
</body></html>`;
}

/**
 * Administration tool: force-complete the closing stages of cases that have
 * been open in the doctor's page for more than 20 days.
 */
export function AdminOverdueCompletion() {
  const [rows, setRows] = useState<Row[]>([]);
  const [doctors, setDoctors] = useState<Record<number, DoctorMini>>({});
  const [loading, setLoading] = useState(true);
  const [doctorSlot, setDoctorSlot] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const cutoff = new Date(Date.now() - OVERDUE_DAYS * 86_400_000).toISOString();
    const [{ data: cases }, { data: docs }] = await Promise.all([
      supabase.from("slot_cases")
        .select("id,case_code,patient_name,tooth_number,teeth_count,shade,doctor_slot,created_at,doctor_decision,permanent_fabrication_done,permanent_installed_by_doctor,final_archived")
        .lt("created_at", cutoff)
        .or("final_archived.is.null,final_archived.eq.false")
        .order("created_at", { ascending: true }),
      supabase.from("doctor_profiles").select("slot,name,branch").order("slot"),
    ]);
    setRows((cases ?? []) as unknown as Row[]);
    const map: Record<number, DoctorMini> = {};
    for (const d of (docs ?? []) as DoctorMini[]) map[d.slot] = d;
    setDoctors(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Live updates removed to save database usage — data loads on open.
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (doctorSlot !== "all" && r.doctor_slot !== doctorSlot) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.case_code} ${r.patient_name} ${doctors[r.doctor_slot]?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, doctorSlot, search, doctors]);

  /** تجميع الحالات المتأخرة حسب الطبيب لطباعة كشف لكل طبيب. */
  const byDoctor = useMemo(() => {
    const groups = new Map<number, Row[]>();
    for (const r of filtered) {
      const list = groups.get(r.doctor_slot);
      if (list) list.push(r); else groups.set(r.doctor_slot, [r]);
    }
    return [...groups.entries()]
      .map(([slot, list]) => ({ slot, list, doctor: doctors[slot] }))
      .sort((a, b) => b.list.length - a.list.length);
  }, [filtered, doctors]);

  function printDoctor(slot: number, list: Row[]) {
    const d = doctors[slot];
    const name = d?.name ?? `Slot #${slot}`;
    printHtmlDocument(buildOverdueReportHtml(name, d?.branch ?? null, list), `${name} متأخر في التبويب ${list.length}`);
  }

  async function apply(r: Row, step: StepKey) {
    const key = `${r.id}:${step}`;
    if (busy) return;
    setBusy(key);
    const { error } = await supabase.from("slot_cases")
      .update(patchFor(step) as any).eq("id", r.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`تم تنفيذ «${STEPS.find(s => s.key === step)!.label}» للحالة ${r.case_code}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl gradient-brown text-primary-foreground p-5 shadow-luxury flex items-center gap-4">
        <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold">
          <Timer className="size-6 text-gold-foreground" />
        </div>
        <div>
          <div className="text-xs opacity-80">صلاحيات الإدارة</div>
          <div className="text-xl font-extrabold">إكمال المستويات المتأخرة</div>
          <div className="text-xs opacity-80 mt-1">
            الحالات التي مرّ على وجودها في صفحة الطبيب أكثر من {OVERDUE_DAYS} يوماً — يمكن للإدارة إكمال مراحلها النهائية
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
          <Filter className="size-4 text-gold" /> الفلاتر — {filtered.length} حالة متأخرة
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2">
            <Stethoscope className="size-4 text-gold" />
            <select value={doctorSlot === "all" ? "all" : String(doctorSlot)}
              onChange={e => setDoctorSlot(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="bg-transparent text-xs font-bold outline-none">
              <option value="all">كل الأطباء</option>
              {Object.values(doctors).map(d => <option key={d.slot} value={d.slot}>{d.name}</option>)}
            </select>
          </div>
          <div className="relative grow min-w-[200px]">
            <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الحالة أو المريض أو الطبيب…"
              className="w-full rounded-xl border border-input bg-background pr-9 pl-3 py-2 text-xs outline-none focus:border-gold" />
          </div>
        </div>
      </div>

      {!loading && byDoctor.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
            <Printer className="size-4 text-gold" /> طباعة كشف PDF بالحالات غير المكتملة — لكل طبيب على حدة
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {byDoctor.map(({ slot, list, doctor }) => (
              <button key={slot} onClick={() => printDoctor(slot, list)}
                className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-right hover:border-gold transition">
                <DoctorAvatar name={doctor?.name} className="size-9" rounded="lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{doctor?.name ?? `Slot #${slot}`}</div>
                  <div className="text-[11px] text-muted-foreground">{list.length} حالة غير مكتملة</div>
                </div>
                <FileDown className="size-4 text-gold shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-sm text-muted-foreground shadow-luxury">
          جاري التحميل…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-sm text-muted-foreground shadow-luxury">
          <Timer className="size-10 mx-auto mb-3 opacity-40" />
          لا توجد حالات متأخرة أكثر من {OVERDUE_DAYS} يوماً.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(r => {
            const done = doneFlags(r);
            const age = daysSince(r.created_at);
            const doctor = doctors[r.doctor_slot];
            return (
              <div key={r.id} className="rounded-2xl bg-card border-2 border-amber-500/50 p-4 shadow-luxury space-y-3">
                <div className="flex items-start gap-3">
                  <DoctorAvatar name={doctor?.name} className="size-11" rounded="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{r.patient_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{r.case_code}</span> • {doctor?.name ?? `Slot #${r.doctor_slot}`}
                      {doctor?.branch === "sanaa" ? " • فرع صنعاء" : doctor?.branch === "ibb" ? " • فرع إب" : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.tooth_number ? `السن: ${r.tooth_number} • ` : ""}
                      {r.teeth_count ? `عدد الأسنان: ${r.teeth_count} • ` : ""}
                      {r.shade ? `اللون: ${r.shade}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500 text-white px-2 py-1 text-[10px] font-extrabold">
                    <Timer className="size-3" /> {age} يوم
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {STEPS.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => apply(r, key)} disabled={done[key] || busy !== null}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold shadow transition disabled:opacity-70 ${
                        done[key] ? "bg-emerald-600 text-white" : "border border-border bg-card hover:border-gold"
                      }`}>
                      {busy === `${r.id}:${key}` ? <Loader2 className="size-3.5 animate-spin" />
                        : done[key] ? <Check className="size-3.5" /> : <Icon className="size-3.5 text-gold" />}
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/60">
                  <Link to="/cases/$id" params={{ id: r.id }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-bold hover:border-gold">
                    <ExternalLink className="size-3.5" /> فتح الحالة
                  </Link>
                  <button onClick={() => apply(r, "archive")} disabled={done.archive || busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-2 text-[11px] font-extrabold shadow-gold disabled:opacity-60">
                    {busy === `${r.id}:archive` ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronsRight className="size-3.5" />}
                    إكمال كل المستويات
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
