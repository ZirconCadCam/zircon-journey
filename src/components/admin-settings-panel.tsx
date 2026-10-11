import { useEffect, useState } from "react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDoctor } from "@/lib/secure-ops.functions";
import { Settings, UserPlus, Archive, Stethoscope, RefreshCw, Save, HardDrive, Trash2, Loader2, FolderOpen } from "lucide-react";
import {
  getCacheStats,
  clearCenterCache,
  getCenterFolderStatus,
  requestCenterPermission,
  formatBytes,
  CENTER_FOLDER_NAME,
  type CacheStats,
  type CenterStatus,
} from "@/lib/file-manager";
import { AvatarManagerPanel } from "@/components/avatar-manager-panel";
import { PasswordManagerPanel } from "@/components/password-manager-panel";

interface Doctor {
  slot: number;
  name: string;
  branch: string | null;
  active: boolean;
}

export function AdminSettingsPanel() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("doctor_profiles")
      .select("slot,name,branch,active")
      .order("slot");
    setDoctors((data as Doctor[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-settings-doctors")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doctor_profiles" },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl gradient-brown text-primary-foreground p-6 shadow-luxury flex items-center gap-4">
        <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold">
          <Settings className="size-6 text-gold-foreground" />
        </div>
        <div>
          <div className="text-xs opacity-80">إدارة المركز</div>
          <div className="text-2xl font-extrabold">الإعدادات</div>
          <div className="text-xs opacity-80 mt-1">
            أدوات احترافية لإدارة التطبيق والصفحات
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <AddDoctorCard doctors={doctors} onDone={load} />
        <ArchiveDoctorCard doctors={doctors} loading={loading} onDone={load} />
      </div>

      <PasswordManagerPanel />

      <AvatarManagerPanel />

      <GeneralAppSettingsCard />

      <FileCacheCard />
    </div>
  );
}

/* -------------------- ذاكرة كاش ملفات مركز زركون -------------------- */

function FileCacheCard() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [status, setStatus] = useState<CenterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  async function refresh() {
    setLoading(true);
    const [st, s] = await Promise.all([getCenterFolderStatus(), getCacheStats()]);
    setStatus(st);
    setStats(s);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function clearCache() {
    if (!confirm(`هل تريد مسح جميع ملفات الكاش المخزنة في مجلد «${CENTER_FOLDER_NAME}» على هذا الجهاز؟ لا يمكن التراجع، وستتم إعادة جلب الملفات من السحابة عند الحاجة.`)) return;
    setClearing(true);
    try {
      const r = await clearCenterCache();
      toast.success(`تم مسح ${r.removed} عنصراً من الكاش`);
      await refresh();
    } catch {
      toast.error("تعذر مسح الكاش");
    } finally {
      setClearing(false);
    }
  }

  async function grant() {
    const ok = await requestCenterPermission();
    if (ok) { toast.success("تم منح الصلاحية"); await refresh(); }
    else toast.error("لم يتم منح الصلاحية");
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-luxury">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center">
            <HardDrive className="size-5" />
          </div>
          <div>
            <div className="font-bold">ذاكرة كاش ملفات الجهاز</div>
            <div className="text-[11px] text-muted-foreground">
              ملفات مركز زركون المخزنة محلياً لفتحها بسرعة دون استهلاك بيانات
            </div>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg border border-border bg-background p-2 hover:border-gold disabled:opacity-50"
          aria-label="تحديث"
          title="تحديث"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>

      {status === "unsupported" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          متصفحك الحالي لا يدعم تخزين الملفات في مجلد الجهاز. تُفتح الملفات مباشرةً من السحابة.
        </div>
      ) : status === "none" ? (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-center space-y-3">
          <div className="text-xs text-muted-foreground">
            لم يتم ربط مجلد «{CENTER_FOLDER_NAME}» على هذا الجهاز بعد.
          </div>
          <button
            onClick={grant}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold"
          >
            <FolderOpen className="size-3.5" /> ربط المجلد الآن
          </button>
        </div>
      ) : status === "denied" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center space-y-3">
          <div className="text-xs text-amber-700">
            صلاحية الوصول إلى مجلد الجهاز غير ممنوحة حالياً.
          </div>
          <button
            onClick={grant}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold"
          >
            <FolderOpen className="size-3.5" /> منح الصلاحية
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">الحجم الحالي للكاش</div>
              <div className="text-lg font-extrabold">{formatBytes(stats?.totalBytes ?? 0)}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">عدد الملفات</div>
              <div className="text-lg font-extrabold">{stats?.fileCount ?? 0}</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-[11px] font-bold text-muted-foreground mb-1.5">الأنواع المخزنة</div>
            {stats && stats.types.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {stats.types.map((t) => (
                  <span
                    key={t.ext}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-bold"
                    title={`${t.count} ملف — ${formatBytes(t.bytes)}`}
                  >
                    <span className="uppercase text-gold">.{t.ext}</span>
                    <span className="text-muted-foreground">×{t.count}</span>
                    <span className="text-muted-foreground">({formatBytes(t.bytes)})</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">لا توجد ملفات مخزنة بعد.</div>
            )}
          </div>

          <button
            onClick={clearCache}
            disabled={clearing || (stats?.fileCount ?? 0) === 0}
            className="w-full rounded-xl bg-destructive text-destructive-foreground py-2.5 font-bold shadow-luxury disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {clearing ? "جاري المسح..." : "مسح كاش الملفات"}
          </button>
        </>
      )}
    </div>
  );
}

/* -------------------- إضافة طبيب جديد -------------------- */

function AddDoctorCard({ doctors, onDone }: { doctors: Doctor[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState<"sanaa" | "ibb" | "">("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // إيجاد أول خانة شاغرة (غير مفعّلة) أو إضافة خانة جديدة
  const nextSlot = (() => {
    const max = doctors.reduce((m, d) => Math.max(m, d.slot), 0);
    return max + 1;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      toast.error("الرجاء إدخال اسم الطبيب وكلمة المرور");
      return;
    }
    if (!confirm(`هل أنت متأكد من إضافة الطبيب "${name}" في الخانة #${nextSlot}؟`)) return;

    setSaving(true);
    const res = await addDoctor({ data: { name: name.trim(), branch: branch || null, password: password.trim() } }).catch((e) => ({ slot: null, error: String(e?.message ?? e) }));
    setSaving(false);
    if (res.error || !res.slot) {
      toast.error(res.error ?? "تعذّرت الإضافة");
      return;
    }
    toast.success(`تمت إضافة "${name}" بنجاح في الخانة #${res.slot}`);
    setName("");
    setBranch("");
    setPassword("");
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-card border border-border p-6 shadow-luxury"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
          <UserPlus className="size-5 text-gold-foreground" />
        </div>
        <div>
          <div className="font-bold">إضافة طبيب جديد</div>
          <div className="text-[11px] text-muted-foreground">
            ستتم إضافة الطبيب في الخانة #{nextSlot}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold mb-1 block">اسم الطبيب</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="د. أحمد محمد"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="text-xs font-bold mb-1 block">الفرع</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value as any)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold"
          >
            <option value="">— لا يوجد —</option>
            <option value="sanaa">فرع صنعاء</option>
            <option value="ibb">فرع إب</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold mb-1 block">كلمة المرور</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:border-gold"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="mt-5 w-full rounded-xl gradient-brown py-2.5 font-bold shadow-luxury disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <UserPlus className="size-4" />
        {saving ? "جاري الحفظ..." : "إضافة الطبيب"}
      </button>
    </form>
  );
}

/* -------------------- أرشفة صفحة طبيب -------------------- */

function ArchiveDoctorCard({
  doctors,
  loading,
  onDone,
}: {
  doctors: Doctor[];
  loading: boolean;
  onDone: () => void;
}) {
  const activeDoctors = doctors.filter((d) => d.active);
  const archivedDoctors = doctors.filter((d) => !d.active);
  const [selected, setSelected] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function archive() {
    if (!selected) {
      toast.error("اختر طبيباً من القائمة أولاً");
      return;
    }
    const d = doctors.find((x) => x.slot === selected);
    if (!d) return;
    if (
      !confirm(
        `هل تريد أرشفة صفحة "${d.name}"؟ سيتم إخفاؤها من بوابة الطبيب ولن يتمكن من الدخول. يمكن استرجاعها لاحقاً.`,
      )
    )
      return;

    setSaving(true);
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ active: false })
      .eq("slot", d.slot);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`تمت أرشفة "${d.name}" بنجاح`);
    setSelected("");
    onDone();
  }

  async function restore(slot: number, name: string) {
    if (!confirm(`استعادة صفحة "${name}" وإعادة تفعيلها؟`)) return;
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ active: true })
      .eq("slot", slot);
    if (error) toast.error(error.message);
    else {
      toast.success(`تمت استعادة "${name}"`);
      onDone();
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-luxury">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
          <Archive className="size-5" />
        </div>
        <div>
          <div className="font-bold">أرشفة صفحة طبيب</div>
          <div className="text-[11px] text-muted-foreground">
            إخفاء صفحة الطبيب من بوابة الأطباء
          </div>
        </div>
      </div>

      <label className="text-xs font-bold mb-1 block">اختر الطبيب</label>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : "")}
        disabled={loading || activeDoctors.length === 0}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold disabled:opacity-50"
      >
        <option value="">— اختر طبيباً —</option>
        {activeDoctors.map((d) => (
          <option key={d.slot} value={d.slot}>
            #{d.slot} — {d.name}
            {d.branch === "sanaa" ? " (صنعاء)" : d.branch === "ibb" ? " (إب)" : ""}
          </option>
        ))}
      </select>

      <button
        onClick={archive}
        disabled={saving || !selected}
        className="mt-4 w-full rounded-xl bg-destructive text-destructive-foreground py-2.5 font-bold shadow-luxury disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Archive className="size-4" />
        {saving ? "جاري الأرشفة..." : "أرشفة الصفحة"}
      </button>

      {archivedDoctors.length > 0 && (
        <div className="mt-5 pt-5 border-t border-border">
          <div className="text-xs font-bold mb-2 flex items-center gap-2 text-muted-foreground">
            <Stethoscope className="size-3.5" /> الصفحات المؤرشفة ({archivedDoctors.length})
          </div>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {archivedDoctors.map((d) => (
              <li
                key={d.slot}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="truncate flex items-center gap-1.5">
                  <DoctorAvatar name={d.name} className="size-5" />
                  <span className="font-mono text-muted-foreground">#{d.slot}</span>{" "}
                  <span className="font-bold">{d.name}</span>
                </span>
                <button
                  onClick={() => restore(d.slot, d.name)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-bold hover:border-gold flex items-center gap-1"
                >
                  <RefreshCw className="size-3" /> استعادة
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------- إعدادات التطبيق العامة -------------------- */

const APP_SETTINGS_KEY = "zircon_app_settings";

interface AppSettings {
  appTitle: string;
  showInstallPrompt: boolean;
  enableSoundNotifications: boolean;
  enableInAppAlerts: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  appTitle: "رحلة سن الزركون",
  showInstallPrompt: true,
  enableSoundNotifications: true,
  enableInAppAlerts: true,
};

function GeneralAppSettingsCard() {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APP_SETTINGS_KEY);
      if (raw) setS({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);

  function save() {
    setSaving(true);
    try {
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(s));
      toast.success("تم حفظ إعدادات التطبيق");
    } catch {
      toast.error("تعذر الحفظ");
    }
    setTimeout(() => setSaving(false), 300);
  }

  function reset() {
    if (!confirm("إعادة جميع إعدادات التطبيق إلى الافتراضي؟")) return;
    setS(DEFAULT_SETTINGS);
    localStorage.removeItem(APP_SETTINGS_KEY);
    toast.success("تمت إعادة الضبط");
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-6 shadow-luxury">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center">
          <Settings className="size-5" />
        </div>
        <div>
          <div className="font-bold">إعدادات التطبيق العامة</div>
          <div className="text-[11px] text-muted-foreground">
            تطبق هذه الإعدادات على كافة الصفحات في هذا المتصفح
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-bold mb-1 block">عنوان التطبيق</label>
          <input
            value={s.appTitle}
            onChange={(e) => setS({ ...s, appTitle: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>

        <Toggle
          label="عرض شريط تثبيت التطبيق"
          desc="اقتراح إضافة التطبيق إلى الشاشة الرئيسية"
          value={s.showInstallPrompt}
          onChange={(v) => setS({ ...s, showInstallPrompt: v })}
        />
        <Toggle
          label="الإشعارات الصوتية"
          desc="تشغيل نغمة عند الرسائل والتحديثات"
          value={s.enableSoundNotifications}
          onChange={(v) => setS({ ...s, enableSoundNotifications: v })}
        />
        <Toggle
          label="تنبيهات داخل التطبيق"
          desc="عرض رسائل toast عند تغيّر حالة الطلبات"
          value={s.enableInAppAlerts}
          onChange={(v) => setS({ ...s, enableInAppAlerts: v })}
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl gradient-brown px-5 py-2.5 font-bold shadow-luxury disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="size-4" /> {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>
        <button
          onClick={reset}
          className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-gold"
        >
          إعادة الضبط
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3 cursor-pointer hover:border-gold/60 transition">
      <div className="min-w-0">
        <div className="text-sm font-bold">{label}</div>
        {desc && <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition shrink-0 ${value ? "gradient-gold shadow-gold" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition ${value ? "right-0.5" : "right-[22px]"}`}
        />
      </button>
    </label>
  );
}
