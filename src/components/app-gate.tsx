import { useEffect, useState } from "react";
import { Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import { unlockApp, checkAppGate } from "@/lib/app-gate.functions";

/** Kept outside the "zircon_" prefix so signing out of a page keeps the app open. */
const GATE_KEY = "zgate_token";

export function AppGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(GATE_KEY);
    if (!t) { setState("locked"); return; }
    checkAppGate({ data: { token: t } })
      .then((r) => { if (r.ok) setState("open"); else { localStorage.removeItem(GATE_KEY); setState("locked"); } })
      .catch(() => setState("open")); // offline: trust the stored token
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await unlockApp({ data: { password: pw } });
      if (!r.ok) { setErr(r.error); return; }
      localStorage.setItem(GATE_KEY, r.token);
      setState("open");
    } catch (e: any) { setErr(e?.message ?? "حدث خطأ"); } finally { setBusy(false); }
  }

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <div className="min-h-screen grid place-items-center text-muted-foreground">...</div>;

  return (
    <div className="min-h-screen grid place-items-center p-6 gradient-brown">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-card p-8 text-foreground shadow-luxury text-center space-y-4">
        <div className="mx-auto size-16 rounded-full gradient-gold grid place-items-center shadow-gold">
          <Sparkles className="size-7 text-gold-foreground" />
        </div>
        <h1 className="text-2xl font-bold">رحلة سن الزركون</h1>
        <p className="text-sm text-muted-foreground">أدخل كلمة مرور فتح التطبيق</p>
        <div className="relative">
          <input type={show ? "text" : "password"} autoFocus value={pw} dir="ltr"
            onChange={(e) => { setPw(e.target.value); setErr(""); }}
            className="w-full rounded-xl border border-input bg-background px-4 py-3 pl-11 text-center font-mono text-lg outline-none focus:border-gold"
            placeholder="••••••••" aria-label="كلمة مرور التطبيق" />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label="إظهار كلمة المرور"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
        {err && <div className="text-xs text-destructive">{err}</div>}
        <button type="submit" disabled={busy} className="w-full rounded-xl gradient-brown py-3 font-bold disabled:opacity-60 inline-flex items-center justify-center gap-2">
          <Lock className="size-4" /> {busy ? "..." : "فتح التطبيق"}
        </button>
      </form>
    </div>
  );
}
