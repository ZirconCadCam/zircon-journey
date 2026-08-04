import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff, Save, RefreshCw, Loader2, Stethoscope, UserCog, Copy, Check, ShieldOff, ShieldCheck } from "lucide-react";
import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { DOCTOR_PASSWORD_REQUIRED, getAppFlag, setAppFlag } from "@/lib/app-flags";

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
  password: string | null;
}
interface DoctorSecret {
  slot: number;
  name: string;
  active: boolean;
  password: string | null;
}

export function PasswordManagerPanel() {
  const [staff, setStaff] = useState<StaffSecret[]>([]);
  const [doctors, setDoctors] = useState<DoctorSecret[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.rpc("list_staff_secrets"),
      supabase.rpc("list_doctor_secrets"),
    ]);
    const sMap = new Map((s ?? []).map((r: any) => [r.role, r.password]));
    setStaff(
      STAFF_ROLE_KEYS.map((role) => ({ role, password: sMap.get(role) ?? null })),
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
              تغيير وعرض كلمات مرور مسؤولي الصفحات والأطباء
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
              value={s.password}
              onSave={async (pw) => {
                const { error } = await supabase.rpc("set_staff_secret", {
                  p_role: s.role,
                  p_password: pw,
                });
                if (error) { toast.error(error.message); return false; }
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
                value={d.password}
                onSave={async (pw) => {
                  const { error } = await supabase.rpc("set_doctor_secret", {
                    p_slot: d.slot,
                    p_password: pw,
                  });
                  if (error) { toast.error(error.message); return false; }
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

function PasswordRow({

  title,
  subtitle,
  value,
  onSave,
}: {
  title: string;
  subtitle?: string;
  value: string | null;
  onSave: (pw: string) => Promise<boolean>;
}) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    const pw = draft.trim();
    if (pw.length < 3) { toast.error("كلمة المرور قصيرة جداً"); return; }
    setSaving(true);
    const ok = await onSave(pw);
    setSaving(false);
    if (ok) { setEditing(false); setDraft(""); }
  }

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{title}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground">{subtitle}</div>}
        </div>
      </div>

      {!editing ? (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-sm truncate" dir="ltr">
            {value ? (show ? value : "•".repeat(Math.min(value.length, 10))) : "— لا توجد —"}
          </div>
          <button
            onClick={() => setShow((v) => !v)}
            disabled={!value}
            className="rounded-lg border border-border bg-background p-1.5 hover:border-gold disabled:opacity-40"
            title={show ? "إخفاء" : "عرض"}
            aria-label={show ? "إخفاء" : "عرض"}
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <button
            onClick={copy}
            disabled={!value}
            className="rounded-lg border border-border bg-background p-1.5 hover:border-gold disabled:opacity-40"
            title="نسخ"
            aria-label="نسخ"
          >
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          </button>
          <button
            onClick={() => { setEditing(true); setDraft(value ?? ""); }}
            className="rounded-lg gradient-gold text-gold-foreground px-2.5 py-1.5 text-xs font-bold"
          >
            تغيير
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="كلمة المرور الجديدة"
            className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:border-gold"
            dir="ltr"
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg gradient-brown text-primary-foreground p-1.5 disabled:opacity-50"
            title="حفظ"
            aria-label="حفظ"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          </button>
          <button
            onClick={() => { setEditing(false); setDraft(""); }}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
}
