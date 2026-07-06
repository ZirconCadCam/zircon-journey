import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Calendar, Building2, User, Hash, Phone,
  ClipboardList, ScanLine, Download, X, Loader2, FileText,
  MoreVertical, Pin, PinOff, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { getStage, deriveStageKey } from "@/lib/case-stages";
import { ShadeBadge } from "@/components/shade-badge";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { getSignedUrl } from "@/lib/chat";
import { fileManagerSupported, openCachedFile } from "@/lib/file-manager";
import type { CaseFileLocation, CaseRole } from "@/lib/case-folders";

type Actor =
  | "doctor" | "designer" | "technician"
  | "secretary_sanaa" | "secretary_ibb" | "admin";

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }

interface CaseRow {
  id: string; doctor_slot: number; case_code: string; patient_name: string;
  patient_phone: string | null; patient_age: number | null; patient_gender: string | null;
  tooth_number: string | null; teeth_count: string | null; shade: string | null;
  case_type: string | null; notes: string | null; created_at: string;
  scan_path: string | null; scan_name: string | null; scan_mime: string | null;
  scan_size: number | null;
  design_done?: boolean | null; design_file_sent?: boolean | null;
  tech_data_sent_to_secretary?: boolean | null; final_archived?: boolean | null;
  archived?: boolean | null; pinned?: boolean | null;
  [k: string]: any;
}

/**
 * Professional case search — available to every role. Results are scoped by the
 * actor's permissions, with branch (صنعاء/إب) and date-range (من~إلى) filters.
 */
export function CaseSearch({ actor, restrictSlot }: { actor: Actor; restrictSlot?: number }) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState<"all" | "sanaa" | "ibb">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: docs }, { data: cs }] = await Promise.all([
        supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot"),
        supabase.from("slot_cases").select("*").order("created_at", { ascending: false }),
      ]);
      setDoctors(((docs ?? []) as Doctor[]).filter(d => d.active));
      setCases((cs ?? []) as CaseRow[]);
      setLoading(false);
    })();
  }, []);

  const doctorMap = useMemo(() => {
    const m = new Map<number, Doctor>();
    doctors.forEach(d => m.set(d.slot, d));
    return m;
  }, [doctors]);

  // Permission scope: each role searches only what it's allowed to see.
  const scoped = useMemo(() => {
    let list = cases;
    if (restrictSlot != null) list = list.filter(c => c.doctor_slot === restrictSlot);
    if (actor === "technician") {
      list = list.filter(c => c.design_file_sent || c.design_done || c.final_archived);
    } else if (actor === "secretary_sanaa" || actor === "secretary_ibb") {
      const b = actor === "secretary_sanaa" ? "sanaa" : "ibb";
      list = list.filter(c => {
        const d = doctorMap.get(c.doctor_slot);
        return d?.branch === b && (c.tech_data_sent_to_secretary || c.final_archived);
      });
    }
    // doctor (restrictSlot), designer, admin → no extra filtering
    return list;
  }, [cases, actor, restrictSlot, doctorMap]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromT = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toT = to ? new Date(`${to}T23:59:59`).getTime() : null;
    return scoped.filter(c => {
      const d = doctorMap.get(c.doctor_slot);
      if (branch !== "all" && d?.branch !== branch) return false;
      const t = new Date(c.created_at).getTime();
      if (fromT && t < fromT) return false;
      if (toT && t > toT) return false;
      if (term) {
        const hay = [c.case_code, c.patient_name, c.patient_phone, c.tooth_number, c.shade, c.case_type, c.notes, d?.name]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    }).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }, [scoped, q, branch, from, to, doctorMap]);

  /** Admin: pin/unpin a case so it sorts to the top of search results. */
  async function togglePin(c: CaseRow) {
    const next = !c.pinned;
    setCases(prev => prev.map(x => x.id === c.id ? { ...x, pinned: next } : x));
    const { error } = await supabase.from("slot_cases").update({ pinned: next }).eq("id", c.id);
    if (error) {
      setCases(prev => prev.map(x => x.id === c.id ? { ...x, pinned: c.pinned } : x));
      toast.error("تعذر تحديث التثبيت");
      return;
    }
    toast.success(next ? "تم تثبيت الحالة" : "تم إلغاء التثبيت");
  }

  /** Admin: permanently delete a case. */
  async function deleteCase(c: CaseRow) {
    if (!confirm(`حذف الحالة ${c.case_code} نهائياً؟ لا يمكن التراجع.`)) return;
    setBusy(c.id);
    const { error } = await supabase.from("slot_cases").delete().eq("id", c.id);
    setBusy(null);
    if (error) { toast.error("تعذر الحذف"); return; }
    setCases(prev => prev.filter(x => x.id !== c.id));
    toast.success("تم حذف الحالة نهائياً");
  }

  async function openScan(c: CaseRow) {
    if (!c.scan_path) { toast.error("لا يوجد ملف مرفق"); return; }
    setBusy(c.id);
    try {
      const role: CaseRole =
        actor === "designer" ? "designer" : actor === "technician" ? "technician"
          : actor === "doctor" ? "doctor" : "admin";
      const loc: CaseFileLocation = {
        role,
        doctorName: doctorMap.get(c.doctor_slot)?.name,
        patientName: c.patient_name,
        caseCode: c.case_code,
        category: "downloaded",
      };
      const name = c.scan_name || `${c.case_code}-scan`;
      // Re-open from the device file manager if already saved there.
      const opened = await openCachedFile(name, loc, c.scan_mime);
      if (opened) { toast.success("تم فتح الملف من جهازك"); return; }
      const resolved = /^https?:\/\//i.test(c.scan_path)
        ? c.scan_path
        : (await getSignedUrl(c.scan_path, 3600)) ?? c.scan_path;
      const { transferDownload } = await import("@/lib/transfer-manager");
      await transferDownload({ url: resolved, filename: name, mime: c.scan_mime, saveToCenter: fileManagerSupported(), location: loc });
    } catch (e: any) {
      toast.error(e.message || "تعذر فتح الملف");
    } finally { setBusy(null); }
  }

  const hasFilters = !!q || branch !== "all" || !!from || !!to;
  function reset() { setQ(""); setBranch("all"); setFrom(""); setTo(""); }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury space-y-3">
        <div className="relative">
          <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="ابحث برمز الحالة، اسم المريض، الهاتف، السن، اللون، الطبيب…"
            className="w-full rounded-xl border border-input bg-background pr-10 pl-3 py-2.5 text-sm outline-none focus:border-gold"
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <div className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
              <Building2 className="size-3 text-gold" /> الفرع
            </div>
            <select value={branch} onChange={e => setBranch(e.target.value as any)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold">
              <option value="all">كل الفروع</option>
              <option value="sanaa">صنعاء</option>
              <option value="ibb">إب</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="size-3 text-gold" /> من تاريخ
            </div>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
          <label className="block">
            <div className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="size-3 text-gold" /> إلى تاريخ
            </div>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            النتائج: <span className="font-bold text-foreground">{results.length}</span>
          </div>
          {hasFilters && (
            <button onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition">
              <X className="size-3.5" /> مسح الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <Loader2 className="size-6 animate-spin mx-auto mb-2" /> جارٍ التحميل…
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <ClipboardList className="size-10 mx-auto mb-3 opacity-40" />
          {hasFilters ? "لا توجد نتائج مطابقة." : "ابدأ بكتابة كلمة للبحث أو استخدم الفلاتر."}
        </div>
      ) : (
        <ul className="space-y-3">
          {results.map(c => {
            const doctor = doctorMap.get(c.doctor_slot);
            const busyThis = busy === c.id;
            return (
              <li key={c.id} className="rounded-2xl bg-card border border-border p-5 shadow-luxury hover:border-gold/60 transition">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs rounded-md bg-muted px-2 py-0.5 font-bold">{c.case_code}</span>
                      <span className="text-[11px] rounded-full gradient-gold text-gold-foreground px-2 py-0.5 font-bold">{getStage(deriveStageKey(c)).label}</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="size-3" /> {new Date(c.created_at).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                    <div className="mt-2 font-extrabold text-lg flex items-center gap-2">
                      <User className="size-4 text-gold" /> {c.patient_name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <DoctorAvatar name={doctor?.name} className="size-7" />
                      <span className="flex items-center gap-1">
                        {doctor?.name ?? `Slot ${c.doctor_slot}`}
                        {doctor?.branch && <> • {doctor.branch === "sanaa" ? "صنعاء" : "إب"}</>}
                      </span>
                    </div>

                    {c.shade && <div className="mt-3"><ShadeBadge shade={c.shade} /></div>}

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {c.tooth_number && <Info icon={<Hash className="size-3" />} label="السن" value={c.tooth_number} />}
                      {c.case_type && <Info icon={<ClipboardList className="size-3" />} label="النوع" value={c.case_type} />}
                      {c.patient_phone && <Info icon={<Phone className="size-3" />} label="الهاتف" value={c.patient_phone} />}
                      {c.teeth_count && <Info icon={<Hash className="size-3" />} label="العدد" value={c.teeth_count} />}
                    </div>

                    {c.notes && (
                      <div className="mt-3 text-xs bg-muted/40 rounded-lg p-2.5 whitespace-pre-wrap">{c.notes}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold px-2 py-0.5 text-[10px] font-bold">
                        <Pin className="size-3" /> مثبّتة
                      </span>
                    )}
                    {c.scan_path && (
                      <button onClick={() => openScan(c)} disabled={busyThis}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition disabled:opacity-60"
                        title="فتح/تنزيل ملف الحالة">
                        {busyThis ? <Loader2 className="size-3.5 animate-spin" /> : <ScanLine className="size-3.5 text-gold" />}
                        <span>الملف</span>
                        <Download className="size-3.5" />
                      </button>
                    )}
                    {actor === "admin" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 hover:border-gold transition"
                            title="خيارات">
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                          <DropdownMenuItem onClick={() => togglePin(c)}>
                            {c.pinned
                              ? <><PinOff className="size-4" /> إلغاء التثبيت</>
                              : <><Pin className="size-4" /> تثبيت</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteCase(c)}
                            className="text-destructive focus:text-destructive">
                            <Trash2 className="size-4" /> حذف الحالة
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2 py-1.5">
      <span className="text-gold">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-bold truncate">{value}</span>
    </div>
  );
}
