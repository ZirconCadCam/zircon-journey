import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff, Save, RefreshCw, Loader2, Stethoscope, UserCog, Copy, Check, ShieldOff, ShieldCheck } from "lucide-react";
import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { DOCTOR_PASSWORD_REQUIRED, getAppFlag, setAppFlag } from "@/lib/app-flags";
import { listPasswords, setStaffPassword, setDoctorPassword } from "@/lib/staff-auth.functions";

// Page-manager roles whose passwords the admin can manage here.
const STAFF_ROLE_KEYS: Exclude<RoleKey, "doctor">[] = [
  "designer",
  "technician",
  "secretary_sanaa",
  "secretary_ibb",
  "admin",
];


interface StaffSecret {
  role: string;
  configured: boolean;
}
interface DoctorSecret {
  slot: number;
  name: string;
  active: boolean;
  configured: boolean;
}

export function PasswordManagerPanel() {
  const [staff, setStaff] = useState<StaffSecret[]>([]);
  const [doctors, setDoctors] = useState<DoctorSecret[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let s: { role: string; configured: boolean }[] = [];
    let d: DoctorSecret[] = [];
    try { const r = await listPasswords(); s = r.staff; d = r.doctors; }
    catch { toast.error("تعذر تحميل كلمات المرور — سجّل دخول الإدارة"); }
    const sMap = new Map((s ?? []).map((r: any) => [r.role, r.configured]));
    setStaff(
      STAFF_ROLE_KEYS.map((role) => ({ role, configured: sMap.get(role) ?? false })),
    );
    setDoctors(((d ?? []) as DoctorSecret[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-luxury">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-rose-500/10 text-rose-600 grid place-items-center">
            <KeyRound className="size-5" />
          </div>
          <div>
            <div className="font-bold">إدارة كلمات المرور</div>
            <div className="text-[11px] text-muted-foreground">
              تغيير كلمات مرور مسؤولي الصفحات والأطباء
            </div>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-border bg-background p-2 hover:border-gold disabled:opacity-50"
          aria-label="تحديث"
          title="تحديث"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>

      {/* Page managers */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
          <UserCog className="size-4 text-gold" /> مسؤولو الصفحات
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {staff.map((s) => (
            <PasswordRow
              key={s.role}
              title={ROLE_LABEL[s.role as RoleKey]}
              configured={s.configured}
              onSave={async (pw) => {
                const r = await setStaffPassword({ data: { role: s.role as "admin" | "designer" | "technician", password: pw } }).catch(() => ({ ok: false, error: "غير مصرح" }));
                if (!r.ok) { toast.error(r.error ?? "تعذر الحفظ"); return false; }
                toast.success(`تم تحديث كلمة مرور ${ROLE_LABEL[s.role as RoleKey]}`);
                load();
                return true;
              }}
            />
          ))}
        </div>
      </div>

      {/* Doctors */}
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
          <Stethoscope className="size-4 text-gold" /> الأطباء
        </div>
        <DoctorLoginToggle />
        {loading ? (

          <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {doctors.map((d) => (
              <PasswordRow
                key={d.slot}
                title={d.name}
                subtitle={`خانة #${d.slot}${d.active ? "" : " • معطّلة"}`}
                configured={d.configured}
                onSave={async (pw) => {
                  const r = await setDoctorPassword({ data: { slot: d.slot, password: pw } }).catch(() => ({ ok: false, error: "غير مصرح" }));
                  if (!r.ok) { toast.error(r.error ?? "تعذر الحفظ"); return false; }
                  toast.success(`تم تحديث كلمة مرور ${d.name}`);
                  load();
                  return true;
                }}
              />
            ))}
            {doctors.length === 0 && (
              <div className="text-xs text-muted-foreground">لا يوجد أطباء.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DoctorLoginToggle() {
  const [required, setRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAppFlag(DOCTOR_PASSWORD_REQUIRED).then((v) => {
      setRequired(v);
      setLoading(false);
    });
  }, []);

  async function toggle() {
    const next = !required;
    if (
      !confirm(
        next
          ? "تفعيل طلب كلمة المرور لدخول صفحات الأطباء؟"
          : "إيقاف طلب كلمة المرور؟ سيتمكن أي شخص من فتح صفحة الطبيب بدون كلمة مرور.",
      )
    )
      return;
    // Server-side permission check: only the administration may flip this flag.
    // Signed-in admins pass automatically; otherwise the admin password is required.
    const pw = prompt("لتأكيد الصلاحية، أدخل كلمة مرور الإدارة:") ?? "";
    if (!pw.trim()) return;
    setSaving(true);
    const err = await setAppFlag(DOCTOR_PASSWORD_REQUIRED, next, pw.trim());
    setSaving(false);
    if (err) { toast.error(err); return; }
    setRequired(next);
    toast.success(next ? "تم تفعيل طلب كلمة المرور" : "تم إيقاف طلب كلمة المرور");
  }


  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/20 p-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${required ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
          {required ? <ShieldCheck className="size-4.5" /> : <ShieldOff className="size-4.5" />}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold">تسجيل الدخول بكلمة المرور لصفحة الطبيب</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {loading
              ? "جارٍ التحميل…"
              : required
                ? "مُفعّل: يُطلب من الطبيب إدخال كلمة المرور للدخول إلى صفحته."
                : "موقوف: يدخل الطبيب إلى صفحته مباشرة بدون كلمة مرور."}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={loading || saving}
        className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${required ? "gradient-gold shadow-gold" : "bg-muted"}`}
        aria-label="تفعيل أو إيقاف كلمة المرور"
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition ${required ? "right-0.5" : "right-[22px]"}`} />
      </button>
    </div>
  );
}

function PasswordRow({ title, subtitle, configured, onSave }: {
  title: string; subtitle?: string; configured: boolean; onSave: (pw: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const pw = draft.trim();
    if (pw.length < 4 || new TextEncoder().encode(pw).length > 72) { toast.error("أدخل كلمة مرور من 4 حروف على الأقل وبحد أقصى 72 بايت"); return; }
    setSaving(true);
    try { if (await onSave(pw)) { setEditing(false); setDraft(""); } }
    finally { setSaving(false); }
  }
  return <div className="rounded-xl border border-border bg-muted/20 p-3">
    <div className="font-bold text-sm truncate">{title}</div>
    {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
    {!editing ? <div className="mt-2 flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{configured ? "كلمة المرور مضبوطة" : "لم تُضبط كلمة المرور"}</span>
      <button onClick={() => setEditing(true)} className="rounded-lg gradient-gold text-gold-foreground px-2.5 py-1.5 text-xs font-bold">تغيير</button>
    </div> : <div className="mt-2 flex items-center gap-1.5">
      <input type="password" autoComplete="new-password" autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => e.key === "Enter" && save()} placeholder="كلمة المرور الجديدة" dir="ltr"
        className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-sm" />
      <button onClick={save} disabled={saving} title="حفظ" aria-label="حفظ" className="rounded-lg gradient-brown text-primary-foreground p-1.5">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
      </button>
      <button onClick={() => { setEditing(false); setDraft(""); }} className="text-xs">إلغاء</button>
    </div>}
  </div>;
}
