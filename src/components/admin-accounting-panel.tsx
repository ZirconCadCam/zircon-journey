import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Calculator, Stethoscope, MonitorCog, Wrench, ArrowRight, Loader2,
  RefreshCw, Coins, Check, Plus, Search, Building2, X, ArrowDownUp,
  Pencil, Trash2, BadgeCheck, AlertTriangle, Send,
} from "lucide-react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { teethOf } from "@/lib/report-build";
import {
  listPointWithdrawals,
  addPointWithdrawal,
  listMonthSettlements,
  setMonthSettlement,
  getAccountingReview,
  setAccountingReview,
  listAccountingReviews,
} from "@/lib/secure-ops.functions";


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

/** أسماء تحتوي على «تعديل» أو إحدى صيغ «إعادة» (بعد التطبيع). */
const SPECIAL_RE = /(تعديل|اعادة|اعاده)/;
const isSpecialName = (s: unknown) => SPECIAL_RE.test(norm(s));

type RepeatFilter = "all" | "special" | "normal";

/** Returns a Set of phone digits that appear more than once in the list. */
function dupPhones(rows: Row[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const ph = digits(r.patient_phone);
    if (ph) counts.set(ph, (counts.get(ph) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

type SortBy = "default" | "name-asc" | "name-desc";
function sortRows(rows: Row[], sortBy: SortBy): Row[] {
  if (sortBy === "default") return rows;
  const dir = sortBy === "name-asc" ? 1 : -1;
  return [...rows].sort((a, b) => dir * norm(a.patient_name).localeCompare(norm(b.patient_name), "ar"));
}

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

      <ReviewReminder doctors={doctors} />

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-10 grid place-items-center shadow-luxury">
          <Loader2 className="size-6 animate-spin text-gold" />
        </div>
      ) : tab === "doctors" ? (
        <DoctorsAccounting rows={rows} doctors={doctors} onChanged={load} />
      ) : tab === "designer" ? (
        <DesignerAccounting rows={rows} doctors={doctors} onChanged={load} />
      ) : (
        <TechnicianAccounting rows={rows} doctors={doctors} onChanged={load} />
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
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [repeat, setRepeat] = useState<RepeatFilter>("all");

  const dateOf = (r: Row) => r.archive_reviewed_at ?? r.updated_at;

  const months = useMemo(() => {
    const set = new Set(rows.map((r) => monthKey(dateOf(r))).filter(Boolean));
    return [...set].sort().reverse();
  }, [rows]);

  const list = useMemo(
    () => (month === "all" ? rows : rows.filter((r) => monthKey(dateOf(r)) === month)),
    [rows, month],
  );
  const repeatFiltered = useMemo(
    () => list.filter((r) =>
      repeat === "all" ? true
      : repeat === "special" ? isSpecialName(r.patient_name)
      : !isSpecialName(r.patient_name),
    ),
    [list, repeat],
  );
  const sortedList = useMemo(() => sortRows(repeatFiltered, sortBy), [repeatFiltered, sortBy]);
  const dupPh = useMemo(() => dupPhones(sortedList), [sortedList]);

  async function loadWithdrawn() {
    const data = await listPointWithdrawals({ data: { doctorSlot: doctor.slot } }).catch(() => []);
    setWithdrawn((data ?? []).reduce((s: number, x: any) => s + (Number(x.points) || 0), 0));
  }
  useEffect(() => { loadWithdrawn(); }, [doctor.slot]);

  useEffect(() => {
    setAmounts(Object.fromEntries(rows.map((r) => [r.id, r.remaining_amount == null ? "" : String(r.remaining_amount)])));
  }, [rows]);

  const totalPoints = sortedList.reduce((s, r) => s + teethOf(r), 0);
  const remainingPoints = totalPoints - withdrawn;
  const totalAmount = sortedList.reduce((s, r) => s + (Number(amounts[r.id]) || 0), 0);

  async function saveAmount(r: Row, rawOverride?: string) {
    const raw = rawOverride !== undefined ? rawOverride : amounts[r.id];
    const val = raw === "" || raw == null ? null : Number(raw);
    if (val !== null && isNaN(val)) return;
    // Skip if unchanged
    if ((r.remaining_amount ?? null) === val) return;
    const { error } = await supabase.from("slot_cases")
      .update({ remaining_amount: val } as any).eq("id", r.id);
    if (!error) onChanged();
  }

  // حفظ تلقائي مؤجّل عند كل تحرير لخانة المبلغ المتبقي
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function handleAmountChange(r: Row, raw: string) {
    setAmounts((prev) => ({ ...prev, [r.id]: raw }));
    clearTimeout(saveTimers.current[r.id]);
    saveTimers.current[r.id] = setTimeout(() => saveAmount(r, raw), 800);
  }

  async function addWithdrawal() {
    const n = Number(addPts);
    if (!n || isNaN(n)) { toast.error("أدخل عدد النقاط المسحوبة"); return; }
    setSaving(true);
    const res = await addPointWithdrawal({ data: { doctorSlot: doctor.slot, points: Math.round(n) } }).catch((e: any) => ({ ok: false, error: e?.message }));
    setSaving(false);
    if (!res?.ok) { toast.error(res?.error ?? "تعذر الحفظ"); return; }
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
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold outline-none focus:border-gold">
          <option value="default">الافتراضي (التاريخ)</option>
          <option value="name-asc">الاسم: تصاعدي</option>
          <option value="name-desc">الاسم: تنازلي</option>
        </select>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatFilter)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-bold outline-none focus:border-gold">
          <option value="all">كل الحالات</option>
          <option value="special">تعديل/إعادة فقط</option>
          <option value="normal">بدون تعديل/إعادة</option>
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
              <th className="p-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sortedList.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">لا توجد حالات مؤرشفة في هذه الفترة</td></tr>
            ) : sortedList.map((r, i) => {
              const dupPhone = dupPh.has(digits(r.patient_phone));
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="p-2 font-bold">{r.patient_name}</td>
                  <td className={`p-2 font-mono text-xs ${dupPhone ? "text-red-600 font-bold" : ""}`} dir="ltr">{r.patient_phone || "—"}</td>
                  <td className="p-2 font-extrabold text-gold">{teethOf(r) || "—"}</td>
                  <td className="p-2 text-xs">{fmtDate(r.archive_reviewed_at ?? r.updated_at)}</td>
                  <td className="p-2">
                    <input
                      value={amounts[r.id] ?? ""}
                      onChange={(e) => handleAmountChange(r, e.target.value)}
                      onBlur={() => saveAmount(r)}
                      inputMode="decimal"
                      placeholder="0"
                      className="w-24 rounded-lg border border-input bg-background px-2 py-1 text-xs font-mono outline-none focus:border-gold"
                    />
                  </td>
                  <td className="p-2"><RowActions row={r} onChanged={onChanged} /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
              <td className="p-2" colSpan={3}>المجموع — {sortedList.length} حالة</td>
              <td className="p-2">{totalPoints} نقطة</td>
              <td className="p-2 text-xs">—</td>
              <td className="p-2 font-mono">{totalAmount || 0}</td>
              <td className="p-2">—</td>
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

      <ReviewBar scope="doctors" doctorSlot={doctor.slot} month={month} />

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

function DesignerAccounting({ rows, doctors, onChanged }: { rows: Row[]; doctors: Doctor[]; onChanged: () => void }) {
  const nameOf = (slot: number) => doctors.find((d) => d.slot === slot)?.name ?? `#${slot}`;
  const now = new Date();
  const year = now.getFullYear();
  const [month, setMonth] = useState(`${year}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Filters: patient name, branch, doctor, sort.
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState<"all" | "sanaa" | "ibb">("all");
  const [doctorSlot, setDoctorSlot] = useState<number | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [repeat, setRepeat] = useState<RepeatFilter>("all");

  // Months marked as settled (حُسِبَت) — their cases are hidden from the table.
  const [settledMonths, setSettledMonths] = useState<Set<number>>(new Set());
  async function loadSettled() {
    const data = await listMonthSettlements({ data: { scope: "designer", year } }).catch(() => []);
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

  // Apply filters (patient name, branch, doctor).
  const filtered = useMemo(() => {
    const term = norm(q);
    const dl = new Map(doctors.map((d) => [d.slot, d]));
    return list.filter((r) => {
      const d = dl.get(r.doctor_slot);
      if (branch !== "all" && d?.branch !== branch) return false;
      if (doctorSlot !== "all" && r.doctor_slot !== doctorSlot) return false;
      if (term) {
        const hay = norm(`${r.patient_name} ${r.patient_phone ?? ""}`);
        if (!hay.includes(term)) return false;
      }
      if (repeat === "special" && !isSpecialName(r.patient_name)) return false;
      if (repeat === "normal" && isSpecialName(r.patient_name)) return false;
      return true;
    });
  }, [list, q, branch, doctorSlot, doctors, repeat]);

  const hasFilters = !!q || branch !== "all" || doctorSlot !== "all" || sortBy !== "default" || repeat !== "all";
  function resetFilters() { setQ(""); setBranch("all"); setDoctorSlot("all"); setSortBy("default"); setRepeat("all"); }

  const sorted = useMemo(() => sortRows(filtered, sortBy), [filtered, sortBy]);
  const dupPh = useMemo(() => dupPhones(sorted), [sorted]);

  /** Repeat case: name ends with "إعادة" and matches an earlier case by phone + first name. */
  const repeatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of filtered) {
      if (!isRepeatName(r.patient_name)) continue;
      const ph = digits(r.patient_phone);
      const fn = firstName(r.patient_name);
      const match = rows.some(
        (o) => o.id !== r.id && digits(o.patient_phone) === ph && ph !== "" && firstName(o.patient_name) === fn,
      );
      if (match) ids.add(r.id);
    }
    return ids;
  }, [filtered, rows]);

  const total = filtered.reduce((s, r) => s + teethOf(r), 0);
  const repeatTotal = filtered.filter((r) => repeatIds.has(r.id)).reduce((s, r) => s + teethOf(r), 0);
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

        <AccountingFilterBar
          q={q} setQ={setQ}
          branch={branch} setBranch={setBranch}
          doctorSlot={doctorSlot} setDoctorSlot={setDoctorSlot}
          doctors={doctors}
          hasFilters={hasFilters} onReset={resetFilters}
          sortBy={sortBy} setSortBy={setSortBy}
          repeat={repeat} setRepeat={setRepeat}
        />

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
                <th className="p-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">
                  {monthIsSettled
                    ? "تم حساب هذا الشهر — الحالات المخفية ✅"
                    : hasFilters ? "لا توجد نتائج مطابقة للفلاتر" : "لا توجد حالات مُصمَّمة في هذا الشهر"}
                </td></tr>
              ) : sorted.map((r, i) => {
                const rep = repeatIds.has(r.id);
                const dupPhone = dupPh.has(digits(r.patient_phone));
                return (
                  <tr key={r.id} className={`border-t border-border ${rep ? "bg-red-500/5" : ""}`}>
                    <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className={`p-2 font-bold ${rep ? "text-red-600" : ""}`}>{r.patient_name}</td>
                    <td className={`p-2 font-mono text-xs ${dupPhone ? "text-red-600 font-bold" : ""}`} dir="ltr">{r.patient_phone || "—"}</td>
                    <td className="p-2 text-xs">{nameOf(r.doctor_slot)}</td>
                    <td className={`p-2 font-extrabold ${rep ? "text-red-600" : "text-gold"}`}>{teethOf(r) || "—"}</td>
                    <td className="p-2 text-xs">{fmtDate(r.design_delivered_at ?? r.design_sent_at ?? r.updated_at)}</td>
                    <td className="p-2"><RowActions row={r} onChanged={onChanged} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
                <td className="p-2" colSpan={4}>المجموع — {sorted.length} حالة</td>
                <td className="p-2" colSpan={3}>
                  {total} سِنّ
                  {repeatTotal > 0 && <span className="text-red-600 text-xs font-bold"> (منها {repeatTotal} إعادة)</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ReviewBar scope="designer" month={month} />

      <MonthsSettlement scope="designer" title="حساب شهور المصمم" onChanged={loadSettled} />
    </div>
  );
}

/* ============================ 3) الفني ============================ */

function TechnicianAccounting({ rows, doctors, onChanged }: { rows: Row[]; doctors: Doctor[]; onChanged: () => void }) {
  const nameOf = (slot: number) => doctors.find((d) => d.slot === slot)?.name ?? `#${slot}`;
  const now = new Date();
  const year = now.getFullYear();
  const [month, setMonth] = useState(`${year}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Filters: patient name, branch, doctor, sort.
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState<"all" | "sanaa" | "ibb">("all");
  const [doctorSlot, setDoctorSlot] = useState<number | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [repeat, setRepeat] = useState<RepeatFilter>("all");

  // Months marked as settled (حُسِبَت) — their cases are hidden from the table.
  const [settledMonths, setSettledMonths] = useState<Set<number>>(new Set());
  async function loadSettled() {
    const data = await listMonthSettlements({ data: { scope: "technician", year } }).catch(() => []);
    setSettledMonths(new Set((data ?? []).filter((x: any) => x.settled).map((x: any) => Number(x.month))));
  }
  useEffect(() => { loadSettled(); }, [year]);

  const carved = useMemo(() => rows.filter((r) => r.permanent_fabrication_done), [rows]);
  const dateOf = (r: Row) => r.perm_sent_at ?? r.updated_at;

  const months = useMemo(() => {
    const set = new Set(carved.map((r) => monthKey(dateOf(r))).filter(Boolean));
    set.add(month);
    return [...set].sort().reverse();
  }, [carved, month]);

  // Hide cases whose month has been settled.
  const list = useMemo(
    () => dedupe(
      carved.filter((r) => {
        const mk = monthKey(dateOf(r));
        if (mk !== month) return false;
        const mNum = Number(mk.split("-")[1]);
        return !settledMonths.has(mNum);
      }),
    ),
    [carved, month, settledMonths],
  );
  // Apply filters (patient name, branch, doctor).
  const filtered = useMemo(() => {
    const term = norm(q);
    const dl = new Map(doctors.map((d) => [d.slot, d]));
    return list.filter((r) => {
      const d = dl.get(r.doctor_slot);
      if (branch !== "all" && d?.branch !== branch) return false;
      if (doctorSlot !== "all" && r.doctor_slot !== doctorSlot) return false;
      if (term) {
        const hay = norm(`${r.patient_name} ${r.patient_phone ?? ""}`);
        if (!hay.includes(term)) return false;
      }
      if (repeat === "special" && !isSpecialName(r.patient_name)) return false;
      if (repeat === "normal" && isSpecialName(r.patient_name)) return false;
      return true;
    });
  }, [list, q, branch, doctorSlot, doctors, repeat]);

  const hasFilters = !!q || branch !== "all" || doctorSlot !== "all" || sortBy !== "default" || repeat !== "all";
  function resetFilters() { setQ(""); setBranch("all"); setDoctorSlot("all"); setSortBy("default"); setRepeat("all"); }

  const sorted = useMemo(() => sortRows(filtered, sortBy), [filtered, sortBy]);
  const dupPh = useMemo(() => dupPhones(sorted), [sorted]);

  const total = filtered.reduce((s, r) => s + teethOf(r), 0);
  const monthIsSettled = settledMonths.has(Number(month.split("-")[1]));

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

        <AccountingFilterBar
          q={q} setQ={setQ}
          branch={branch} setBranch={setBranch}
          doctorSlot={doctorSlot} setDoctorSlot={setDoctorSlot}
          doctors={doctors}
          hasFilters={hasFilters} onReset={resetFilters}
          sortBy={sortBy} setSortBy={setSortBy}
          repeat={repeat} setRepeat={setRepeat}
        />

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">اسم المريض</th>
                <th className="p-2 text-right">رقم الهاتف</th>
                <th className="p-2 text-right">الطبيب</th>
                <th className="p-2 text-right">عدد الأسنان</th>
                <th className="p-2 text-right">تاريخ النحت الدائم</th>
                <th className="p-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">
                  {monthIsSettled
                    ? "تم حساب هذا الشهر — الحالات المخفية ✅"
                    : hasFilters ? "لا توجد نتائج مطابقة للفلاتر" : "لا توجد حالات في هذا الشهر"}
                </td></tr>
              ) : sorted.map((r, i) => {
                const dupPhone = dupPh.has(digits(r.patient_phone));
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-2 font-bold">{r.patient_name}</td>
                    <td className={`p-2 font-mono text-xs ${dupPhone ? "text-red-600 font-bold" : ""}`} dir="ltr">{r.patient_phone || "—"}</td>
                    <td className="p-2 text-xs">{nameOf(r.doctor_slot)}</td>
                    <td className="p-2 font-extrabold text-gold">{teethOf(r) || "—"}</td>
                    <td className="p-2 text-xs">{fmtDate(r.perm_sent_at ?? r.updated_at)}</td>
                    <td className="p-2"><RowActions row={r} onChanged={onChanged} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
                <td className="p-2" colSpan={4}>المجموع — {sorted.length} حالة</td>
                <td className="p-2" colSpan={3}>{total} سِنّ</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ReviewBar scope="technician" month={month} />

      <MonthsSettlement scope="technician" title="حساب شهور الفني" onChanged={loadSettled} />
    </div>
  );
}

/* ---------------------- shared accounting filter bar ---------------------- */

function AccountingFilterBar({
  q, setQ, branch, setBranch, doctorSlot, setDoctorSlot, doctors, hasFilters, onReset,
  sortBy, setSortBy, repeat, setRepeat,
}: {
  q: string;
  setQ: (v: string) => void;
  branch: "all" | "sanaa" | "ibb";
  setBranch: (v: "all" | "sanaa" | "ibb") => void;
  doctorSlot: number | "all";
  setDoctorSlot: (v: number | "all") => void;
  doctors: Doctor[];
  hasFilters: boolean;
  onReset: () => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  repeat: RepeatFilter;
  setRepeat: (v: RepeatFilter) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 rounded-xl bg-muted/20 border border-border p-3">
      <div className="relative">
        <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم المريض أو الهاتف…"
          className="w-full rounded-lg border border-input bg-background pr-9 pl-3 py-2 text-xs outline-none focus:border-gold"
        />
      </div>
      <label className="block">
        <div className="text-[10px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
          <Building2 className="size-3 text-gold" /> الفرع
        </div>
        <select
          value={branch}
          onChange={(e) => setBranch(e.target.value as any)}
          className="w-full rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus:border-gold"
        >
          <option value="all">كل الفروع</option>
          <option value="sanaa">صنعاء</option>
          <option value="ibb">إب</option>
        </select>
      </label>
      <label className="block">
        <div className="text-[10px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
          <Stethoscope className="size-3 text-gold" /> الطبيب
        </div>
        <div className="flex gap-2">
          <select
            value={doctorSlot === "all" ? "all" : String(doctorSlot)}
            onChange={(e) => setDoctorSlot(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="flex-1 rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus:border-gold"
          >
            <option value="all">كل الأطباء</option>
            {doctors.map((d) => (
              <option key={d.slot} value={d.slot}>{d.name}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={onReset}
              className="rounded-lg border border-border bg-card px-2.5 text-xs font-bold hover:border-gold transition flex items-center gap-1"
              title="مسح الفلاتر"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </label>
      <label className="block">
        <div className="text-[10px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
          <ArrowDownUp className="size-3 text-gold" /> ترتيب
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="w-full rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus:border-gold"
        >
          <option value="default">الافتراضي (التاريخ)</option>
          <option value="name-asc">الاسم: تصاعدي (أ→ي)</option>
          <option value="name-desc">الاسم: تنازلي (ي→أ)</option>
        </select>
      </label>
      <label className="block">
        <div className="text-[10px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
          <RefreshCw className="size-3 text-gold" /> تعديل/إعادة
        </div>
        <select
          value={repeat}
          onChange={(e) => setRepeat(e.target.value as RepeatFilter)}
          className="w-full rounded-lg border border-input bg-background px-2 py-2 text-xs outline-none focus:border-gold"
        >
          <option value="all">كل الحالات</option>
          <option value="special">تعديل/إعادة فقط</option>
          <option value="normal">بدون تعديل/إعادة</option>
        </select>
      </label>
    </div>
  );
}

/* ---------------------- months settlement checkboxes ---------------------- */

function MonthsSettlement({
  scope, title, onChanged,
}: { scope: "designer" | "technician"; title: string; onChanged?: () => void }) {
  const year = new Date().getFullYear();
  const [settled, setSettled] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    const data = await listMonthSettlements({ data: { scope, year } }).catch(() => []);
    const m: Record<number, boolean> = {};
    for (const r of (data ?? []) as any[]) m[Number(r.month)] = !!r.settled;
    setSettled(m);
  }
  useEffect(() => { load(); }, [scope]);

  async function toggle(month: number) {
    const next = !settled[month];
    setBusy(month);
    const res = await setMonthSettlement({ data: { scope, year, month, settled: next } }).catch((e: any) => ({ ok: false, error: e?.message }));
    setBusy(null);
    if (!res?.ok) { toast.error(res?.error ?? "تعذر الحفظ"); return; }
    setSettled((s) => ({ ...s, [month]: next }));
    toast.success(next ? `تم تأكيد حساب ${AR_MONTHS[month - 1]}` : `تم إلغاء حساب ${AR_MONTHS[month - 1]}`);
    onChanged?.();
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

/* ==================== صلاحيات الإدارة: تعديل/حذف صف ==================== */

/**
 * أزرار الإدارة على كل صف في جداول الحسابات:
 * تعديل بيانات المريض وعدد النقاط (الأسنان) والمبلغ المتبقي، أو حذف الصف.
 */
function RowActions({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(row.patient_name ?? "");
  const [phone, setPhone] = useState(row.patient_phone ?? "");
  const [teeth, setTeeth] = useState(String(teethOf(row) || ""));
  const [amount, setAmount] = useState(row.remaining_amount == null ? "" : String(row.remaining_amount));

  function openEditor() {
    setName(row.patient_name ?? "");
    setPhone(row.patient_phone ?? "");
    setTeeth(String(teethOf(row) || ""));
    setAmount(row.remaining_amount == null ? "" : String(row.remaining_amount));
    setOpen(true);
  }

  async function save() {
    if (!name.trim()) { toast.error("اسم المريض مطلوب"); return; }
    const t = teeth.trim() === "" ? null : Number(teeth);
    if (t !== null && (isNaN(t) || t < 0)) { toast.error("عدد النقاط غير صحيح"); return; }
    const amt = amount.trim() === "" ? null : Number(amount);
    if (amt !== null && isNaN(amt)) { toast.error("المبلغ غير صحيح"); return; }
    setBusy(true);
    const { error } = await supabase.from("slot_cases").update({
      patient_name: name.trim(),
      patient_phone: phone.trim() || null,
      teeth_count: t === null ? null : String(t),
      remaining_amount: amt,
    } as any).eq("id", row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تعديل البيانات");
    setOpen(false);
    onChanged();
  }

  async function remove() {
    if (!confirm(`حذف صف «${row.patient_name}» من الحسابات نهائياً؟`)) return;
    setBusy(true);
    const { error } = await supabase.from("slot_cases").delete().eq("id", row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف الصف");
    setOpen(false);
    onChanged();
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button onClick={openEditor} title="تعديل البيانات وعدد النقاط"
          className="rounded-lg border border-border bg-background p-1.5 hover:border-gold transition">
          <Pencil className="size-3.5 text-gold" />
        </button>
        <button onClick={remove} disabled={busy} title="حذف الصف"
          className="rounded-lg border border-border bg-background p-1.5 hover:border-red-500 transition disabled:opacity-50">
          <Trash2 className="size-3.5 text-red-600" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-luxury space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Pencil className="size-4 text-gold" />
              <div className="font-extrabold">تعديل بيانات الصف</div>
              <button onClick={() => setOpen(false)} className="ms-auto rounded-lg p-1.5 hover:bg-muted/40">
                <X className="size-4" />
              </button>
            </div>

            <label className="block">
              <div className="text-[11px] font-bold mb-1">اسم المريض</div>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
            </label>
            <label className="block">
              <div className="text-[11px] font-bold mb-1">رقم الهاتف</div>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-gold" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-[11px] font-bold mb-1">عدد النقاط (الأسنان)</div>
                <input value={teeth} onChange={(e) => setTeeth(e.target.value)} inputMode="numeric"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-gold" />
              </label>
              <label className="block">
                <div className="text-[11px] font-bold mb-1">المبلغ المتبقي</div>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-gold" />
              </label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button onClick={save} disabled={busy}
                className="rounded-lg gradient-brown px-4 py-2 text-xs font-bold shadow-luxury disabled:opacity-50 flex items-center gap-1.5">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} حفظ التعديل
              </button>
              <button onClick={remove} disabled={busy}
                className="ms-auto rounded-lg border border-red-500/60 text-red-600 px-4 py-2 text-xs font-bold hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-1.5">
                <Trash2 className="size-3.5" /> حذف الصف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ==================== مراجعة الكشف قبل الإرسال التلقائي ==================== */

const ADEN_OFFSET_MS = 3 * 3600_000;
function adenNow(): Date { return new Date(Date.now() + ADEN_OFFSET_MS); }
function adenMonthKey(): string {
  const d = adenNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** الأيام المتبقية حتى آخر يوم من الشهر الحالي (بتوقيت عدن). */
function daysLeftInMonth(): number {
  const d = adenNow();
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return last - d.getUTCDate();
}

/**
 * زر «تمت المراجعة» في نهاية الجدول — يعتمد الكشف فيصبح جاهزاً للإرسال
 * التلقائي إلى جروب تلجرام في آخر يوم من الشهر الساعة 11:59 مساءً.
 */
function ReviewBar({
  scope, doctorSlot = -1, month,
}: { scope: "doctors" | "designer" | "technician"; doctorSlot?: number; month: string }) {
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^\d{4}-\d{2}$/.test(month);
  const [y, m] = valid ? month.split("-").map(Number) : [0, 0];

  async function load() {
    if (!valid) { setReviewed(null); return; }
    const data = await getAccountingReview({ data: { scope, doctorSlot, year: y as number, month: m as number } }).catch(() => null);
    setReviewed(!!(data as any)?.reviewed);
    setAt((data as any)?.reviewed_at ?? null);
  }
  useEffect(() => { load(); }, [scope, doctorSlot, month]);

  async function toggle() {
    if (!valid) { toast.error("اختر شهراً محدداً قبل المراجعة"); return; }
    const next = !reviewed;
    setBusy(true);
    const res = await setAccountingReview({ data: { scope, doctorSlot, year: y as number, month: m as number, reviewed: next } }).catch((e: any) => ({ ok: false, error: e?.message }));
    setBusy(false);
    if (!res?.ok) { toast.error(res?.error ?? "تعذر الحفظ"); return; }
    setReviewed(next);
    setAt(new Date().toISOString());
    toast.success(next
      ? "تمت المراجعة — الكشف جاهز للإرسال التلقائي إلى جروب تلجرام"
      : "تم إلغاء المراجعة — لن يُرسَل الكشف تلقائياً");
  }

  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3 flex-wrap ${
      reviewed ? "border-emerald-500/60 bg-emerald-500/10" : "border-border bg-muted/20"
    }`}>
      <div className="min-w-0">
        <div className="text-xs font-extrabold flex items-center gap-1.5">
          {reviewed ? <BadgeCheck className="size-4 text-emerald-600" /> : <Send className="size-4 text-gold" />}
          {reviewed ? "تمت مراجعة هذا الكشف ✅" : "بانتظار مراجعة الإدارة"}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {reviewed
            ? `جاهز للإرسال التلقائي إلى جروب تلجرام في آخر يوم من الشهر 11:59 م${at ? ` • تمت المراجعة ${fmtDate(at)}` : ""}`
            : "لن يُرسَل الكشف تلقائياً حتى تضغط «تمت المراجعة»"}
        </div>
      </div>
      <button onClick={toggle} disabled={busy || !valid}
        className={`ms-auto rounded-lg px-4 py-2 text-xs font-bold shadow-luxury disabled:opacity-50 flex items-center gap-1.5 ${
          reviewed ? "border border-border bg-background" : "gradient-brown"
        }`}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {reviewed ? "إلغاء المراجعة" : "تمت المراجعة"}
      </button>
    </div>
  );
}

/** تنبيه للإدارة قبل نهاية الشهر بيومين لمراجعة الكشوف غير المعتمدة. */
function ReviewReminder({ doctors }: { doctors: Doctor[] }) {
  const [pending, setPending] = useState<string[]>([]);
  const left = daysLeftInMonth();
  const mk = adenMonthKey();
  const [y, m] = mk.split("-").map(Number);

  useEffect(() => {
    if (left > 2) return;
    (async () => {
      const data = await listAccountingReviews({ data: { year: y as number, month: m as number } }).catch(() => []);
      const ok = new Set((data ?? []).filter((r: any) => r.reviewed).map((r: any) => `${r.scope}|${r.doctor_slot}`));
      const miss: string[] = [];
      if (!ok.has("designer|-1")) miss.push("حساب المصمم");
      if (!ok.has("technician|-1")) miss.push("حساب الفني");
      const docMiss = doctors.filter((d) => d.active && !ok.has(`doctors|${d.slot}`));
      if (docMiss.length) miss.push(`نقاط ${docMiss.length} طبيب`);
      setPending(miss);
      if (miss.length) {
        toast.warning(`تنبيه: تبقّى ${left} يوم لنهاية الشهر — راجع الكشوف قبل الإرسال التلقائي`, { duration: 8000 });
      }
    })();
  }, [left, mk, doctors.length]);

  if (left > 2 || pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/60 bg-amber-500/10 p-4 flex items-start gap-3">
      <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-extrabold text-amber-700">
          تنبيه مراجعة الحسابات — تبقّى {left === 0 ? "اليوم الأخير" : `${left} يوم`} لنهاية الشهر
        </div>
        <div className="text-[12px] text-muted-foreground mt-1">
          راجع الكشوف التالية واضغط «تمت المراجعة» في نهاية كل جدول ليُرسَل تلقائياً إلى جروب تلجرام آخر يوم الساعة 11:59 مساءً:
          {" "}<span className="font-bold text-foreground">{pending.join(" • ")}</span>
        </div>
      </div>
    </div>
  );
}
