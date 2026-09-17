import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STAFF_PASSWORDS, ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { Sparkles, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

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
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // On mount, sign out of any active portal so the password drives the destination.
  useEffect(() => { clearAllPortalSessions(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const password = pw.trim();
    if (!password) return;
    setLoading(true);
    try {
      // Resolve current staff passwords (admin-managed in DB, fallback to defaults)
      const { data: secrets } = await supabase.rpc("list_staff_secrets");
      const pwMap: Record<string, string> = { ...STAFF_PASSWORDS };
      for (const r of (secrets ?? []) as { role: string; password: string }[]) {
        if (r.password) pwMap[r.role] = r.password;
      }

      // 1) Admin master password — full access everywhere
      if (password === pwMap.admin) {
        localStorage.setItem(ADMIN_ALL_KEY, "1");
        localStorage.setItem("zircon_staff_admin", "1");
        toast.success(`مرحبًا — ${ROLE_LABEL.admin}`);
        nav({ to: "/staff/$role", params: { role: "admin" } });
        return;
      }

      // 2) Staff passwords
      const staffMatch = (Object.entries(pwMap) as [Exclude<RoleKey, "doctor">, string][])
        .find(([, p]) => p === password);
      if (staffMatch) {
        const role = staffMatch[0];
        localStorage.setItem(`zircon_staff_${role}`, "1");
        toast.success(`مرحبًا — ${ROLE_LABEL[role]}`);
        nav({ to: "/staff/$role", params: { role } });
        return;
      }

      // 3) Doctor password — verified server-side (password never leaves the server)
      const { data, error } = await supabase.rpc("verify_doctor_login", {
        p_password: password,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (row && row.active) {
        localStorage.setItem(`zircon_doctor_${row.slot}_authed`, "1");
        toast.success(`مرحبًا ${row.name}`);
        nav({ to: "/doctors/$slot", params: { slot: String(row.slot) } });
        return;
      }
      if (row && !row.active) {
        setErr("هذه الخانة غير مفعّلة. تواصل مع الإدارة.");
        return;
      }

      setErr("كلمة المرور غير صحيحة");
    } catch (e: any) {
      setErr(e.message ?? "حدث خطأ");
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
            ادخل إلى لوحتك المخصصة بكلمة المرور الخاصة بك
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <div className="text-sm font-semibold mb-1.5">كلمة المرور</div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  autoFocus
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setErr(""); }}
                  required
                  className="input text-center font-mono text-lg pl-11"
                  placeholder="••••••••"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  title={showPw ? "إخفاء" : "إظهار"}
                >
                  {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </label>

            {err && <div className="text-xs text-destructive text-center">{err}</div>}

            <button type="submit" disabled={loading}
              className="w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury disabled:opacity-60">
              {loading ? "..." : "دخول"}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-muted-foreground text-center leading-relaxed">
            كل صفحة لها كلمة مرور خاصة. كلمة المرور تحدد صلاحياتك ووجهتك تلقائيًا.
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
