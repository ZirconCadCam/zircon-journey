import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { hasTicket } from "@/lib/staff-tickets";
import { Sparkles, Lock } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const ADMIN_ALL_KEY = "zircon_admin_all";

// Clears every portal session key so the next password entry starts a fresh session.
export function clearAllPortalSessions() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("zircon_")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function LoginPage() {
  const nav = useNavigate();
  // Remembered sign-in on this device (30 days): go straight to the user's own page.
  useEffect(() => {
    if (localStorage.getItem(ADMIN_ALL_KEY) === "1" && hasTicket("admin")) {
      nav({ to: "/staff/$role", params: { role: "admin" }, replace: true }); return;
    }
    for (const role of ["technician", "designer"] as const) {
      if (localStorage.getItem(`zircon_staff_${role}`) === "1" && hasTicket(role)) {
        nav({ to: "/staff/$role", params: { role }, replace: true }); return;
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const m = /^zircon_doctor_(\d+)_authed$/.exec(localStorage.key(i) ?? "");
      if (m && hasTicket("doctor", Number(m[1]))) {
        nav({ to: "/doctors/$slot", params: { slot: m[1] }, replace: true }); return;
      }
    }
  }, [nav]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand side */}
      <div className="hidden lg:flex flex-col justify-between gradient-brown p-12 relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-3">
          <div className="size-12 rounded-xl gradient-gold grid place-items-center shadow-gold">
            <Sparkles className="size-6" />
          </div>
          <div>
            <div className="font-display font-bold text-xl text-primary-foreground">رحلة سن الزركون</div>
            <div className="text-xs text-primary-foreground/70">Zircon CAD CAM Center</div>
          </div>
        </div>
        <div className="relative z-10">
          <h2 className="font-display text-4xl font-extrabold text-primary-foreground leading-tight">
            دقة المختبر،<br />بأناقة الإدارة الرقمية.
          </h2>
          <p className="mt-4 text-primary-foreground/80 max-w-md">
            ادخل كلمة المرور المخصصة لك لتصل مباشرة إلى لوحتك دون أي خطوات إضافية.
          </p>
        </div>
        <div className="absolute -left-32 -bottom-32 size-96 rounded-full bg-gold/20 blur-3xl" />
        <div className="absolute -right-20 top-10 size-72 rounded-full bg-gold/10 blur-3xl" />
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← الرئيسية</Link>

          <div className="mt-4 size-16 rounded-full gradient-gold grid place-items-center shadow-gold">
            <Lock className="size-7 text-gold-foreground" />
          </div>

          <h1 className="mt-4 text-3xl font-bold">تسجيل الدخول</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            تم تعطيل تسجيل الدخول باستخدام كلمات المرور حاليًا.
          </p>

          <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5 text-center">
            <p className="text-sm font-semibold">الدخول غير متاح</p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              تواصل مع مسؤول النظام لتفعيل وسيلة دخول بديلة وآمنة.
            </p>
          </div>

          <p className="mt-6 text-[11px] text-muted-foreground text-center leading-relaxed">
            تم إيقاف التحقق من كلمات المرور من هذه الصفحة.
          </p>
        </div>
      </div>

      <style>{`
        .input { width:100%; border:1px solid var(--input); background:var(--card); border-radius:0.75rem; padding:0.75rem 1rem; outline:none; transition:.15s; }
        .input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px oklch(0.78 0.14 80 / 0.2); }
      `}</style>
    </div>
  );
}
