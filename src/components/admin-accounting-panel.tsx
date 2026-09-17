import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Calculator, Stethoscope, MonitorCog, Wrench, ArrowRight, Loader2,
  RefreshCw, Coins, Check, Plus,
} from "lucide-react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { teethOf } from "@/lib/report-build";

/* ------------------------------ helpers ------------------------------ */

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }

interface Row {
  id: string;
  case_code: string;
  doctor_slot: number;
  patient_name: string;
  patient_phone: string | null;
  teeth_count: string | null;
  tooth_number: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  final_archived: boolean;
  archive_reviewed_at: string | null;
  archive_approval: string | null;
  remaining_amount: number | null;
  design_done: boolean;
  design_delivered_at: string | null;
  design_sent_at: string | null;
  permanent_fabrication_done: boolean;
  perm_sent_at: string | null;
}

const SELECT =
  "id,case_code,doctor_slot,patient_name,patient_phone,teeth_count,tooth_number,created_at,updated_at," +
  "archived,final_archived,archive_reviewed_at,archive_approval,remaining_amount," +
  "design_done,design_delivered_at,design_sent_at,permanent_fabrication_done,perm_sent_at";

const norm = (s: unknown) =>
  String(s ?? "").replace(/[\u064B-\u0652\u200f\u200e]/g, "").replace(/[إأآا]/g, "ا").replace(/\s+/g, " ").trim();
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const firstName = (s: unknown) => norm(s).split(" ")[0] ?? "";

const REPEAT_RE = /(اعادة|اعاده|إعادة|إعاده)\s*$/;
const isRepeatName = (s: unknown) => REPEAT_RE.test(norm(s));

function monthKey(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${AR_MONTHS[Number(m) - 1] ?? m} ${y}`;
}
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ar-EG") : "—";

/** Dedupe cases by patient identity (name + phone), keeping the earliest. */
function dedupe(rows: Row[]): Row[] {
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const key = `${norm(r.patient_name)}|${digits(r.patient_phone)}`;
    const prev = seen.get(key);
    if (!prev || new Date(r.created_at) < new Date(prev.created_at)) seen.set(key, r);
  }
  return [...seen.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/* ------------------------------ root panel ------------------------------ */

export function AdminAccountingPanel() {
  const [tab, setTab] = useState<"doctors" | "designer" | "technician">("doctors");
  const [rows, setRows] = useState<Row[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [cases, docs] = await Promise.all([
      supabase.from("slot_cases").select(SELECT).order("created_at", { ascending: true }),
      supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot"),
    ]);
    setRows(((cases.data ?? []) as unknown as Row[]));
    setDoctors((docs.data ?? []) as Doctor[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl gradient-brown text-primary-foreground p-6 shadow-luxury flex items-center gap-4">
        <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold">
          <Calculator className="size-6 text-gold-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs opacity-80">إدارة المركز</div>
          <div className="text-2xl font-extrabold">الحسابات</div>
          <div className="text-xs opacity-80 mt-1">نظام محاسبي للنقاط والحسابات مع الأطباء والمصمم والفني</div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ms-auto rounded-xl bg-white/10 p-2.5 hover:bg-white/20 disabled:opacity-50"
          title="تحديث"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap rounded-2xl bg-card border border-border p-2 shadow-luxury">
        {([
          ["doctors", "حسابات الأطباء", Stethoscope],
          ["designer", "حساب المصمم", MonitorCog],
          ["technician", "حساب الفني", Wrench],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
              tab === k ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"
            }`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-10 grid place-items-center shadow-luxury">
          <Loader2 className="size-6 animate-spin text-gold" />
        </div>
      ) : tab === "doctors" ? (
        <DoctorsAccounting rows={rows} doctors={doctors} onChanged={load} />
      ) : tab === "designer" ? (
        <DesignerAccounting rows={rows} doctors={doctors} />
      ) : (
        <TechnicianAccounting rows={rows} doctors={doctors} />
      )}
    </div>
  );
}

/* ============================ 1) الأطباء ============================ */

function DoctorsAccounting({
  rows, doctors, onChanged,
}: { rows: Row[]; doctors: Doctor[]; onChanged: () => void }) {
  const [slot, setSlot] = useState<number | null>(null);

  const archived = useMemo(
    () => rows.filter((r) => r.final_archived || r.archived || r.archive_approval === "approved"),
    [rows],
  );

  if (slot === null) {
    return (
      <div className="rounded-2xl bg-card border border-border p-5 shadow-luxury">
        <div className="font-bold mb-3">اختر الطبيب لعرض كشف نقاطه</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {doctors.map((d) => {
            const list = dedupe(archived.filter((r) => r.doctor_slot === d.slot));
            const pts = list.reduce((s, r) => s + teethOf(r), 0);
            return (
              <button
                key={d.slot}
                onClick={() => setSlot(d.slot)}
                className="text-right rounded-xl border border-border bg-muted/20 p-4 hover:border-gold transition flex items-center gap-3"
              >
                <DoctorAvatar name={d.name} className="size-10" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{d.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {list.length} حالة مؤرشفة • {pts} نقطة
                    {!d.active && " • مؤرشف"}
                  </div>
                </div>
                <ArrowRight className="size-4 text-gold rotate-180" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const doctor = doctors.find((d) => d.slot === slot)!;
  return (
    <DoctorPointsTable
      doctor={doctor}
      rows={dedupe(archived.filter((r) => r.doctor_slot === slot))}
      onBack={() => setSlot(null)}
      onChanged={onChanged}
    />
  );
}

function DoctorPointsTable({
  doctor, rows, onBack, onChanged,
}: { doctor: Doctor; rows: Row[]; onBack: () => void; onChanged: () => void }) {
  const [month, setMonth] = useState<string>("all");
  const [withdrawn, setWithdrawn] = useState(0);
  const [addPts, setAddPts] = useState("");
  const [saving, setSaving] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const dateOf = (r: Row) => r.archive_reviewed_at ?? r.updated_at;

  const months = useMemo(() => {
    const set = new Set(rows.map((r) => monthKey(dateOf(r))).filter(Boolean));
    return [...set].sort().reverse();
  }, [rows]);

  const list = useMemo(
    () => (month === "all" ? rows : rows.filter((r) => monthKey(dateOf(r)) === month)),
    [rows, month],
  );

  async function loadWithdrawn() {
    const { data } = await supabase
      .from("doctor_point_withdrawals")
      .select("points")
      .eq("doctor_slot", doctor.slot);
    setWithdrawn((data ?? []).reduce((s: number, x: any) => s + (Number(x.points) || 0), 0));
  }
  useEffect(() => { loadWithdrawn(); }, [doctor.slot]);

  useEffect(() => {
    setAmounts(Object.fromEntries(rows.map((r) => [r.id, r.remaining_amount == null ? "" : String(r.remaining_amount)])));
  }, [rows]);

  const totalPoints = list.reduce((s, r) => s + teethOf(r), 0);
  const remainingPoints = totalPoints - withdrawn;
  const totalAmount = list.reduce((s, r) => s + (Number(amounts[r.id]) || 0), 0);

  async function saveAmount(r: Row) {
    const raw = amounts[r.id];
    const val = raw === "" ? null : Number(raw);
    if (val !== null && isNaN(val)) { toast.error("قيمة غير صحيحة"); return; }
    const { error } = await supabase.from("slot_cases")
      .update({ remaining_amount: val } as any).eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("تم حفظ المبلغ المتبقي"); onChanged(); }
  }

  async function addWithdrawal() {
    const n = Number(addPts);
    if (!n || isNaN(n)) { toast.error("أدخل عدد النقاط المسحوبة"); return; }
    setSaving(true);
    const { error } = await supabase.from("doctor_point_withdrawals")
      .insert({ doctor_slot: doctor.slot, points: Math.round(n) } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setAddPts("");
    toast.success("تم تسجيل النقاط المسحوبة");
    loadWithdrawn();
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-luxury space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:border-gold flex items-center gap-1.5">
          <ArrowRight className="size-3.5" /> القائمة
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <DoctorAvatar name={doctor.name} className="size-9" />
          <div className="font-extrabold text-lg truncate">نقاط {doctor.name}</div>
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="ms-auto rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold outline-none focus:border-gold">
          <option value="all">كل الشهور</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">اسم المريض</th>
              <th className="p-2 text-right">رقم الهاتف</th>
              <th className="p-2 text-right">عدد النقاط</th>
              <th className="p-2 text-right">تاريخ الأرشفة</th>
              <th className="p-2 text-right">المبلغ المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">لا توجد حالات مؤرشفة في هذه الفترة</td></tr>
            ) : list.map((r, i) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                <td className="p-2 font-bold">{r.patient_name}</td>
                <td className="p-2 font-mono text-xs" dir="ltr">{r.patient_phone || "—"}</td>
                <td className="p-2 font-extrabold text-gold">{teethOf(r) || "—"}</td>
                <td className="p-2 text-xs">{fmtDate(r.archive_reviewed_at ?? r.updated_at)}</td>
                <td className="p-2">
                  <input
                    value={amounts[r.id] ?? ""}
                    onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })}
                    onBlur={() => saveAmount(r)}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-24 rounded-lg border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus:border-gold"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
              <td className="p-2" colSpan={3}>المجموع — {list.length} حالة</td>
              <td className="p-2">{totalPoints} نقطة</td>
              <td className="p-2 text-xs">—</td>
              <td className="p-2 font-mono">{totalAmount || 0}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[11px] text-muted-foreground">مجموع عدد النقاط</div>
          <div className="text-xl font-extrabold">{totalPoints}</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="text-[11px] text-muted-foreground">عدد النقاط المسحوبة</div>
          <div className="text-xl font-extrabold">{withdrawn}</div>
        </div>
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3">
          <div className="text-[11px] text-muted-foreground">النقاط المتبقية</div>
          <div className="text-xl font-extrabold text-gold">{remainingPoints}</div>
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap rounded-xl border border-border bg-muted/20 p-3">
        <div>
          <label className="text-[11px] font-bold mb-1 block flex items-center gap-1">
            <Coins className="size-3.5 text-gold" /> تسجيل نقاط مسحوبة
          </label>
          <input value={addPts} onChange={(e) => setAddPts(e.target.value)} inputMode="numeric" placeholder="0"
            className="w-28 rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-gold" />
        </div>
        <button onClick={addWithdrawal} disabled={saving}
          className="rounded-lg gradient-brown px-4 py-1.5 text-xs font-bold shadow-luxury disabled:opacity-50 flex items-center gap-1.5">
          <Plus className="size-3.5" /> {saving ? "جارٍ الحفظ…" : "إضافة"}
        </button>
      </div>
    </div>
  );
}

/* ============================ 2) المصمم ============================ */

function DesignerAccounting({ rows, doctors }: { rows: Row[]; doctors: Doctor[] }) {
  const nameOf = (slot: number) => doctors.find((d) => d.slot === slot)?.name ?? `#${slot}`;
  const now = new Date();
  const year = now.getFullYear();
  const [month, setMonth] = useState(`${year}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Months marked as settled (حُسِبَت) — their cases are hidden from the table.
  const [settledMonths, setSettledMonths] = useState<Set<number>>(new Set());
  async function loadSettled() {
    const { data } = await supabase
      .from("staff_month_settlements")
      .select("month,settled")
      .eq("scope", "designer")
      .eq("year", year);
    setSettledMonths(new Set((data ?? []).filter((x: any) => x.settled).map((x: any) => Number(x.month))));
  }
  useEffect(() => { loadSettled(); }, [year]);

  const designed = useMemo(() => rows.filter((r) => r.design_done), [rows]);
  const dateOf = (r: Row) => r.design_delivered_at ?? r.design_sent_at ?? r.updated_at;

  const months = useMemo(() => {
    const set = new Set(designed.map((r) => monthKey(dateOf(r))).filter(Boolean));
    set.add(month);
    return [...set].sort().reverse();
  }, [designed, month]);

  // Hide cases whose month has been settled.
  const list = useMemo(
    () => dedupe(
      designed.filter((r) => {
        const mk = monthKey(dateOf(r));
        if (mk !== month) return false;
        const mNum = Number(mk.split("-")[1]);
        return !settledMonths.has(mNum);
      }),
    ),
    [designed, month, settledMonths],
  );

  /** Repeat case: name ends with "إعادة" and matches an earlier case by phone + first name. */
  const repeatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of list) {
      if (!isRepeatName(r.patient_name)) continue;
      const ph = digits(r.patient_phone);
      const fn = firstName(r.patient_name);
      const match = rows.some(
        (o) => o.id !== r.id && digits(o.patient_phone) === ph && ph !== "" && firstName(o.patient_name) === fn,
      );
      if (match) ids.add(r.id);
    }
    return ids;
  }, [list, rows]);

  const total = list.reduce((s, r) => s + teethOf(r), 0);
  const repeatTotal = list.filter((r) => repeatIds.has(r.id)).reduce((s, r) => s + teethOf(r), 0);
  const monthIsSettled = settledMonths.has(Number(month.split("-")[1]));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card border border-border p-5 shadow-luxury space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center"><MonitorCog className="size-5" /></div>
          <div>
            <div className="font-bold">حساب المصمم — أسنان الحالات المُصمَّمة</div>
            <div className="text-[11px] text-muted-foreground">
              يُحسب كل مريض مرة واحدة. حالات «الإعادة» (تطابق الهاتف والاسم الأول) تظهر بلون أحمر للتمييز.
            </div>
          </div>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="ms-auto rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold outline-none focus:border-gold">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">اسم المريض</th>
                <th className="p-2 text-right">رقم الهاتف</th>
                <th className="p-2 text-right">الطبيب</th>
                <th className="p-2 text-right">عدد الأسنان</th>
                <th className="p-2 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">
                  {monthIsSettled
                    ? "تم حساب هذا الشهر — الحالات المخفية ✅"
                    : "لا توجد حالات مُصمَّمة في هذا الشهر"}
                </td></tr>
              ) : list.map((r, i) => {
                const rep = repeatIds.has(r.id);
                return (
                  <tr key={r.id} className={`border-t border-border ${rep ? "bg-red-500/5" : ""}`}>
                    <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className={`p-2 font-bold ${rep ? "text-red-600" : ""}`}>{r.patient_name}</td>
                    <td className="p-2 font-mono text-xs" dir="ltr">{r.patient_phone || "—"}</td>
                    <td className="p-2 text-xs">{nameOf(r.doctor_slot)}</td>
                    <td className={`p-2 font-extrabold ${rep ? "text-red-600" : "text-gold"}`}>{teethOf(r) || "—"}</td>
                    <td className="p-2 text-xs">{fmtDate(r.design_delivered_at ?? r.design_sent_at ?? r.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
                <td className="p-2" colSpan={4}>المجموع — {list.length} حالة</td>
                <td className="p-2" colSpan={2}>
                  {total} سِنّ
                  {repeatTotal > 0 && <span className="text-red-600 text-xs font-bold"> (منها {repeatTotal} إعادة)</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <MonthsSettlement scope="designer" title="حساب شهور المصمم" onChanged={loadSettled} />
    </div>
  );
}

/* ============================ 3) الفني ============================ */

function TechnicianAccounting({ rows, doctors }: { rows: Row[]; doctors: Doctor[] }) {
  const nameOf = (slot: number) => doctors.find((d) => d.slot === slot)?.name ?? `#${slot}`;
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const carved = useMemo(() => rows.filter((r) => r.permanent_fabrication_done), [rows]);
  const dateOf = (r: Row) => r.perm_sent_at ?? r.updated_at;

  const months = useMemo(() => {
    const set = new Set(carved.map((r) => monthKey(dateOf(r))).filter(Boolean));
    set.add(month);
    return [...set].sort().reverse();
  }, [carved, month]);

  const list = useMemo(
    () => dedupe(carved.filter((r) => monthKey(dateOf(r)) === month)),
    [carved, month],
  );
  const total = list.reduce((s, r) => s + teethOf(r), 0);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card border border-border p-5 shadow-luxury space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center"><Wrench className="size-5" /></div>
          <div>
            <div className="font-bold">حساب الفني — حالات «تم نحت الزركون الدائم»</div>
            <div className="text-[11px] text-muted-foreground">يُحسب كل مريض مرة واحدة.</div>
          </div>
          <select value={month} onChange={(e) => setMonth(e.target.value)}
            className="ms-auto rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold outline-none focus:border-gold">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">اسم المريض</th>
                <th className="p-2 text-right">الطبيب</th>
                <th className="p-2 text-right">عدد الأسنان</th>
                <th className="p-2 text-right">تاريخ النحت الدائم</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">لا توجد حالات في هذا الشهر</td></tr>
              ) : list.map((r, i) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="p-2 font-bold">{r.patient_name}</td>
                  <td className="p-2 text-xs">{nameOf(r.doctor_slot)}</td>
                  <td className="p-2 font-extrabold text-gold">{teethOf(r) || "—"}</td>
                  <td className="p-2 text-xs">{fmtDate(r.perm_sent_at ?? r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
                <td className="p-2" colSpan={3}>المجموع — {list.length} حالة</td>
                <td className="p-2" colSpan={2}>{total} سِنّ</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <MonthsSettlement scope="technician" title="حساب شهور الفني" />
    </div>
  );
}

/* ---------------------- months settlement checkboxes ---------------------- */

function MonthsSettlement({ scope, title }: { scope: "designer" | "technician"; title: string }) {
  const year = new Date().getFullYear();
  const [settled, setSettled] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const { data } = await supabase
      .from("staff_month_settlements")
      .select("month,settled")
      .eq("scope", scope)
      .eq("year", year);
    const m: Record<number, boolean> = {};
    for (const r of (data ?? []) as any[]) m[Number(r.month)] = !!r.settled;
    setSettled(m);
  }
  useEffect(() => { load(); }, [scope]);

  async function toggle(month: number) {
    const next = !settled[month];
    setBusy(month);
    const { error } = await supabase
      .from("staff_month_settlements")
      .upsert({ scope, year, month, settled: next } as any, { onConflict: "scope,year,month" });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    setSettled((s) => ({ ...s, [month]: next }));
    toast.success(next ? `تم تأكيد حساب ${AR_MONTHS[month - 1]}` : `تم إلغاء حساب ${AR_MONTHS[month - 1]}`);
  }

  const doneCount = Object.values(settled).filter(Boolean).length;

  return (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-luxury">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="font-bold">{title} — {year}</div>
          <div className="text-[11px] text-muted-foreground">ضع علامة صح جوار الشهر الذي تم الحساب فيه ليظهر بلون أخضر</div>
        </div>
        <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-[11px] font-bold">
          {doneCount} / 12 شهراً تم حسابها
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {AR_MONTHS.map((m, i) => {
          const month = i + 1;
          const on = !!settled[month];
          return (
            <button
              key={month}
              onClick={() => toggle(month)}
              disabled={busy === month}
              className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-bold transition disabled:opacity-60 ${
                on
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-700"
                  : "border-border bg-muted/20 hover:border-gold"
              }`}
            >
              <span className={`size-5 rounded-md border grid place-items-center shrink-0 ${
                on ? "border-emerald-600 bg-emerald-600 text-white" : "border-input bg-background"
              }`}>
                {busy === month ? <Loader2 className="size-3 animate-spin" /> : on ? <Check className="size-3.5" /> : null}
              </span>
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
