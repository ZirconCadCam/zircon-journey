import { useEffect, useState } from "react";
import { getSystemStatus, type Probe } from "@/lib/system-status.functions";
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
  useEffect(() => { check(); }, []); // manual «فحص الآن» only — no polling

  const down = (probes ?? []).filter((p) => p.state !== "ok");
  const cloudDown = down.some((p) => ["database", "auth", "storage"].includes(p.key));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold">حالة النظام</h2>
          <p className="text-xs text-muted-foreground">
            {checkedAt ? `آخر فحص: ${new Date(checkedAt).toLocaleString("ar")}` : "جارِ الفحص..."} — يتحدث تلقائياً كل دقيقة
          </p>
        </div>
        <button onClick={check} disabled={busy}
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
    </div>
  );
}
