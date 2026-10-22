import { useEffect, useState } from "react";
import { getSystemStatus, getConfigCheck, type Probe, type ConfigItem } from "@/lib/system-status.functions";
import { RefreshCw, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

const META: Record<string, { label: string; affects: string }> = {
  database: { label: "قاعدة البيانات", affects: "الحالات، المحادثات، الحسابات، الكشوف، الإشعارات" },
  auth: { label: "خدمة الدخول", affects: "صفحات الدخول بالحساب" },
  storage: { label: "تخزين الملفات", affects: "رفع وتحميل ملفات zip و rar و html والصور" },
  telegram: { label: "بوت تلجرام", affects: "الإرسال التلقائي للملفات والكشوف إلى الجروب" },
};

export function AdminSystemStatus() {
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const r = await getSystemStatus();
      setProbes(r.probes); setCheckedAt(r.checkedAt);
    } catch {
      setProbes(Object.keys(META).map((key) => ({ key, state: "unknown", ms: null, detail: "تعذر الوصول إلى خادم التطبيق" })));
      setCheckedAt(new Date().toISOString());
    } finally { setBusy(false); }
  }
  const [config, setConfig] = useState<ConfigItem[] | null>(null);
  const [configErr, setConfigErr] = useState(false);
  async function checkConfig() {
    try { setConfig((await getConfigCheck()).items); setConfigErr(false); } catch { setConfigErr(true); }
  }
  useEffect(() => { check(); checkConfig(); }, []); // manual «فحص الآن» only — no polling

  const down = (probes ?? []).filter((p) => p.state !== "ok");
  const cloudDown = down.some((p) => ["database", "auth", "storage"].includes(p.key));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold">حالة النظام</h2>
          <p className="text-xs text-muted-foreground">
            {checkedAt ? `آخر فحص: ${new Date(checkedAt).toLocaleString("ar")}` : "جارِ الفحص..."}
          </p>
        </div>
        <button onClick={() => { check(); checkConfig(); }} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> فحص الآن
        </button>
      </div>

      {probes && (
        <div className={`rounded-2xl border p-4 text-sm font-bold ${down.length ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-card"}`}>
          {down.length ? `يوجد ${down.length} خدمة متوقفة أو غير مستجيبة` : "كل الخدمات تعمل بشكل طبيعي ✅"}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {Object.entries(META).map(([key, m]) => {
          const p = probes?.find((x) => x.key === key);
          const Icon = !p ? HelpCircle : p.state === "ok" ? CheckCircle2 : p.state === "down" ? XCircle : HelpCircle;
          const tone = !p ? "text-muted-foreground" : p.state === "ok" ? "text-primary" : "text-destructive";
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Icon className={`size-5 ${tone}`} />
                <div className="font-bold">{m.label}</div>
                <span className={`ms-auto text-xs font-bold ${tone}`}>
                  {!p ? "..." : p.state === "ok" ? `تعمل${p.ms != null ? ` (${p.ms}ms)` : ""}` : p.state === "down" ? "متوقفة" : "غير معروف"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">يؤثر على: {m.affects}</div>
              {p?.detail && <div className="text-[11px] text-destructive mt-1">{p.detail}</div>}
            </div>
          );
        })}
      </div>

      {down.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm space-y-3">
          <div className="font-extrabold">إرشادات الاستئناف</div>
          {cloudDown && (
            <ol className="list-decimal ps-5 space-y-1">
              <li>افتح مشروع التطبيق في Lovable ثم قسم <b>Cloud</b>.</li>
              <li>إذا ظهر أن السحابة متوقفة بسبب نفاد الرصيد: أضف رصيداً أو رقِّ الخطة من إعدادات مساحة العمل (Usage / Plans).</li>
              <li>اضغط <b>Resume</b> لاستئناف السحابة، وانتظر دقيقتين حتى تكتمل العودة.</li>
              <li>ارجع لهذه الصفحة واضغط «فحص الآن» للتأكد.</li>
              <li>الملفات التي لم تُرسل إلى تلجرام أثناء التوقف تُعاد تلقائياً من الطابور خلال 10 دقائق.</li>
            </ol>
          )}
          {down.some((p) => p.key === "telegram") && (
            <p>بوت تلجرام لا يستجيب: تأكد من صلاحية مفتاح البوت وأن البوت ما زال عضواً في الجروب، ثم أعد الفحص.</p>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-extrabold">فحص إعدادات التشغيل</div>
          {config && (() => {
            const missingReq = config.filter((c) => c.required && !c.valid).length;
            return <span className={`text-xs font-bold ${missingReq ? "text-destructive" : "text-primary"}`}>
              {missingReq ? `${missingReq} إعداد أساسي ناقص أو غير صحيح` : "كل الإعدادات الأساسية مضبوطة ✅"}
            </span>;
          })()}
        </div>
        <p className="text-xs text-muted-foreground">يعرض فقط هل الإعداد موجود وصحيح الشكل — لا تُعرض أي قيمة سرية.</p>
        {configErr && <p className="text-xs text-destructive">تعذر الوصول إلى خادم التطبيق لفحص الإعدادات.</p>}
        {!config && !configErr && <p className="text-xs text-muted-foreground">جارِ الفحص...</p>}
        {config && (
          <div className="divide-y divide-border">
            {config.map((c) => {
              const st = c.valid ? "مضبوط" : c.present ? "شكل غير صحيح" : "غير موجود";
              const tone = c.valid ? "text-primary" : c.required ? "text-destructive" : "text-muted-foreground";
              const Icon = c.valid ? CheckCircle2 : c.required ? XCircle : HelpCircle;
              return (
                <div key={c.name} className="py-2 flex items-start gap-2 text-sm">
                  <Icon className={`size-4 mt-0.5 shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs break-all" dir="ltr">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.required ? "أساسي" : "اختياري"} — يؤثر على: {c.affects}</div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${tone}`}>{st}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
