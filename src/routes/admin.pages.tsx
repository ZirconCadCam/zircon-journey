import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, LayoutGrid, Stethoscope, PenTool, Wrench, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hasValidStaffSession, saveStaffSession } from "@/lib/staff-session";

export const Route = createFileRoute("/admin/pages")({
  head: () => ({
    meta: [
      { title: "صفحات التطبيق — مركز زركون" },
      { name: "description", content: "دخول الإدارة إلى صفحات الأطباء والمصمم والفني لإدارة الكشوفات والمتابعة." },
      { property: "og:title", content: "صفحات التطبيق — مركز زركون" },
      { property: "og:description", content: "وصول الإدارة المباشر لصفحات الأطباء والمصمم والفني." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagesHub,
});

interface Doc { slot: number; name: string; branch: string | null; active: boolean }

function PagesHub() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [doctors, setDoctors] = useState<Doc[]>([]);

  useEffect(() => {
    if (!hasValidStaffSession("admin")) { nav({ to: "/staff/$role", params: { role: "admin" } }); return; }
    setReady(true);
    supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot")
      .then(({ data }) => setDoctors(((data ?? []) as Doc[]).filter((d) => d.active)));
  }, [nav]);

  /** Grant this admin device direct entry, skipping each page's own password. */
  function enterAsAdmin(role?: string) {
    localStorage.setItem("zircon_admin_all", "1");
    if (role) { saveStaffSession(role); localStorage.setItem(`zircon_staff_${role}`, "1"); }
  }

  if (!ready) return null;
  const card = "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-luxury hover:border-gold transition";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/staff/$role" params={{ role: "admin" }} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" /> الإدارة
        </Link>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><LayoutGrid className="size-6 text-gold" /> صفحات التطبيق</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        ادخل أي صفحة بصلاحية الإدارة. داخل «الكشوفات» و«المتابعة» يظهر زر «تحديد» للحذف والإرسال للتلجرام والتعديل والأرشفة.
      </p>

      <section className="space-y-3">
        <h2 className="font-extrabold text-sm">الفريق</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link to="/staff/$role" params={{ role: "designer" }} onClick={() => enterAsAdmin("designer")} className={card}>
            <PenTool className="size-6 text-gold" /><div className="flex-1 font-bold">صفحة المصمم</div><ExternalLink className="size-4 opacity-60" />
          </Link>
          <Link to="/staff/$role" params={{ role: "technician" }} onClick={() => enterAsAdmin("technician")} className={card}>
            <Wrench className="size-6 text-gold" /><div className="flex-1 font-bold">صفحة الفني</div><ExternalLink className="size-4 opacity-60" />
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-extrabold text-sm">الأطباء ({doctors.length})</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {doctors.map((d) => (
            <Link key={d.slot} to="/doctors/$slot" params={{ slot: String(d.slot) }} onClick={() => enterAsAdmin()} className={card}>
              <Stethoscope className="size-6 text-gold" />
              <div className="flex-1">
                <div className="font-bold">{d.name}</div>
                <div className="text-[11px] text-muted-foreground">{d.branch === "ibb" ? "فرع إب" : d.branch === "sanaa" ? "فرع صنعاء" : ""}</div>
              </div>
              <ExternalLink className="size-4 opacity-60" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
