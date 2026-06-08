import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatModule } from "@/components/chat-module";
import { DesignerCases } from "@/components/designer-cases";
import { CaseSearch } from "@/components/case-search";
import { DesignerArchive, DesignerDesignFiles, DesignerReports } from "@/components/designer-panels";
import { TechnicianReports, TechnicianDesignFiles } from "@/components/technician-panels";
import { AdminSettingsPanel } from "@/components/admin-settings-panel";
import { AdminVoiceListener } from "@/components/admin-voice-listener";

import { ROLE_LABEL, STAFF_PASSWORDS, type RoleKey } from "@/lib/chat";
import { getStage, deriveStageKey } from "@/lib/case-stages";
import { Sparkles, ArrowRight, Lock, Stethoscope, MessageSquare, ClipboardList, Settings, Archive, FileArchive, FileText, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/$role")({
  component: StaffPortal,
});

const VALID: RoleKey[] = ["designer", "technician", "secretary_sanaa", "secretary_ibb", "admin"];

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }

function StaffPortal() {
  const { role } = Route.useParams() as { role: RoleKey };
  const nav = useNavigate();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!VALID.includes(role)) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem("zircon_admin_all") === "1") { setAuthed(true); return; }
    if (localStorage.getItem(`zircon_staff_${role}`) === "1") setAuthed(true);
  }, [role]);

  if (!VALID.includes(role)) {
    return (
      <Shell>
        <div className="container mx-auto px-6 py-20 text-center">
          <div className="text-xl font-bold mb-2">دور غير معروف</div>
          <Link to="/" className="text-gold underline text-sm">العودة للرئيسية</Link>
        </div>
      </Shell>
    );
  }

  if (!authed) return <Gate role={role} onOk={() => {
    localStorage.setItem(`zircon_staff_${role}`, "1");
    setAuthed(true);
  }} />;

  return <Inner role={role} onLogout={() => {
    localStorage.removeItem(`zircon_staff_${role}`);
    nav({ to: "/" });
  }} />;
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">بوابة المسؤول</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zircon CAD CAM</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {right}
            <Link to="/" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
              <ArrowRight className="size-4" /> الرجوع
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function Gate({ role, onOk }: { role: RoleKey; onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === STAFF_PASSWORDS[role as Exclude<RoleKey, "doctor">]) onOk();
    else setErr("كلمة المرور غير صحيحة");
  }
  return (
    <Shell>
      <main className="container mx-auto px-6 py-16 grid place-items-center">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-card border border-border p-8 shadow-luxury">
          <div className="size-16 rounded-full gradient-gold grid place-items-center mx-auto shadow-gold">
            <Lock className="size-7 text-gold-foreground" />
          </div>
          <div className="text-center mt-4">
            <div className="text-xl font-bold">{ROLE_LABEL[role]}</div>
            <div className="text-xs text-muted-foreground mt-1">أدخل كلمة المرور للدخول إلى لوحة المحادثات</div>
          </div>
          <input type="password" autoFocus value={pw} onChange={e=>{setPw(e.target.value); setErr("");}}
            placeholder="كلمة المرور" className="mt-6 w-full rounded-xl border border-input bg-background px-4 py-3 text-center font-mono text-lg outline-none focus:border-gold" />
          {err && <div className="text-xs text-destructive mt-2 text-center">{err}</div>}
          <button type="submit" className="mt-4 w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury">دخول</button>
        </form>
      </main>
    </Shell>
  );
}

function Inner({ role, onLogout }: { role: RoleKey; onLogout: () => void }) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [unread, setUnread] = useState<Record<number, number>>({});
  // Default tab: roles with a case list land on "cases"; admin stays on "chat".
  const initialTab: "chat" | "cases" | "settings" = role === "admin" ? "chat" : "cases";
  const [tab, setTab] = useState<"chat" | "cases" | "settings" | "archive" | "designfiles" | "reports">(initialTab);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot");
      setDoctors(((data ?? []) as Doctor[]).filter(d => d.active));
    })();
  }, []);

  // unread badges per doctor
  useEffect(() => {
    if (doctors.length === 0) return;
    let active = true;
    const refresh = async () => {
      const { data: convs } = await supabase.from("chat_conversations").select("id,doctor_slot,participants");
      const mine = ((convs ?? []) as any[]).filter(c => c.participants.includes(role));
      if (mine.length === 0) { if (active) setUnread({}); return; }
      const ids = mine.map(c => c.id);
      const { data: msgs } = await supabase.from("chat_messages").select("conversation_id,sender,read_by")
        .in("conversation_id", ids).neq("sender", role);
      const map: Record<number, number> = {};
      for (const m of (msgs ?? []) as any[]) {
        if (((m.read_by ?? []) as string[]).includes(role)) continue;
        const c = mine.find(x => x.id === m.conversation_id);
        if (c) map[c.doctor_slot] = (map[c.doctor_slot] ?? 0) + 1;
      }
      if (active) setUnread(map);
    };
    refresh();
    const ch = supabase.channel(`staff-${role}-notif`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p: any) => {
        if (p.new.sender !== role) {
          toast(`رسالة جديدة في إحدى المحادثات`);
          refresh();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "slot_cases" }, (p: any) => {
        try {
          const oldStage = getStage(deriveStageKey(p.old ?? {})).label;
          const newStage = getStage(deriveStageKey(p.new ?? {})).label;
          if (oldStage !== newStage && p.new?.case_code) {
            toast(`🔔 ${p.new.case_code}: ${newStage}`, { duration: 5000 });
          }
        } catch { /* noop */ }
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [doctors.length, role]);

  return (
    <Shell right={
      <>
        {role === "admin" && (
          <Link to="/admin/archive" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition">
            أرشيف الإدارة
          </Link>
        )}
        <button onClick={onLogout} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition">
          خروج
        </button>
      </>
    }>
      <main className="container mx-auto px-4 sm:px-6 py-6">
        {role === "admin" && <AdminVoiceListener />}

        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl gradient-gold grid place-items-center shadow-gold">
              <MessageSquare className="size-7 text-gold-foreground" />
            </div>
            <div>
              <div className="text-xs opacity-80">بوابة المحادثات</div>
              <div className="text-2xl font-extrabold">{ROLE_LABEL[role]}</div>
              <div className="text-xs opacity-80 mt-1">إدارة المحادثات مع الأطباء وبقية الفريق</div>
            </div>
          </div>
        </div>


        {(role === "designer" || role === "technician" || role === "secretary_sanaa" || role === "secretary_ibb" || role === "admin") && (
          <div className="mt-6 inline-flex flex-wrap rounded-xl border border-border bg-card p-1 shadow-luxury">
            {role === "admin" && (
              <button onClick={() => setTab("chat")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "chat" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <MessageSquare className="size-4" /> المحادثات
              </button>
            )}
            {role !== "admin" && (
              <button onClick={() => setTab("cases")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "cases" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <ClipboardList className="size-4" /> الحالات
              </button>
            )}
            {role === "designer" && (
              <>
                <button onClick={() => setTab("archive")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "archive" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <Archive className="size-4" /> الأرشيف
                </button>
                <button onClick={() => setTab("designfiles")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "designfiles" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <FileArchive className="size-4" /> ملفات التصاميم
                </button>
                <button onClick={() => setTab("reports")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "reports" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <FileText className="size-4" /> الكشوفات
                </button>
              </>
            )}
            {role === "technician" && (
              <>
                <button onClick={() => setTab("reports")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "reports" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <FileText className="size-4" /> الكشوفات
                </button>
                <button onClick={() => setTab("designfiles")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "designfiles" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <FileArchive className="size-4" /> ملفات التصاميم
                </button>
              </>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("cases")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "cases" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <ClipboardList className="size-4" /> أرشيف الحالات
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("settings")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "settings" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Settings className="size-4" /> الإعدادات
              </button>
            )}
          </div>
        )}

        <div className="mt-6">
          {tab === "settings" && role === "admin" ? (
            <AdminSettingsPanel />
          ) : role === "designer" && tab === "archive" ? (
            <DesignerArchive />
          ) : role === "designer" && tab === "designfiles" ? (
            <DesignerDesignFiles />
          ) : role === "designer" && tab === "reports" ? (
            <DesignerReports />
          ) : role === "technician" && tab === "reports" ? (
            <TechnicianReports />
          ) : role === "technician" && tab === "designfiles" ? (
            <TechnicianDesignFiles />
          ) : (role === "designer" || role === "technician" || role === "secretary_sanaa" || role === "secretary_ibb" || role === "admin") && tab === "cases" ? (
            <DesignerCases actor={role as any} actorName={ROLE_LABEL[role]} />

          ) : (
            <div className="grid lg:grid-cols-[320px_1fr] gap-5">
              <aside className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
                <div className="p-4 border-b border-border font-bold text-sm flex items-center gap-2">
                  <Stethoscope className="size-4 text-gold" /> الأطباء
                </div>
                <ul className="divide-y divide-border max-h-[600px] overflow-y-auto">
                  {doctors.map(d => {
                    const u = unread[d.slot] ?? 0;
                    const on = selected?.slot === d.slot;
                    return (
                      <li key={d.slot}>
                        <button onClick={()=>setSelected(d)}
                          className={`w-full text-start p-4 flex items-center gap-3 transition ${on?"bg-gold/10 border-r-4 border-gold":"hover:bg-muted/40"}`}>
                          <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
                            <span className="font-extrabold text-gold-foreground">{d.name.replace(/^د\.\s*/, "").charAt(0)}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm truncate">{d.name}</div>
                            <div className="text-[11px] text-muted-foreground">{d.branch === "sanaa" ? "فرع صنعاء" : d.branch === "ibb" ? "فرع إب" : ""}</div>
                          </div>
                          {u > 0 && <span className="rounded-full gradient-gold text-[10px] font-bold px-1.5 min-w-[20px] h-[20px] grid place-items-center shadow-gold text-gold-foreground">{u}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              <section>
                {selected ? (
                  <ChatModule doctorSlot={selected.slot} doctorName={selected.name} me={role} myName={ROLE_LABEL[role]} />
                ) : (
                  <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
                    <MessageSquare className="size-10 mx-auto mb-3 opacity-40" />
                    اختر طبيباً من القائمة لعرض محادثاته.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </Shell>
  );
}
