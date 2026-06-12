import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bell, BellRing, BellOff, Phone, CheckCircle2, Volume2, Smartphone,
  ShieldAlert, Info, PartyPopper, Loader2,
} from "lucide-react";
import {
  ensureNotifyPermission,
  notificationPermissionState,
  unlockNotificationAudio,
  incomingAlert,
  systemMomentAlert,
  playPhoneRing,
  playSystemChime,
  stopRing,
} from "@/lib/notify";

type Perm = "granted" | "denied" | "default" | "unsupported";

/**
 * Self-service settings panel for managing notification permissions and
 * verifying that case-chat notifications actually fire on this device:
 * the 5-second landline ring, the device-shade notification, and the in-app
 * toast. Also explains why alerts may not appear when the app is closed.
 */
export function NotificationSettings() {
  const [perm, setPerm] = useState<Perm>("default");
  const [isNative, setIsNative] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setPerm(notificationPermissionState());
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        setIsNative(!!Capacitor?.isNativePlatform?.());
      } catch { /* web */ }
    })();
  }, []);

  async function enable() {
    setBusy("enable");
    unlockNotificationAudio();
    const ok = await ensureNotifyPermission();
    setPerm(ok ? "granted" : notificationPermissionState());
    setBusy(null);
    if (ok) toast.success("تم تفعيل الإشعارات على هذا الجهاز");
    else toast.error("لم يتم منح إذن الإشعارات");
  }

  async function testFull() {
    setBusy("full");
    unlockNotificationAudio();
    if (perm !== "granted") await ensureNotifyPermission();
    setPerm(notificationPermissionState());
    // The full incoming-message experience: 5s ring + device notification.
    incomingAlert({
      title: "📩 اختبار إشعار محادثة الحالة",
      body: "هذه رنّة تجريبية (٥ ثوانٍ) + إشعار الجهاز + تنبيه داخل التطبيق.",
    });
    toast("📩 اختبار إشعار محادثة الحالة", {
      description: "إذا سمعت الرنّة ورأيت هذا التنبيه فالإشعارات داخل التطبيق تعمل.",
      icon: <Phone className="size-4 text-gold" />,
      duration: 6000,
    });
    window.setTimeout(() => setBusy(null), 5200);
  }

  function testRingOnly() {
    unlockNotificationAudio();
    playPhoneRing(5000);
    toast("🔔 اختبار الرنّة (٥ ثوانٍ)", { duration: 5000 });
  }

  function testChime() {
    unlockNotificationAudio();
    playSystemChime();
    systemMomentAlert({
      title: "🟢 اختبار إشعار لحظة النظام",
      body: "نغمة مختلفة عن رنّة الرسائل — تُستخدم لحالات مثل جاهز / مكتمل.",
    });
    toast("🟢 اختبار لحظة نظام (Ready / Completed)", {
      description: "نغمة قصيرة مميّزة عن رنّة الرسائل.",
      icon: <CheckCircle2 className="size-4 text-emerald-500" />,
      duration: 5000,
      className: "border-emerald-500/40",
    });
  }

  const statusMeta: Record<Perm, { label: string; cls: string; icon: React.ReactNode }> = {
    granted: { label: "مُفعّلة", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40", icon: <BellRing className="size-4" /> },
    denied: { label: "مرفوضة", cls: "bg-destructive/15 text-destructive border-destructive/40", icon: <BellOff className="size-4" /> },
    default: { label: "بانتظار التفعيل", cls: "bg-amber-500/15 text-amber-600 border-amber-500/40", icon: <Bell className="size-4" /> },
    unsupported: { label: "غير مدعومة على هذا المتصفح", cls: "bg-muted text-muted-foreground border-border", icon: <ShieldAlert className="size-4" /> },
  };
  const sm = statusMeta[perm];

  return (
    <div className="space-y-5">
      {/* Status + enable */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-luxury">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
              <Bell className="size-5 text-gold-foreground" />
            </div>
            <div>
              <div className="font-bold">إعدادات الإشعارات</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                أذونات الإشعارات الصوتية والمرئية على هذا الجهاز
              </div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${sm.cls}`}>
            {sm.icon} {sm.label}
          </span>
        </div>

        {perm !== "granted" && perm !== "unsupported" && (
          <button
            onClick={enable}
            disabled={busy === "enable"}
            className="mt-4 inline-flex items-center gap-2 rounded-lg gradient-brown px-5 py-2.5 text-sm font-bold shadow-luxury disabled:opacity-60"
          >
            {busy === "enable" ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
            تفعيل إشعارات هذا الجهاز
          </button>
        )}
        {perm === "denied" && (
          <p className="mt-3 text-[11px] text-destructive font-medium">
            تم رفض الإذن سابقاً. لإعادة التفعيل: افتح إعدادات المتصفح/النظام لهذا الموقع أو التطبيق وامنح إذن الإشعارات يدوياً، ثم أعد فتح الصفحة.
          </p>
        )}
      </div>

      {/* Test panel (Task: verify case-chat notifications) */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-luxury">
        <div className="font-bold flex items-center gap-2 mb-1">
          <Volume2 className="size-4 text-gold" /> اختبار إشعارات محادثة الحالة
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          جرّب كل نوع للتأكد من عمل الرنّة (٥ ثوانٍ) وإشعار الجهاز والتنبيه داخل التطبيق على جهازك الحالي.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <button
            onClick={testFull}
            disabled={busy === "full"}
            className="flex flex-col items-start gap-1 rounded-xl border border-gold/40 bg-gold/10 p-4 text-start hover:border-gold transition disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2 font-bold text-sm">
              {busy === "full" ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4 text-gold" />}
              إشعار رسالة كامل
            </span>
            <span className="text-[11px] text-muted-foreground">رنّة ٥ ثوانٍ + إشعار الجهاز + تنبيه داخل التطبيق</span>
          </button>

          <button
            onClick={testRingOnly}
            className="flex flex-col items-start gap-1 rounded-xl border border-border bg-background p-4 text-start hover:border-gold transition"
          >
            <span className="inline-flex items-center gap-2 font-bold text-sm">
              <BellRing className="size-4 text-gold" /> الرنّة فقط
            </span>
            <span className="text-[11px] text-muted-foreground">رنّة هاتف ثابت لمدة ٥ ثوانٍ</span>
          </button>

          <button
            onClick={testChime}
            className="flex flex-col items-start gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-start hover:border-emerald-500 transition"
          >
            <span className="inline-flex items-center gap-2 font-bold text-sm">
              <PartyPopper className="size-4 text-emerald-500" /> لحظة نظام (Ready/Completed)
            </span>
            <span className="text-[11px] text-muted-foreground">نغمة مميّزة مختلفة عن رنّة الرسائل</span>
          </button>
        </div>
        <button
          onClick={() => { stopRing(); toast("تم إيقاف الرنّة"); }}
          className="mt-3 text-[11px] font-bold text-muted-foreground underline hover:text-foreground"
        >
          إيقاف الرنّة الآن
        </button>
      </div>

      {/* Why notifications may not appear outside the app */}
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
        <div className="font-bold flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-300">
          <Info className="size-4" /> لماذا قد لا تظهر التنبيهات خارج التطبيق؟
        </div>
        <ul className="space-y-2 text-[12px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          <li className="flex gap-2">
            <Smartphone className="size-4 shrink-0 mt-0.5" />
            <span><b>إغلاق التطبيق كلياً:</b> عند إغلاق التطبيق أو المتصفح تماماً قد تتوقف الرنّة الصوتية، لأن المتصفح يوقف تشغيل الصوت في الخلفية. يظل إشعار شريط الإشعارات يعمل في تطبيق الجوال المثبّت.</span>
          </li>
          <li className="flex gap-2">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <span><b>توفير البطارية:</b> أنظمة أندرويد/iOS قد تمنع التطبيقات في الخلفية. استثنِ التطبيق من تحسين/توفير البطارية لضمان وصول التنبيهات.</span>
          </li>
          <li className="flex gap-2">
            <Bell className="size-4 shrink-0 mt-0.5" />
            <span><b>تثبيت التطبيق:</b> للحصول على إشعارات تظهر في شاشة الجهاز، ثبّت التطبيق على الشاشة الرئيسية (Add to Home Screen / تثبيت التطبيق) وامنح إذن الإشعارات.</span>
          </li>
          <li className="flex gap-2">
            <BellOff className="size-4 shrink-0 mt-0.5" />
            <span><b>كتم الجهاز:</b> تأكّد أن الجهاز غير مكتوم وأن مستوى الصوت مرتفع، وأن وضع "عدم الإزعاج" غير مفعّل.</span>
          </li>
          <li className="flex gap-2">
            <Volume2 className="size-4 shrink-0 mt-0.5" />
            <span><b>أول تفاعل:</b> تتطلب المتصفحات تفاعلاً واحداً (لمسة/نقرة) قبل السماح بتشغيل الصوت — لذلك اضغط "تفعيل" أو أحد أزرار الاختبار مرة واحدة.</span>
          </li>
        </ul>
        {!isNative && (
          <div className="mt-3 text-[11px] text-amber-800/80 dark:text-amber-200/80">
            أنت تستخدم نسخة الويب. للحصول على أفضل تجربة إشعارات في شاشة الجهاز، استخدم تطبيق الجوال المثبّت.
          </div>
        )}
      </div>
    </div>
  );
}
