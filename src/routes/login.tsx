import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard" });
    });
  }, [nav]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب! يرجى انتظار تعيين دورك من المدير.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("مرحبًا بك");
      }
      nav({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

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
            تتبع كل حالة من اللحظة الأولى للسكان ثلاثي الأبعاد حتى تسليم التاج للمريض.
          </p>
        </div>
        <div className="absolute -left-32 -bottom-32 size-96 rounded-full bg-gold/20 blur-3xl" />
        <div className="absolute -right-20 top-10 size-72 rounded-full bg-gold/10 blur-3xl" />
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← الرئيسية</Link>
          <h1 className="mt-4 text-3xl font-bold">
            {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {mode === "signin" ? "ادخل إلى لوحتك المخصصة" : "سيقوم المدير بتعيين دورك بعد التسجيل"}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <Field label="الاسم الكامل">
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required
                  className="input" placeholder="د. محمد علي" />
              </Field>
            )}
            <Field label="البريد الإلكتروني">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="input" placeholder="you@clinic.com" dir="ltr" />
            </Field>
            <Field label="كلمة المرور">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                minLength={6} className="input" placeholder="••••••••" dir="ltr" />
            </Field>

            <button type="submit" disabled={loading}
              className="w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury disabled:opacity-60">
              {loading ? "..." : mode === "signin" ? "دخول" : "تسجيل"}
            </button>
          </form>

          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-6 w-full text-sm text-muted-foreground hover:text-gold">
            {mode === "signin" ? "ليس لديك حساب؟ سجّل الآن" : "لديك حساب؟ سجّل الدخول"}
          </button>
        </div>
      </div>

      <style>{`
        .input { width:100%; border:1px solid var(--input); background:var(--card); border-radius:0.75rem; padding:0.75rem 1rem; outline:none; transition:.15s; }
        .input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px oklch(0.78 0.14 80 / 0.2); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1.5">{label}</div>
      {children}
    </label>
  );
}
