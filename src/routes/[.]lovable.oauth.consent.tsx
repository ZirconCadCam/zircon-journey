import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [{ title: "ربط مساعد ذكي — Zircon Flow" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: ({ search }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
  },
  component: Consent,
});

function Consent() {
  const { authorization_id } = Route.useSearch();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setSignedIn(false); return; }
    setSignedIn(true);
    const res = await oauth().getAuthorizationDetails(authorization_id);
    if (res.error) { setError(res.error.message); return; }
    const immediate = res.data?.redirect_url ?? res.data?.redirect_to;
    if (immediate && !res.data?.client) { window.location.href = immediate; return; }
    setDetails(res.data);
  }
  useEffect(() => { load(); }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) { setError(error.message); return; }
    load();
  }

  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("لم يُرجع الخادم رابط العودة."); return; }
    window.location.href = target;
  }

  const name = details?.client?.name ?? details?.client?.client_name ?? "المساعد";

  return (
    <main dir="rtl" className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 space-y-4 shadow-luxury">
        {signedIn === null && <p className="text-muted-foreground">جارٍ التحميل…</p>}
        {signedIn === false && (
          <form onSubmit={signIn} className="space-y-3">
            <h1 className="text-xl font-bold">تسجيل دخول الإدارة</h1>
            <p className="text-sm text-muted-foreground">سجّل الدخول بحساب الإدارة للسماح للمساعد الذكي بقراءة الحالات.</p>
            <input className="w-full rounded-xl border bg-background p-3" dir="ltr" type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border bg-background p-3" dir="ltr" type="password" placeholder="••••••" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <button disabled={busy} className="w-full rounded-xl gradient-brown py-3 font-bold disabled:opacity-60">دخول</button>
          </form>
        )}
        {signedIn && details && (
          <>
            <h1 className="text-xl font-bold">ربط {name} بحسابك</h1>
            <p className="text-sm text-muted-foreground">سيتمكن {name} من قراءة حالات المختبر باسمك.</p>
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => decide(true)} className="flex-1 rounded-xl gradient-brown py-3 font-bold disabled:opacity-60">موافقة</button>
              <button disabled={busy} onClick={() => decide(false)} className="flex-1 rounded-xl border py-3 disabled:opacity-60">رفض</button>
            </div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
