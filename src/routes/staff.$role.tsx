import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatModule } from "@/components/chat-module";
import { DesignerCases } from "@/components/designer-cases";
import { CaseSearch } from "@/components/case-search";
import { DesignerReports } from "@/components/designer-panels";
import { TechnicianReports, TechnicianReadyZircon } from "@/components/technician-panels";
import { AdminSettingsPanel } from "@/components/admin-settings-panel";
import { AdminArchiveApprovals } from "@/components/admin-archive-approvals";
import { AdminOverdueCompletion } from "@/components/admin-overdue-completion";
import { AdminAccountingPanel } from "@/components/admin-accounting-panel";
import { AdminAccountingReport } from "@/components/admin-accounting-report";
import { AdminSystemStatus } from "@/components/admin-system-status";
import { AdminTrashPanel } from "@/components/admin-trash-panel";
import { AdminVoiceListener } from "@/components/admin-voice-listener";
import { ToolGate } from "@/components/tool-gate";
import { Gauge, Receipt, Trash2, Send } from "lucide-react";
import { RoleNotifications } from "@/components/role-notifications";
import { NotificationSettings } from "@/components/notification-settings";
import { DoctorAvatar } from "@/components/doctor-avatar";


import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { signInWithPassword, validateStaffSession } from "@/lib/staff-auth.functions";
import { saveTicket, hasTicket, clearTicket, markSignedIn } from "@/lib/staff-tickets";
import { saveStaffSession, hasValidStaffSession, clearStaffSession } from "@/lib/staff-session";
import { getStage, deriveStageKey } from "@/lib/case-stages";
import { Sparkles, ArrowRight, Lock, Stethoscope, MessageSquare, ClipboardList, Settings, Archive, FileArchive, FileText, Search, Bell, BellRing, Camera, RefreshCw, Timer, MonitorSmartphone, Eye, EyeOff, Calculator, FileSpreadsheet, PackageCheck, Activity } from "lucide-react";
import { DesignerFollowupPanel } from "@/components/designer-followup-panel";
import { useNewRevisionRounds } from "@/lib/revision-round-alerts";
import { toast } from "sonner";
import { sdb } from "@/lib/secure-db";
import { rt } from "@/lib/realtime-shim";

export const Route = createFileRoute("/staff/$role")({
  head: () => ({ meta: [
    { title: "بوابة الفريق — مركز زركون CAD CAM" },
    { name: "description", content: "بوابة العمل الآمنة للمصمم والفني وإدارة مركز زركون." },
    { property: "og:title", content: "بوابة الفريق — مركز زركون CAD CAM" },
    { property: "og:description", content: "دخول فريق مركز زركون إلى صفحات العمل المخصصة." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: StaffPortal,
});

const VALID: RoleKey[] = ["designer", "technician", "admin"]; // secretary pages removed

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }

function StaffPortal() {
  const { role } = Route.useParams() as { role: RoleKey };
  const nav = useNavigate();
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAuthed(false);
    if (!VALID.includes(role)) return;
    void validateStaffSession({ data: { role: role as "admin" | "designer" | "technician" } }).then(({ ok }) => {
      if (!cancelled) setAuthed(ok);
    }).catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
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

  if (!authed) return <Gate role={role} onOk={async () => {
    localStorage.setItem(`zircon_staff_${role}`, "1");
    // Persist a durable session so reopening the app does not ask again.
    saveStaffSession(role);
    setAuthed(true);
  }} />;

  return <Inner role={role} onLogout={async () => {
    localStorage.removeItem(`zircon_staff_${role}`);
    clearStaffSession(role);
    clearTicket(role);
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
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setErr("");
    try {
      const res = await signInWithPassword({ data: { password: pw, role: role as "admin" | "designer" | "technician" } });
      if (res.ok) { saveTicket(res.role, null, res.ticket); markSignedIn(); onOk(); }
      else setErr(res.error);
    } catch { setErr("تعذر التحقق، حاول مجددًا"); }
    finally { setChecking(false); }
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
          <div className="relative mt-6">
            <input type={showPw ? "text" : "password"} autoFocus value={pw} onChange={e=>{setPw(e.target.value); setErr("");}}
              placeholder="كلمة المرور" className="w-full rounded-xl border border-input bg-background px-4 py-3 pl-11 text-center font-mono text-lg outline-none focus:border-gold" />
            <button type="button" onClick={() => setShowPw(v=>!v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} title={showPw ? "إخفاء" : "إظهار"}>
              {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {err && <div className="text-xs text-destructive mt-2 text-center">{err}</div>}
          <button type="submit" disabled={checking} className="mt-4 w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury disabled:opacity-60">{checking ? "جارٍ التحقق…" : "دخول"}</button>
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
  const initialTab: "chat" | "cases" | "settings" = "cases";
  const [tab, setTab] = useState<"chat" | "cases" | "settings" | "archive" | "designfiles" | "reports" | "search" | "notify" | "photos" | "followup" | "archiveapprovals" | "overdue" | "devices" | "accounts" | "accreport" | "readyzircon" | "status" | "trash">(initialTab);
  const { count: newRounds, clear: clearRounds } = useNewRevisionRounds(role === "technician" ? "technician" : "designer");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot");
      setDoctors(((data ?? []) as Doctor[]).filter(d => d.active));
    })();
  }, []);

  // unread badges per doctor
  useEffect(() => {
    if (doctors.length === 0 || role === "admin") return;
    let active = true;
    const refresh = async () => {
      const { data: convs } = await sdb.from("chat_conversations").select("id,doctor_slot,participants");
      const mine = ((convs ?? []) as any[]).filter(c => c.participants.includes(role));
      if (mine.length === 0) { if (active) setUnread({}); return; }
      const ids = mine.map(c => c.id);
      const { data: msgs } = await sdb.from("chat_messages").select("conversation_id,sender,read_by")
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
    const ch = rt.channel(`staff-${role}-notif`)
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
    return () => { active = false; rt.removeChannel(ch); };
  }, [doctors.length, role]);

  return (
    <Shell right={
      <>
        {(role === "designer" || role === "technician") ? (
          <Link to="/help/$role" params={{ role }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition">
            دليل الاستخدام
          </Link>
        ) : (
          <Link to="/help"
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition">
            دليل الاستخدام
          </Link>
        )}
        <button onClick={onLogout} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition">
          خروج
        </button>
      </>
    }>
      <main className="container mx-auto px-4 sm:px-6 py-6">
        {role === "admin" && <ToolGate id="voice"><AdminVoiceListener /></ToolGate>}
        {(role === "designer" ||
          role === "technician" ||
          role === "secretary_sanaa" ||
          role === "secretary_ibb" ||
          role === "admin") && <ToolGate id="notifications"><RoleNotifications role={role} /></ToolGate>}


        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {(role === "designer" || role === "technician") ? (
              <DoctorAvatar
                name={ROLE_LABEL[role]}
                roleKey={role}
                className="size-16"
                rounded="2xl"
              />
            ) : (
              <div className="size-16 rounded-2xl gradient-gold grid place-items-center shadow-gold">
                <MessageSquare className="size-7 text-gold-foreground" />
              </div>
            )}
            <div>
              <div className="text-xs opacity-80">بوابة المحادثات</div>
              <div className="text-2xl font-extrabold">{ROLE_LABEL[role]}</div>
              <div className="text-xs opacity-80 mt-1">إدارة المحادثات مع الأطباء وبقية الفريق</div>
            </div>
          </div>
        </div>


        {(role === "designer" || role === "technician" || role === "secretary_sanaa" || role === "secretary_ibb" || role === "admin") && (
          <div className="mt-6 inline-flex flex-wrap rounded-xl border border-border bg-card p-1 shadow-luxury">
            <button onClick={() => setTab("search")}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "search" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
              <Search className="size-4" /> بحث
            </button>
            {role !== "admin" && (
              <button onClick={() => setTab("cases")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "cases" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <ClipboardList className="size-4" /> الحالات
              </button>
            )}
            {role === "designer" && (
              <>
                <button onClick={() => setTab("reports")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "reports" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <FileText className="size-4" /> الكشوفات
                </button>
                <button onClick={() => setTab("followup")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "followup" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <RefreshCw className="size-4" /> متابعة
                </button>
              </>
            )}
            {role === "technician" && (
              <>
                <button onClick={() => setTab("readyzircon")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "readyzircon" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <PackageCheck className="size-4" /> الزركون الجاهز
                </button>
                <button onClick={() => setTab("reports")}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "reports" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <FileText className="size-4" /> الكشوفات
                </button>

                <button onClick={() => { setTab("followup"); clearRounds(); }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "followup" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <RefreshCw className="size-4" /> متابعة
                  {newRounds > 0 && (
                    <span className="rounded-full bg-red-500 text-white text-[10px] font-extrabold px-1.5 min-w-[18px] h-[18px] grid place-items-center animate-pulse">{newRounds}</span>
                  )}
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
              <button onClick={() => setTab("reports")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "reports" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <FileText className="size-4" /> الكشوفات
              </button>
            )}
            {(role === "secretary_sanaa" || role === "secretary_ibb") && (
              <button onClick={() => setTab("photos")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "photos" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Camera className="size-4" /> صور المرضى
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("archiveapprovals")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "archiveapprovals" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <BellRing className="size-4" /> إشعارات الأرشفة
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("status")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "status" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Activity className="size-4" /> حالة النظام
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("overdue")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "overdue" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Timer className="size-4" /> إكمال المتأخرة
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("accounts")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "accounts" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Calculator className="size-4" /> الحسابات
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("accreport")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "accreport" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <FileSpreadsheet className="size-4" /> تقرير الحسابات
              </button>
            )}

            {role === "admin" && (
              <Link to="/admin/usage"
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition hover:bg-muted/40">
                <Gauge className="size-4" /> تفاصيل الاستهلاك
              </Link>
            )}
            {role === "admin" && (
              <Link to="/admin/pages"
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition hover:bg-muted/40">
                <ClipboardList className="size-4" /> صفحات التطبيق
              </Link>
            )}
            {role === "admin" && (
              <Link to="/admin/telegram"
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition hover:bg-muted/40">
                <Send className="size-4" /> المتعذر إرسالها للتلجرام
              </Link>
            )}
            {role === "admin" && (
              <Link to="/admin/expenses"
                className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition hover:bg-muted/40">
                <Receipt className="size-4" /> المصروفات
              </Link>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("trash")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "trash" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Trash2 className="size-4" /> سلة المهملات
              </button>
            )}
            {role === "admin" && (
              <button onClick={() => setTab("settings")}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "settings" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                <Settings className="size-4" /> الإعدادات
              </button>
            )}

            <button onClick={() => setTab("notify")}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition ${tab === "notify" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
              <Bell className="size-4" /> الإشعارات
            </button>
          </div>
        )}


        <div className="mt-6">
          {tab === "notify" ? (
            <NotificationSettings />
          ) : tab === "archiveapprovals" && role === "admin" ? (
            <AdminArchiveApprovals />
          ) : tab === "status" && role === "admin" ? (
            <AdminSystemStatus />
          ) : tab === "trash" && role === "admin" ? (
            <AdminTrashPanel />
          ) : tab === "overdue" && role === "admin" ? (
            <AdminOverdueCompletion />
          ) : tab === "accounts" && role === "admin" ? (
            <AdminAccountingPanel />
          ) : tab === "accreport" && role === "admin" ? (
            <AdminAccountingReport />

          ) : tab === "settings" && role === "admin" ? (

            <AdminSettingsPanel />
          ) : role === "designer" && tab === "followup" ? (
            <DesignerFollowupPanel />
          ) : role === "designer" && tab === "reports" ? (
            <DesignerReports />
          ) : role === "technician" && tab === "followup" ? (
            <DesignerFollowupPanel scope="technician" />
          ) : role === "technician" && tab === "readyzircon" ? (
            <TechnicianReadyZircon />
          ) : role === "technician" && tab === "reports" ? (
            <TechnicianReports />
          ) : role === "admin" && tab === "reports" ? (
            <div className="space-y-8">
              <div>
                <div className="mb-3 text-sm font-extrabold flex items-center gap-2">
                  <FileText className="size-4 text-gold" /> كشوفات التصميم
                </div>
                <DesignerReports />
              </div>
              <div>
                <div className="mb-3 text-sm font-extrabold flex items-center gap-2">
                  <FileText className="size-4 text-gold" /> كشوفات الفني
                </div>
                <TechnicianReports />
              </div>
            </div>
          ) : (role === "designer" || role === "technician" || role === "secretary_sanaa" || role === "secretary_ibb" || role === "admin") && tab === "search" ? (
            <CaseSearch actor={role as any} />
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
                          <DoctorAvatar name={d.name} className="size-10" rounded="xl" />
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
