import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, BRANCH_LABELS, useAuth } from "@/hooks/use-auth";
import { Sparkles, LogOut, Bell } from "lucide-react";
import { useEffect, useState } from "react";

export function DashboardShell({ title, children }: { title: string; children: React.ReactNode }) {
  const nav = useNavigate();
  const { fullName, role, branch, session } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!session) return;
    const load = () =>
      supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id).eq("read", false)
        .then(({ count }) => setUnread(count ?? 0));
    load();
    const ch = supabase.channel("notif-" + session.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">رحلة سن الزركون</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zircon CAD CAM Center</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden md:block text-end">
              <div className="text-sm font-bold">{fullName || "مستخدم"}</div>
              <div className="text-[11px] text-muted-foreground">
                {role ? ROLE_LABELS[role] : "بانتظار تعيين الدور"}
                {branch ? ` • ${BRANCH_LABELS[branch]}` : ""}
              </div>
            </div>
            <button className="relative rounded-lg border border-border bg-card p-2.5 hover:bg-muted">
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 size-5 rounded-full gradient-gold text-[10px] font-bold grid place-items-center shadow-gold">
                  {unread}
                </span>
              )}
            </button>
            <button onClick={logout} className="rounded-lg border border-border bg-card p-2.5 hover:bg-destructive hover:text-destructive-foreground transition">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 hover:shadow-luxury transition">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-extrabold text-gold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
      <div className="h-full gradient-gold rounded-full transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}
