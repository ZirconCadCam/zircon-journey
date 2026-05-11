import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, STATUS_LABELS } from "@/hooks/use-auth";
import { DashboardShell, StatCard } from "@/components/dashboard-shell";
import { CaseCard, type CaseRow } from "@/components/case-card";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const nav = useNavigate();
  const { session, loading, role } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
  }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    const load = async () => {
      const { data } = await supabase.from("cases").select("*").order("created_at", { ascending: false }).limit(50);
      setCases((data as CaseRow[]) ?? []);
      setPending(false);
    };
    load();
    const ch = supabase.channel("cases-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  if (loading) return <div className="min-h-screen grid place-items-center">جارِ التحميل...</div>;
  if (!session) return null;

  if (!role) {
    return (
      <DashboardShell title="بانتظار تعيين الدور">
        <div className="rounded-2xl bg-card border border-border p-8 text-center max-w-lg mx-auto shadow-luxury">
          <div className="text-lg font-bold mb-2">حسابك بانتظار تفعيل الدور</div>
          <p className="text-sm text-muted-foreground">
            يرجى التواصل مع إدارة المركز لتعيين دورك (طبيب / مصمم / فني / سكرتارية).
          </p>
          <p className="text-xs text-muted-foreground mt-4 font-mono" dir="ltr">
            UID: {session.user.id}
          </p>
        </div>
      </DashboardShell>
    );
  }

  // Filter cases by status for stats
  const counts = {
    total: cases.length,
    new: cases.filter(c => c.status === "new").length,
    inProgress: cases.filter(c => ["designing","design_ready","milling"].includes(c.status)).length,
    ready: cases.filter(c => c.status === "ready").length,
  };

  // Role-specific filtering for visible list
  const visible = role === "secretary"
    ? cases.filter(c => ["ready","delivered"].includes(c.status))
    : role === "designer"
      ? cases.filter(c => ["new","designing","design_ready"].includes(c.status))
      : role === "technician"
        ? cases.filter(c => ["design_ready","milling","ready"].includes(c.status))
        : cases;

  return (
    <DashboardShell title={`لوحة ${ROLE_LABELS[role]}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="إجمالي الحالات" value={counts.total} />
        <StatCard label={STATUS_LABELS.new} value={counts.new} />
        <StatCard label="قيد التنفيذ" value={counts.inProgress} />
        <StatCard label={STATUS_LABELS.ready} value={counts.ready} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">الحالات</h2>
        {role === "doctor" && (
          <Link to="/cases/new" className="inline-flex items-center gap-2 rounded-xl gradient-brown px-4 py-2.5 font-bold shadow-luxury">
            <Plus className="size-4" /> حالة جديدة
          </Link>
        )}
      </div>

      {pending ? (
        <div className="text-center py-12 text-muted-foreground">جارِ التحميل...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          لا توجد حالات حالياً.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(c => <CaseCard key={c.id} c={c} />)}
        </div>
      )}
    </DashboardShell>
  );
}
