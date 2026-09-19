import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Archive, Check, X, Loader2, Clock, AlertTriangle, Calendar,
  Stethoscope, Filter, Search, ExternalLink, Receipt, Send,
} from "lucide-react";

import { DoctorAvatar } from "@/components/doctor-avatar";
import { ImageLightbox } from "@/components/image-lightbox";
import { signPrivateUrl } from "@/lib/secure-storage";

interface Row {
  id: string;
  case_code: string;
  patient_name: string;
  patient_phone: string | null;
  tooth_number: string | null;
  teeth_count: string | null;
  shade: string | null;
  doctor_slot: number;
  final_archived: boolean | null;
  archive_receipt_path: string | null;
  archive_receipt_name: string | null;
  archive_receipt_sent_at: string | null;
  archive_request_note: string | null;
  archive_approval: string | null;
  archive_reviewed_at: string | null;
  archive_reviewed_by: string | null;
  archive_reject_reason: string | null;
}

interface DoctorMini { slot: number; name: string; branch: string | null }

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function monthKey(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

/**
 * Administration tab: archiving notifications.
 * Each entry shows the patient's account receipt photo sent by the doctor along
 * with approve / reject controls for the archiving request, plus monthly and
 * per-doctor filtering.
 */
export function AdminArchiveApprovals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [doctors, setDoctors] = useState<Record<number, DoctorMini>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [month, setMonth] = useState<string>("all");
  const [doctorSlot, setDoctorSlot] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [testing, setTesting] = useState(false);

  /** Send a test message to the clinic's Telegram group to verify delivery. */
  async function sendTelegramTest() {
    setTesting(true);
    try {
      const { sendCaseToTelegram } = await import("@/lib/telegram.functions");
      const stamp = new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
      await sendCaseToTelegram({
        data: {
          caption: [
            "🔔 <b>رسالة اختبار — إشعارات الأرشفة</b>",
            "──────────────",
            "✅ الربط بجروب تلجرام يعمل بنجاح",
            `🕒 الوقت: ${stamp}`,
            "📤 المصدر: صفحة الإدارة → إشعارات الأرشفة",
          ].join("\n"),
          documents: [],
        },
      });
      toast.success("تم إرسال رسالة الاختبار إلى جروب تلجرام بنجاح");
    } catch (e: any) {
      toast.error(`تعذّر إرسال رسالة الاختبار: ${e?.message ?? "خطأ غير معروف"}`, { duration: 9000 });
    } finally {
      setTesting(false);
    }
  }


  async function load() {
    const [{ data: cases }, { data: docs }] = await Promise.all([
      supabase.from("slot_cases")
        .select("id,case_code,patient_name,patient_phone,tooth_number,teeth_count,shade,doctor_slot,final_archived,archive_receipt_path,archive_receipt_name,archive_receipt_sent_at,archive_request_note,archive_approval,archive_reviewed_at,archive_reviewed_by,archive_reject_reason")
        .not("archive_receipt_sent_at", "is", null)
        .order("archive_receipt_sent_at", { ascending: false }),
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
    const ch = supabase.channel("admin-archive-approvals")
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_cases" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) { const k = monthKey(r.archive_receipt_sent_at); if (k) set.add(k); }
    return Array.from(set).sort().reverse();
  }, [rows]);

  const counts = useMemo(() => ({
    pending: rows.filter(r => (r.archive_approval ?? "pending") === "pending").length,
    approved: rows.filter(r => r.archive_approval === "approved").length,
    rejected: rows.filter(r => r.archive_approval === "rejected").length,
    all: rows.length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const st = r.archive_approval ?? "pending";
    if (status !== "all" && st !== status) return false;
    if (month !== "all" && monthKey(r.archive_receipt_sent_at) !== month) return false;
    if (doctorSlot !== "all" && r.doctor_slot !== doctorSlot) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.case_code} ${r.patient_name} ${doctors[r.doctor_slot]?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, status, month, doctorSlot, search, doctors]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl gradient-brown text-primary-foreground p-5 shadow-luxury flex items-center gap-4">
        <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold">
          <Receipt className="size-6 text-gold-foreground" />
        </div>
        <div className="grow">
          <div className="text-xs opacity-80">اعتماد الأرشفة النهائية</div>
          <div className="text-xl font-extrabold">إشعارات الأرشفة</div>
          <div className="text-xs opacity-80 mt-1">اطّلع على صورة سند حساب المريض ثم وافق أو ارفض أرشفة الحالة</div>
        </div>
        <button onClick={sendTelegramTest} disabled={testing}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl gradient-gold text-gold-foreground px-3 py-2 text-xs font-bold shadow-gold disabled:opacity-60">
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          رسالة اختبار لتلجرام
        </button>
      </div>


      {/* Status tabs */}
      <div className="grid sm:grid-cols-4 gap-2">
        {([
          ["pending", "بانتظار الموافقة", counts.pending],
          ["approved", "تمت الموافقة (مؤرشفة)", counts.approved],
          ["rejected", "مرفوضة", counts.rejected],
          ["all", "الكل", counts.all],
        ] as [StatusFilter, string, number][]).map(([key, label, n]) => (
          <button key={key} onClick={() => setStatus(key)}
            className={`rounded-2xl border-2 p-3 text-start transition shadow-luxury ${status === key ? "border-gold gradient-gold text-gold-foreground" : "border-border bg-card hover:border-gold"}`}>
            <div className="text-[11px] font-bold opacity-80">{label}</div>
            <div className="text-2xl font-extrabold">{n}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
          <Filter className="size-4 text-gold" /> الفلاتر
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2">
            <Calendar className="size-4 text-gold" />
            <select value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent text-xs font-bold outline-none">
              <option value="all">كل الأشهر</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
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

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-sm text-muted-foreground shadow-luxury">
          جاري التحميل…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-sm text-muted-foreground shadow-luxury">
          <Archive className="size-10 mx-auto mb-3 opacity-40" />
          لا توجد إشعارات أرشفة مطابقة للفلاتر.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map(r => (
            <ApprovalCard key={r.id} r={r} doctor={doctors[r.doctor_slot]} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ r, doctor, onDone }: { r: Row; doctor?: DoctorMini; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const status = r.archive_approval ?? "pending";

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!r.archive_receipt_path) return;
      const signedUrl = await signPrivateUrl("chat-attachments", r.archive_receipt_path, 3600);
      if (alive) setUrl(signedUrl);
    })();
    return () => { alive = false; };
  }, [r.archive_receipt_path]);

  async function notifyDoctor(content: string) {
    const { data: convs } = await supabase.from("chat_conversations")
      .select("id,participants").eq("doctor_slot", r.doctor_slot);
    const conv = (convs ?? []).find((x: any) =>
      Array.isArray(x.participants) && x.participants.length === 2
      && x.participants.includes("doctor") && x.participants.includes("admin")) as { id: string } | undefined;
    let convId = conv?.id;
    if (!convId) {
      const { data: created } = await supabase.from("chat_conversations").insert({
        doctor_slot: r.doctor_slot,
        participants: ["doctor", "admin"],
        title: `حالات ${doctor?.name ?? `Slot #${r.doctor_slot}`} — الإدارة`,
        created_by: "admin",
      }).select("id").single();
      convId = created?.id;
    }
    if (convId) {
      await supabase.from("chat_messages").insert({
        conversation_id: convId, sender: "admin", sender_name: "الإدارة",
        content, message_type: "text",
      });
    }
  }

  async function approve() {
    if (busy) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("slot_cases").update({
      archive_approval: "approved",
      archive_reviewed_at: now,
      archive_reviewed_by: "الإدارة",
      archive_reject_reason: null,
      final_archived: true,
      archived: true,
    } as any).eq("id", r.id);
    if (error) { setBusy(false); toast.error(error.message); return; }
    await supabase.from("chat_conversations").update({ archived: true })
      .eq("doctor_slot", r.doctor_slot).like("title", `[${r.case_code}]%`);
    await notifyDoctor(`✅ وافقت الإدارة على أرشفة الحالة ${r.case_code} (${r.patient_name}) بعد الاطلاع على سند حساب المريض. الحالة مؤرشفة نهائياً.`);
    toast.success("تمت الموافقة وأُرشفت الحالة نهائياً");
    setBusy(false);
    onDone();
  }

  async function reject() {
    if (busy) return;
    if (!reason.trim()) { toast.error("اكتب سبب عدم الموافقة"); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("slot_cases").update({
      archive_approval: "rejected",
      archive_reviewed_at: now,
      archive_reviewed_by: "الإدارة",
      archive_reject_reason: reason.trim(),
      final_archived: false,
      archived: false,
    } as any).eq("id", r.id);
    if (error) { setBusy(false); toast.error(error.message); return; }
    await notifyDoctor(`⛔ لم توافق الإدارة على أرشفة الحالة ${r.case_code} (${r.patient_name}).\nالسبب: ${reason.trim()}\nيرجى إعادة إرسال سند حساب المريض بعد المعالجة.`);
    toast.success("تم تسجيل عدم الموافقة وإشعار الطبيب");
    setBusy(false);
    setRejecting(false);
    setReason("");
    onDone();
  }

  const tone = status === "approved" ? "border-emerald-500/60" : status === "rejected" ? "border-rose-500/60" : "border-amber-500/60";
  const StatusIcon = status === "approved" ? Check : status === "rejected" ? AlertTriangle : Clock;
  const statusLabel = status === "approved" ? "تمت الموافقة — مؤرشفة" : status === "rejected" ? "غير موافق" : "بانتظار قرار الإدارة";

  return (
    <div className={`rounded-2xl bg-card border-2 ${tone} p-4 shadow-luxury space-y-3`}>
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
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${status === "approved" ? "bg-emerald-600 text-white" : status === "rejected" ? "bg-rose-600 text-white" : "bg-amber-500 text-white animate-pulse"}`}>
          <StatusIcon className="size-3" /> {statusLabel}
        </span>
      </div>

      {url ? (
        <button type="button" onClick={() => setOpen(true)} className="block w-full">
          <img src={url} alt={r.archive_receipt_name ?? "سند حساب المريض"}
            className="w-full max-h-64 rounded-xl object-contain border border-border bg-muted/30" />
        </button>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-[11px] text-muted-foreground">
          لا توجد صورة مرفقة
        </div>
      )}
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Receipt className="size-3.5 text-gold" /> سند حساب المريض
        {r.archive_receipt_sent_at && <span className="font-mono">• {new Date(r.archive_receipt_sent_at).toLocaleString("ar")}</span>}
      </div>
      {r.archive_request_note && (
        <div className="rounded-lg bg-muted/40 p-2 text-[11px] whitespace-pre-wrap">📝 {r.archive_request_note}</div>
      )}
      {status === "rejected" && r.archive_reject_reason && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-50/60 p-2 text-[11px] text-rose-900 whitespace-pre-wrap">
          سبب عدم الموافقة: {r.archive_reject_reason}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/60">
        <Link to="/cases/$id" params={{ id: r.id }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-bold hover:border-gold">
          <ExternalLink className="size-3.5" /> فتح الحالة
        </Link>
        {status !== "approved" && (
          <button onClick={approve} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-[11px] font-bold shadow disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} الموافقة على الأرشفة
          </button>
        )}
        {status !== "rejected" && (
          <button onClick={() => setRejecting(v => !v)} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-2 text-[11px] font-bold shadow disabled:opacity-60">
            <X className="size-3.5" /> عدم الموافقة
          </button>
        )}
      </div>

      {rejecting && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-50/50 p-3 space-y-2">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="سبب عدم الموافقة على الأرشفة…"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-gold resize-y" />
          <button onClick={reject} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-3 py-2 text-[11px] font-bold shadow disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />} تأكيد عدم الموافقة
          </button>
        </div>
      )}

      {open && url && (
        <ImageLightbox images={[{ url, name: r.archive_receipt_name ?? "سند حساب المريض" }]} index={0}
          onIndexChange={() => {}} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
