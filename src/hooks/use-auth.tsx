import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "doctor" | "designer" | "technician" | "secretary";
export type Branch = "sanaa" | "ibb";

export interface AuthState {
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  branch: Branch | null;
  fullName: string;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id);
      else { setRole(null); setBranch(null); setFullName(""); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    const [{ data: roleRow }, { data: prof }] = await Promise.all([
      supabase.from("user_roles").select("role,branch").eq("user_id", uid).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? null);
    setBranch((roleRow?.branch as Branch) ?? null);
    setFullName(prof?.full_name ?? "");
    setLoading(false);
  }

  return { session, loading, role, branch, fullName };
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "المدير العام",
  doctor: "طبيب",
  designer: "مصمم CAD/CAM",
  technician: "فني المختبر",
  secretary: "سكرتارية",
};
export const BRANCH_LABELS: Record<Branch, string> = {
  sanaa: "فرع صنعاء",
  ibb: "فرع إب",
};
export const STATUS_LABELS: Record<string, string> = {
  new: "جديدة",
  designing: "قيد التصميم",
  design_ready: "تم التصميم",
  milling: "قيد النحت",
  ready: "جاهزة للتسليم",
  delivered: "تم التسليم",
  archived: "مؤرشفة",
};
export const STATUS_PROGRESS: Record<string, number> = {
  new: 15,
  designing: 35,
  design_ready: 55,
  milling: 75,
  ready: 90,
  delivered: 100,
  archived: 100,
};
