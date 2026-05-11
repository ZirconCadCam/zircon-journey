import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, BRANCH_LABELS, type AppRole, type Branch } from "@/hooks/use-auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const nav = useNavigate();
  const { session, role, loading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && (!session || role !== "admin")) nav({ to: "/dashboard" });
  }, [loading, session, role, nav]);

  useEffect(() => { if (role === "admin") load(); }, [role]);

  async function load() {
    const { data: profs } = await supabase.from("profiles").select("id,full_name,phone").order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("user_id,role,branch");
    const map = new Map(roles?.map(r => [r.user_id, r]));
    setUsers((profs ?? []).map(p => ({ ...p, role: map.get(p.id)?.role, branch: map.get(p.id)?.branch })));
  }

  async function assign(uid: string, newRole: AppRole, newBranch: Branch | null) {
    await supabase.from("user_roles").delete().eq("user_id", uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: newRole, branch: newBranch });
    if (error) toast.error(error.message); else { toast.success("تم تحديث الدور"); load(); }
  }

  return (
    <DashboardShell title="إدارة المستخدمين والأدوار">
      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs font-bold">
            <tr>
              <th className="text-start p-3">المستخدم</th>
              <th className="text-start p-3">الدور الحالي</th>
              <th className="text-start p-3">تعيين دور</th>
              <th className="text-start p-3">الفرع</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <UserRow key={u.id} u={u} onAssign={assign} />
            ))}
            {users.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground p-8">لا يوجد مستخدمون.</td></tr>}
          </tbody>
        </table>
      </div>
    </DashboardShell>
  );
}

function UserRow({ u, onAssign }: any) {
  const [r, setR] = useState<AppRole>(u.role ?? "doctor");
  const [b, setB] = useState<Branch | "">(u.branch ?? "");
  return (
    <tr className="border-t border-border">
      <td className="p-3">
        <div className="font-semibold">{u.full_name || "—"}</div>
        <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">{u.id.slice(0,8)}</div>
      </td>
      <td className="p-3">
        {u.role
          ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{ROLE_LABELS[u.role as AppRole]}{u.branch?` • ${BRANCH_LABELS[u.branch as Branch]}`:""}</span>
          : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="p-3">
        <select value={r} onChange={e=>setR(e.target.value as AppRole)} className="rounded-lg border border-input bg-background px-2 py-1 text-xs">
          {(Object.keys(ROLE_LABELS) as AppRole[]).map(k => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
        </select>
      </td>
      <td className="p-3 flex items-center gap-2">
        <select value={b} onChange={e=>setB(e.target.value as Branch | "")} className="rounded-lg border border-input bg-background px-2 py-1 text-xs">
          <option value="">— لا يوجد —</option>
          <option value="sanaa">{BRANCH_LABELS.sanaa}</option>
          <option value="ibb">{BRANCH_LABELS.ibb}</option>
        </select>
        <button onClick={() => onAssign(u.id, r, b || null)} className="rounded-lg gradient-brown px-3 py-1 text-xs font-bold">حفظ</button>
      </td>
    </tr>
  );
}
