import { useEffect, useState } from "react";
import { HardDrive, FolderOpen, X, ShieldCheck, FileDown, Loader2 } from "lucide-react";
import { Z } from "@/lib/z-index";
import { toast } from "sonner";
import {
  getCenterFolderStatus,
  requestCenterPermission,
  CENTER_FOLDER_NAME,
  type CenterStatus,
} from "@/lib/file-manager";

/**
 * Professional storage-access prompt.
 *
 * On first run (and whenever the device folder isn't linked / permission was
 * revoked) it surfaces a polished popup asking the user to enable read/write
 * access so every uploaded or downloaded file is stored — neatly organised —
 * inside the «مركز زركون CAD/CAM» folder of the device file manager.
 *
 * Shows on web (File System Access API) and on the native Android shell.
 * Stays silent when the folder is already linked or the browser is unsupported.
 */

const SNOOZE_KEY = "zircon:storage-prompt-dismissed-at";
const SNOOZE_DAYS = 3;

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function recentlySnoozed() {
  try {
    const v = localStorage.getItem(SNOOZE_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function StoragePermissionPrompt() {
  const [status, setStatus] = useState<CenterStatus | null>(null);
  const [show, setShow] = useState(false);
  const [granting, setGranting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInIframe() || recentlySnoozed()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const st = await getCenterFolderStatus();
      if (cancelled) return;
      setStatus(st);
      // Only nudge when supported but not yet linked / permission revoked.
      if (st === "none" || st === "denied") setShow(true);
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  function snooze() {
    setShow(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  async function grant() {
    setGranting(true);
    try {
      const ok = await requestCenterPermission();
      if (ok) {
        toast.success("تم تمكين التخزين على الجهاز بنجاح");
        try {
          localStorage.removeItem(SNOOZE_KEY);
        } catch {
          /* ignore */
        }
        setShow(false);
      } else {
        toast.error("لم يتم منح الإذن. يمكنك المحاولة لاحقاً من الإعدادات");
      }
    } finally {
      setGranting(false);
    }
  }

  if (!show) return null;

  const denied = status === "denied";

  return (
    <div className={`fixed inset-0 ${Z.overlay} flex items-center justify-center p-4`}>
      <button
        aria-label="إغلاق"
        onClick={snooze}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md rounded-3xl border border-gold/40 bg-card shadow-luxury animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        <div className="gradient-brown text-primary-foreground p-6 flex items-center gap-4">
          <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold shrink-0">
            <HardDrive className="size-7 text-gold-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-tight">
              {denied ? "إعادة تمكين التخزين على الجهاز" : "تمكين التخزين المنظّم على الجهاز"}
            </div>
            <div className="text-xs opacity-80 mt-1 leading-relaxed">
              نظام احترافي لحفظ كل الملفات والبيانات داخل مدير ملفات جهازك
            </div>
          </div>
          <button
            onClick={snooze}
            aria-label="إغلاق"
            className="absolute top-3 left-3 rounded-lg p-1 text-primary-foreground/70 hover:text-primary-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {denied ? (
              <>
                صلاحية الوصول إلى مجلد «{CENTER_FOLDER_NAME}» غير ممنوحة حالياً. أعد تمكين
                الإذن ليستمر حفظ الملفات المرفوعة والمنزّلة بشكل منظّم على جهازك.
              </>
            ) : (
              <>
                للحصول على تجربة احترافية، يحفظ التطبيق كل ملف يتم رفعه أو تنزيله — تلقائياً —
                داخل مجلد «{CENTER_FOLDER_NAME}» على جهازك، مرتّباً حسب الطبيب والمريض والحالة.
                يتطلب ذلك السماح بالقراءة والكتابة على مدير الملفات.
              </>
            )}
          </p>

          <ul className="space-y-2.5">
            <FeatureRow
              icon={<FolderOpen className="size-4" />}
              text="تنظيم تلقائي: مجلدات حسب الطبيب / المريض / الحالة"
            />
            <FeatureRow
              icon={<FileDown className="size-4" />}
              text="فتح الملفات بسرعة دون استهلاك بيانات إضافية"
            />
            <FeatureRow
              icon={<ShieldCheck className="size-4" />}
              text="تبقى ملفاتك على جهازك وتحت سيطرتك بالكامل"
            />
          </ul>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={grant}
              disabled={granting}
              className="flex-1 rounded-xl gradient-gold text-gold-foreground py-2.5 font-bold shadow-gold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {granting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderOpen className="size-4" />
              )}
              {granting ? "جارٍ التمكين..." : denied ? "إعادة منح الإذن" : "تمكين التخزين الآن"}
            </button>
            <button
              onClick={snooze}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:border-gold"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="size-8 rounded-lg bg-gold/10 text-gold grid place-items-center shrink-0">
        {icon}
      </span>
      <span className="text-foreground/90">{text}</span>
    </li>
  );
}
