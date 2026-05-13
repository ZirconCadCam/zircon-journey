import { useEffect, useState } from "react";
import { Download, X, Share, Plus } from "lucide-react";
import { Z } from "@/lib/z-index";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "zircon:install-dismissed-at";
const SNOOZE_DAYS = 7;

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIOS() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function recentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const ageMs = Date.now() - Number(v);
    return ageMs < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosFallback, setIosFallback] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || isInIframe() || recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);

    // iOS Safari: لا يدعم beforeinstallprompt — أظهر تعليمات يدوية بعد ثانيتين
    let t: ReturnType<typeof setTimeout> | null = null;
    if (isIOS()) {
      t = setTimeout(() => {
        setIosFallback(true);
        setShow(true);
      }, 2000);
    }

    const onInstalled = () => {
      setShow(false);
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") dismiss();
    setDeferred(null);
  }

  if (!show) return null;

  return (
    <div className={`fixed bottom-4 inset-x-4 sm:inset-x-auto sm:end-4 sm:max-w-sm ${Z.max}`}>
      <div className="rounded-2xl border border-gold/40 bg-card shadow-luxury p-4 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-start gap-3">
          <div className="size-11 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
            {iosFallback ? <Share className="size-5 text-gold-foreground" /> : <Download className="size-5 text-gold-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm">
              {iosFallback ? "أضف الموقع للشاشة الرئيسية" : "ثبّت التطبيق على جهازك"}
            </div>
            <div className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
              {iosFallback ? (
                <>
                  اضغط على زر المشاركة <Share className="inline size-3.5 mx-0.5" /> ثم اختر
                  <span className="font-bold"> "إضافة إلى الشاشة الرئيسية" </span>
                  <Plus className="inline size-3.5 mx-0.5" />
                </>
              ) : (
                "احصل على وصول سريع وتجربة كتطبيق أصلي على جهازك."
              )}
            </div>
            {!iosFallback && (
              <div className="flex items-center gap-2 mt-3">
                <button onClick={install}
                  className="rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold shadow-gold">
                  تثبيت الآن
                </button>
                <button onClick={dismiss}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-gold">
                  لاحقاً
                </button>
              </div>
            )}
          </div>
          <button onClick={dismiss} aria-label="إغلاق"
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground shrink-0">
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
