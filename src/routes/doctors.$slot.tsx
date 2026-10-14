import { ToolGate } from "@/components/tool-gate";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import { ChatModule } from "@/components/chat-module";
import { ROLE_LABEL as CHAT_LABEL, ROLE_COLOR as CHAT_COLOR, type RoleKey } from "@/lib/chat";
import {
  Sparkles, ArrowRight, Upload, FileText, Download, Archive,
  Trash2, Share2, MessageSquare, Files as FilesIcon, ArchiveRestore, Copy, Check, Search, Plus,
  ClipboardList, MoreHorizontal, Pencil, Pin, PinOff, Send, X, Loader2,
  Palette, Shield, Building2, FileSpreadsheet, Bell, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { DesignerFollowupPanel } from "@/components/designer-followup-panel";
import { useNewRevisionRounds } from "@/lib/revision-round-alerts";
import { toast } from "sonner";
import { STAGES, getStage, deriveStageKey, notifyRoleAboutCase, localNotify, type CaseStage } from "@/lib/case-stages";
import { CaseWorkflowControls } from "@/components/case-workflow-controls";
import { DoctorReportsPanel } from "@/components/doctor-reports-panel";
import { StageTick, type TickState } from "@/components/stage-tick";
import { CaseChatButton } from "@/components/case-chat-dialog";
import { Z } from "@/lib/z-index";
import { DOCTOR_PASSWORD_REQUIRED, getAppFlag } from "@/lib/app-flags";

import { ShadeBadge } from "@/components/shade-badge";
import { CaseSearch } from "@/components/case-search";
import { RoleNotifications } from "@/components/role-notifications";
import { NotificationSettings } from "@/components/notification-settings";
import { DoctorAvatar } from "@/components/doctor-avatar";

/** Compute WhatsApp-style tick state for each visible stage from case flags + timing. */
function stageTickState(stageKey: string, c: any): TickState {
  switch (stageKey) {
    case "new":
      if (c.design_received_by_tech || c.design_file_sent) return "read";
      if (c.new_read_at) return "read";
      if (c.new_delivered_at) return "delivered";
      return "sent"; // case exists → at least sent
    case "design_done":
      if (!(c.design_file_sent || c.design_done)) return "none";
      if (c.design_read_at || c.design_received_by_tech || c.tech_data_sent_to_secretary) return "read";
      if (c.design_delivered_at) return "delivered";
      return "sent";
    case "doctor_review":
      if (!(c.tech_data_sent_to_secretary || c.shipped_to_doctor)) return "none";
      if (c.review_read_at || c.temporary_delivered || c.doctor_decision) return "read";
      if (c.review_delivered_at) return "delivered";
      return "sent";
    case "revision":
      return c.doctor_decision === "revision" ? "read" : "none";
    case "approved":
      if (!(c.doctor_decision === "approved" || c.revision_approved_by_tech)) return "none";
      // brown single check on approval → blue double-check once the technician carves the permanent.
      if (c.permanent_fabrication_done) return "read";
      return "sent";
    case "permanent_done":
      if (!c.permanent_fabrication_done) return "none";
      if (c.perm_read_at || c.permanent_shipped_to_secretary) return "read";
      if (c.perm_delivered_at) return "delivered";
      return "sent";
    case "permanent_shipped":
      if (!(c.permanent_shipped_to_secretary || c.permanent_delivered_to_doctor)) return "none";
      if (c.perm_ship_read_at || c.permanent_received_by_secretary) return "read";
      if (c.perm_ship_delivered_at) return "delivered";
      return "sent";
    case "perm_received":
      return c.permanent_received_by_secretary ? "read" : "none";
    case "installed":
      return c.permanent_installed_by_doctor ? "read" : "none";
    case "final_archived":
      return c.final_archived ? "read" : "none";
    default:
      return "none";
  }
}

export const Route = createFileRoute("/doctors/$slot")({
  component: DoctorPortal,
});

type Sender = "doctor" | "designer" | "technician" | "secretary" | "admin";

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }
interface DocFile { id: string; doctor_slot: number; file_name: string; file_path: string; public_url: string | null; size_bytes: number | null; archived: boolean; uploaded_by: string; created_at: string }
interface DocMsg {
  id: string; doctor_slot: number; sender: Sender; sender_name: string | null;
  content: string; message_type: "text" | "file" | "audio";
  attachment_url: string | null; attachment_name: string | null; attachment_mime: string | null; attachment_size: number | null;
  created_at: string;
}

const SENDER_LABEL: Record<Sender, string> = {
  doctor: "الطبيب", designer: "المصمم", technician: "الفني", secretary: "السكرتارية", admin: "الإدارة",
};
const SENDER_COLOR: Record<Sender, string> = {
  doctor: "gradient-brown text-primary-foreground",
  designer: "bg-gold/90 text-gold-foreground",
  technician: "bg-blue-600 text-white",
  secretary: "bg-emerald-600 text-white",
  admin: "bg-rose-700 text-white",
};

const SESSION_KEY = (slot: string) => `zircon_doctor_${slot}_authed`;

function DoctorPortal() {
  const { slot } = Route.useParams();
  const nav = useNavigate();
  const { role, fullName, loading: authLoading } = useAuth();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [authed, setAuthed] = useState(false);
  const [pwRequired, setPwRequired] = useState<boolean | null>(null);
  const [actor, setActor] = useState<Sender>("doctor");
  const [actorName, setActorName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctor_profiles").select("*").eq("slot", Number(slot)).maybeSingle();
      setDoctor(data as Doctor);
    })();
  }, [slot]);

  // Admin-controlled flag: when off, doctors enter their page without a password.
  useEffect(() => {
    getAppFlag(DOCTOR_PASSWORD_REQUIRED).then(setPwRequired);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (typeof window !== "undefined" && localStorage.getItem("zircon_admin_all") === "1") {
      setActor("admin");
      setActorName("الإدارة");
      setAuthed(true);
      return;
    }
    if (role && role !== "doctor") {
      setActor(role as Sender);
      setActorName(fullName || ROLE_LABELS[role as AppRole]);
      setAuthed(true);
      return;
    }
    if (typeof window !== "undefined" && localStorage.getItem(SESSION_KEY(slot)) === "1") {
      setActor("doctor");
      setAuthed(true);
    }
  }, [authLoading, role, fullName, slot]);


  if (!doctor || pwRequired === null) return <div className="min-h-screen grid place-items-center text-muted-foreground">جارِ التحميل...</div>;
  if (!doctor.active) return (
    <ShellHeader>
      <div className="container mx-auto px-6 py-20 text-center">
        <div className="text-xl font-bold mb-2">الخانة غير مفعّلة</div>
        <p className="text-muted-foreground">هذه الخانة شاغرة. تواصل مع الإدارة لتفعيلها.</p>
      </div>
    </ShellHeader>
  );

  if (!authed && pwRequired) return <PasswordGate doctor={doctor} onOk={() => {

    localStorage.setItem(SESSION_KEY(slot), "1");
    setActor("doctor");
    setActorName(doctor.name);
    setAuthed(true);
  }} />;

  return <Portal doctor={doctor} actor={actor} actorName={actorName || doctor.name} onLogout={() => {
    if (actor === "doctor") localStorage.removeItem(SESSION_KEY(slot));
    nav({ to: "/login" });
  }} />;
}

function ShellHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className={`sticky top-0 ${Z.header} border-b border-border/60 bg-background/85 backdrop-blur`}>
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/doctors" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">بوابة الطبيب</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zircon CAD CAM</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {right}
            <Link to="/doctors"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
              <ArrowRight className="size-4" /> الرجوع
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function PasswordGate({ doctor, onOk }: { doctor: Doctor; onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await supabase.rpc("verify_doctor_login", { p_password: pw });
    const row = Array.isArray(data) ? data[0] : null;
    if (row && row.slot === doctor.slot) onOk();
    else setErr("كلمة المرور غير صحيحة");
  }
  return (
    <ShellHeader>
      <main className="container mx-auto px-6 py-16 grid place-items-center">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-card border border-border p-8 shadow-luxury">
          <div className="mx-auto w-fit">
            <DoctorAvatar name={doctor.name} className="size-20 mx-auto" />
          </div>
          <div className="text-center mt-4">
            <div className="text-xl font-bold">{doctor.name}</div>
            <div className="text-xs text-muted-foreground mt-1">أدخل كلمة المرور الخاصة للدخول إلى صفحتك</div>
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
          <button type="submit" className="mt-4 w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury">دخول</button>
        </form>
      </main>
    </ShellHeader>
  );
}

function Portal({ doctor, actor, actorName, onLogout }: { doctor: Doctor; actor: Sender; actorName: string; onLogout: () => void }) {
  const { branch } = useAuth();
  const [tab, setTab] = useState<"cases" | "files" | "reports" | "search" | "notify" | "followup">("cases");
  const [unread, setUnread] = useState(0);
  const { count: newRounds, clear: clearRounds } = useNewRevisionRounds(`doctor${doctor.slot}`, doctor.slot);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Map portal actor → chat RoleKey (split secretary by branch)
  const chatRole: RoleKey = (() => {
    if (actor === "secretary") return branch === "ibb" ? "secretary_ibb" : "secretary_sanaa";
    return actor as RoleKey;
  })();

  return (
    <ShellHeader right={
      <>
        <Link to="/help/$role" params={{ role: "doctor" }}
          className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition">
          دليل الاستخدام
        </Link>
        <button onClick={onLogout} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition">
          خروج
        </button>
      </>
    }>
      <main className="container mx-auto px-4 sm:px-6 py-6">
        {actor === "doctor" && <ToolGate id="notifications"><RoleNotifications role="doctor" slot={doctor.slot} /></ToolGate>}

        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <DoctorAvatar name={doctor.name} className="size-16 ring-white/40" rounded="2xl" />
            <div>
              <div className="text-xs opacity-80">صفحة الطبيب</div>
              <div className="text-2xl font-extrabold">{doctor.name}</div>
              <div className="text-xs opacity-80 mt-1">
                {doctor.branch === "sanaa" ? "فرع صنعاء" : doctor.branch === "ibb" ? "فرع إب" : ""}
                {" • "}
                <span className="rounded-full bg-white/15 px-2 py-0.5 ms-1">
                  دخول كـ {CHAT_LABEL[chatRole]}{actorName && actor !== "doctor" ? ` (${actorName})` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-5 gap-1 border-b border-border">
          <TabBtn active={tab==="cases"} onClick={()=>setTab("cases")} icon={<ClipboardList className="size-4" />} label="الحالات" badge={unread} />
          <TabBtn active={tab==="search"} onClick={()=>setTab("search")} icon={<Search className="size-4" />} label="بحث" />
          <TabBtn active={tab==="files"} onClick={()=>setTab("files")} icon={<FilesIcon className="size-4" />} label="الملفات" />
          <TabBtn active={tab==="reports"} onClick={()=>setTab("reports")} icon={<FileSpreadsheet className="size-4" />} label="الكشوفات" />
          <TabBtn active={tab==="followup"} onClick={()=>{ setTab("followup"); clearRounds(); }} icon={<RefreshCw className="size-4" />} label="متابعة" badge={newRounds} />
          <TabBtn active={tab==="notify"} onClick={()=>setTab("notify")} icon={<Bell className="size-4" />} label="الإشعارات" />
        </div>

        <div className="mt-6">
          {tab === "cases" && <CasesPanel doctor={doctor} me={chatRole} myName={actorName || doctor.name} />}
          {tab === "search" && <CaseSearch actor={chatRole as any} restrictSlot={doctor.slot} />}
          {tab === "files" && <FilesPanel doctor={doctor} actor={actor} />}
          {tab === "reports" && <DoctorReportsPanel doctor={doctor} />}
          {tab === "followup" && <DesignerFollowupPanel doctorSlot={doctor.slot} />}
          {tab === "notify" && <NotificationSettings />}
        </div>

        <ChatNotificationsListener doctorSlot={doctor.slot} me={chatRole}
          onUnread={(n) => setUnread(n)} />
      </main>
    </ShellHeader>
  );
}

function ChatNotificationsListener({ doctorSlot, me, onUnread }: { doctorSlot: number; me: RoleKey; onUnread: (n: number) => void }) {
  useEffect(() => {
    const ctx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
    function beep() {
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880; o.type = "sine"; g.gain.value = 0.0001;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.42);
    }
    let convIds: string[] = [];
    const refresh = async () => {
      const { data } = await supabase.from("chat_conversations").select("id,participants")
        .eq("doctor_slot", doctorSlot);
      convIds = ((data ?? []) as any[]).filter(c => c.participants.includes(me)).map(c => c.id);
      if (convIds.length === 0) { onUnread(0); return; }
      const { count } = await supabase.from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .neq("sender", me)
        .not("read_by", "cs", `{${me}}`);
      onUnread(count ?? 0);
    };
    refresh();
    const ch = supabase.channel(`chat-notif-${doctorSlot}-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        const m = payload.new;
        if (convIds.includes(m.conversation_id) && m.sender !== me) {
          beep();
          toast(`رسالة جديدة من ${CHAT_LABEL[m.sender as RoleKey] ?? m.sender}`, { description: m.content });
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try { new Notification("Zircon Journey — رسالة جديدة", { body: m.content }); } catch {}
          }
          refresh();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `doctor_slot=eq.${doctorSlot}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); ctx?.close().catch(()=>{}); };
  }, [doctorSlot, me, onUnread]);
  return null;
}

function TabBtn({ active, onClick, icon, label, badge }: any) {
  return (
    <button onClick={onClick}
      className={`relative flex items-center justify-center gap-1.5 px-2 sm:px-4 py-3 text-xs sm:text-sm font-bold border-b-2 -mb-px transition ${active?"border-gold text-gold":"border-transparent text-muted-foreground hover:text-foreground"}`}>
      {icon} <span className="truncate">{label}</span>
      {badge > 0 && <span className="rounded-full gradient-gold text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] grid place-items-center shadow-gold">{badge}</span>}
    </button>
  );
}

function FilesPanel({ doctor, actor }: { doctor: Doctor; actor: string }) {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("doctor_files").select("*")
      .eq("doctor_slot", doctor.slot).order("created_at", { ascending: false });
    setFiles((data as DocFile[]) ?? []);
  }, [doctor.slot]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`doctor-files-${doctor.slot}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_files", filter: `doctor_slot=eq.${doctor.slot}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctor.slot, load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const path = `${doctor.slot}/${Date.now()}-${f.name}`;
    const { error: upErr } = await supabase.storage.from("doctor-files").upload(path, f, { upsert: false });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { data: pub } = supabase.storage.from("doctor-files").getPublicUrl(path);
    const { error } = await supabase.from("doctor_files").insert({
      doctor_slot: doctor.slot, file_name: f.name, file_path: path,
      public_url: pub.publicUrl, size_bytes: f.size, uploaded_by: actor,
    });
    setUploading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("تم رفع الملف");
      // Every doctor upload is mirrored to the clinic's Telegram group.
      const { queueTelegram } = await import("@/lib/telegram-outbox");
      void queueTelegram(
        `📎 إرسال تلقائي — ملف من الطبيب\n──────────────\n🩺 الطبيب: ${doctor.name}\n📤 المصدر: ${actor}\n📁 الملف: ${f.name}`,
        [{ bucket: "doctor-files", path, filename: f.name }],
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function archive(f: DocFile, val: boolean) {
    const { error } = await supabase.from("doctor_files").update({ archived: val }).eq("id", f.id);
    if (error) toast.error(error.message); else toast.success(val ? "تمت الأرشفة" : "تم الإسترجاع");
  }
  async function remove(f: DocFile) {
    if (!confirm(`حذف الملف "${f.file_name}"؟`)) return;
    await supabase.storage.from("doctor-files").remove([f.file_path]);
    const { error } = await supabase.from("doctor_files").delete().eq("id", f.id);
    if (error) toast.error(error.message); else toast.success("تم الحذف");
  }
  async function copyLink(f: DocFile) {
    if (!f.public_url) return;
    await navigator.clipboard.writeText(f.public_url);
    toast.success("تم نسخ رابط المشاركة");
  }
  async function shareExternal(f: DocFile) {
    if (!f.public_url) return;
    const { shareOrCopy } = await import("@/lib/share");
    await shareOrCopy({ title: f.file_name, url: f.public_url });
  }

  /**
   * Send file as a chat message to a target staff role. Reuses (or creates)
   * a 1-1 conversation between the doctor and that role under this slot.
   */
  async function sendToRole(f: DocFile, target: RoleKey) {
    const participants: RoleKey[] = ["doctor", target];
    const { data: existing } = await supabase.from("chat_conversations")
      .select("id,participants").eq("doctor_slot", doctor.slot);
    let conv = (existing ?? []).find((c: any) =>
      Array.isArray(c.participants) && c.participants.length === 2
      && c.participants.includes("doctor") && c.participants.includes(target)
    ) as { id: string } | undefined;
    if (!conv) {
      const { data: created, error } = await supabase.from("chat_conversations")
        .insert({ doctor_slot: doctor.slot, participants, title: `ملف من ${doctor.name}`, created_by: "doctor" })
        .select("id").single();
      if (error || !created) { toast.error(error?.message ?? "تعذر إنشاء المحادثة"); return; }
      conv = created;
    }
    const { error: mErr } = await supabase.from("chat_messages").insert({
      conversation_id: conv.id, sender: "doctor", sender_name: doctor.name,
      content: `📎 ${f.file_name}\n${f.public_url ?? ""}`,
      message_type: "text",
    });
    if (mErr) toast.error(mErr.message);
    else toast.success(`تم إرسال "${f.file_name}" إلى ${CHAT_LABEL[target]}`);
  }

  const visible = files.filter(f => (view === "active" ? !f.archived : f.archived) && (!q || f.file_name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={()=>setView("active")} className={`rounded-full px-4 py-1.5 text-xs font-bold border ${view==="active"?"gradient-gold border-gold":"bg-card border-border"}`}>النشطة</button>
          <button onClick={()=>setView("archived")} className={`rounded-full px-4 py-1.5 text-xs font-bold border ${view==="archived"?"gradient-gold border-gold":"bg-card border-border"}`}>
            <Archive className="inline size-3 me-1" /> المؤرشفة
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث في الملفات..."
              className="rounded-xl border border-input bg-card pr-9 pl-3 py-2 text-sm outline-none focus:border-gold w-56" />
          </div>
          <Link to="/doctors/$slot/new-case" params={{ slot: String(doctor.slot) }}
            className="inline-flex items-center gap-2 rounded-xl border border-gold bg-card px-4 py-2 text-sm font-bold hover:gradient-gold transition">
            <Plus className="size-4" /> إضافة حالة
          </Link>
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl gradient-brown px-4 py-2 text-sm font-bold shadow-luxury">
            <Upload className="size-4" /> {uploading ? "جارِ الرفع..." : "رفع ملف"}
            <input ref={fileInput} type="file" className="hidden" onChange={upload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border shadow-luxury">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <FilesIcon className="size-10 mx-auto mb-3 opacity-40" />
            لا توجد ملفات {view === "archived" ? "مؤرشفة" : ""} حالياً.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map(f => <FileRow key={f.id} f={f} doctorBranch={doctor.branch} doctorName={doctor.name}
              onArchive={archive} onRemove={remove} onCopy={copyLink} onShare={shareExternal} onSendTo={sendToRole} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileRow({ f, doctorBranch, doctorName, onArchive, onRemove, onCopy, onShare, onSendTo }: any) {
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const sendRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!sendOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (sendRef.current && !sendRef.current.contains(e.target as Node)) setSendOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [sendOpen]);

  const secretaryRole: RoleKey = doctorBranch === "ibb" ? "secretary_ibb" : "secretary_sanaa";
  const targets: { role: RoleKey; label: string; Icon: any; color: string }[] = [
    { role: "designer", label: "المصمم", Icon: Palette, color: "bg-gold/90 text-gold-foreground" },
    { role: "admin", label: "الإدارة", Icon: Shield, color: "bg-rose-700 text-white" },
    { role: secretaryRole, label: doctorBranch === "ibb" ? "سكرتارية إب" : "سكرتارية صنعاء", Icon: Building2, color: "bg-emerald-600 text-white" },
  ];

  const branchLabel = doctorBranch === "ibb" ? "فرع إب" : doctorBranch === "sanaa" ? "فرع صنعاء" : null;
  const sizeLabel = f.size_bytes
    ? f.size_bytes > 1024 * 1024
      ? `${(f.size_bytes / 1024 / 1024).toFixed(1)} MB`
      : `${(f.size_bytes / 1024).toFixed(1)} KB`
    : null;

  const ActionBtn = ({ onClick, title, children, className = "" }: any) => (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-lg border border-border p-2 hover:border-gold transition min-w-[58px] ${className}`}
      title={title}>
      {children}
    </button>
  );

  return (
    <li className="p-4 hover:bg-muted/40 transition">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="size-11 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
            <FileText className="size-5 text-gold-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{f.file_name}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              د/ {doctorName}{branchLabel ? ` • ${branchLabel}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-stretch gap-1.5 shrink-0">
          <a href={f.public_url ?? "#"} download={f.file_name} target="_blank" rel="noreferrer"
            className="flex flex-col items-center gap-0.5 rounded-lg border border-border p-2 hover:border-gold transition min-w-[58px]" title="تحميل">
            <Download className="size-4" />
            <span className="text-[10px] font-bold">تحميل</span>
            <span className="text-[9px] text-muted-foreground truncate max-w-[52px]">{sizeLabel ?? "ملف"}</span>
          </a>
          <ActionBtn onClick={() => { onCopy(f); setCopied(true); setTimeout(() => setCopied(false), 1500); }} title="نسخ الرابط">
            {copied ? <Check className="size-4 text-gold" /> : <Copy className="size-4" />}
            <span className="text-[10px] font-bold">{copied ? "تم النسخ" : "نسخ"}</span>
            <span className="text-[9px] text-muted-foreground truncate max-w-[52px]">رابط</span>
          </ActionBtn>

          {/* أرسال إلى — منسدلة احترافية */}
          <div ref={sendRef} className="relative">
            <button onClick={() => setSendOpen(o => !o)}
              className={`flex flex-col items-center gap-0.5 rounded-lg border p-2 transition min-w-[58px] ${sendOpen ? "border-gold gradient-gold text-gold-foreground" : "border-border hover:border-gold"}`}
              title="أرسال إلى" aria-haspopup="menu" aria-expanded={sendOpen}>
              <Send className="size-4" />
              <span className="text-[10px] font-bold">إرسال</span>
              <span className="text-[9px] opacity-80 truncate max-w-[52px]">للفريق</span>
            </button>
            {sendOpen && (
              <div role="menu" className={`absolute ${Z.dropdown} mt-2 end-0 w-52 rounded-xl border border-border bg-popover shadow-luxury overflow-hidden animate-in fade-in zoom-in-95`}>
                <div className="px-3 py-2 text-[11px] font-bold text-muted-foreground border-b border-border">أرسال إلى</div>
                {targets.map(t => (
                  <button key={t.role} onClick={() => { setSendOpen(false); onSendTo(f, t.role); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-start hover:bg-muted">
                    <span className={`size-7 rounded-lg grid place-items-center ${t.color} shrink-0`}>
                      <t.Icon className="size-3.5" />
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ActionBtn onClick={() => onShare(f)} title="مشاركة خارجية">
            <Share2 className="size-4" />
            <span className="text-[10px] font-bold">مشاركة</span>
            <span className="text-[9px] text-muted-foreground truncate max-w-[52px]">خارجية</span>
          </ActionBtn>
          <ActionBtn onClick={() => onArchive(f, !f.archived)} title={f.archived ? "إسترجاع" : "أرشفة"}>
            {f.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            <span className="text-[10px] font-bold">{f.archived ? "استرجاع" : "أرشفة"}</span>
            <span className="text-[9px] text-muted-foreground truncate max-w-[52px]">{new Date(f.created_at).toLocaleDateString("ar")}</span>
          </ActionBtn>
          <ActionBtn onClick={() => onRemove(f)} title="حذف" className="hover:bg-destructive hover:text-destructive-foreground hover:border-destructive">
            <Trash2 className="size-4" />
            <span className="text-[10px] font-bold">حذف</span>
            <span className="text-[9px] opacity-70 truncate max-w-[52px]">نهائي</span>
          </ActionBtn>
        </div>
      </div>
      {/* تفاصيل الملف الكاملة */}
      <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div><span className="text-muted-foreground">الاسم: </span><span className="font-bold truncate inline-block max-w-full align-bottom">{f.file_name}</span></div>
        <div><span className="text-muted-foreground">الطبيب: </span><span className="font-bold">د/ {doctorName}</span></div>
        <div><span className="text-muted-foreground">التاريخ: </span><span className="font-bold">{new Date(f.created_at).toLocaleString("ar")}</span></div>
        <div><span className="text-muted-foreground">رفع بواسطة: </span><span className="font-bold">{f.uploaded_by}</span></div>
        {sizeLabel && <div><span className="text-muted-foreground">الحجم: </span><span className="font-bold">{sizeLabel}</span></div>}
        {branchLabel && <div><span className="text-muted-foreground">الفرع: </span><span className="font-bold">{branchLabel}</span></div>}
        <div><span className="text-muted-foreground">الحالة: </span><span className="font-bold">{f.archived ? "مؤرشف" : "نشط"}</span></div>
      </div>
    </li>
  );
}

interface SlotCase {
  id: string; doctor_slot: number; case_code: string; patient_name: string;
  patient_phone: string | null; patient_age: number | null;
  tooth_number: string | null; teeth_count: string | null; shade: string | null;
  case_type: string | null; status: CaseStage; notes: string | null;
  scan_path: string | null; scan_name: string | null;
  pinned: boolean; archived: boolean; final_archived?: boolean | null;
  design_done: boolean | null; design_file_sent: boolean | null;
  fabrication_done: boolean | null; fabrication_file_sent: boolean | null;
  doctor_decision?: string | null;
  created_at: string; updated_at: string;
}

function CasesPanel({ doctor, me, myName }: { doctor: Doctor; me: RoleKey; myName: string }) {
  const [cases, setCases] = useState<SlotCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SlotCase | null>(null);
  const [stageFilter, setStageFilter] = useState<CaseStage | "all">("all");

  const load = useCallback(async () => {
    const { data } = await supabase.from("slot_cases").select("*")
      .eq("doctor_slot", doctor.slot)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setCases((data as SlotCase[]) ?? []);
    setLoading(false);
  }, [doctor.slot]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`slot-cases-${doctor.slot}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "slot_cases", filter: `doctor_slot=eq.${doctor.slot}` }, (payload: any) => {
        const oldRow = payload.old ?? {};
        const newRow = payload.new ?? {};
        const oldStage = getStage(deriveStageKey(oldRow)).label;
        const newStage = getStage(deriveStageKey(newRow)).label;
        if (oldStage !== newStage) {
          toast(`🔔 تحديث الحالة ${newRow.case_code}: ${newStage}`, { duration: 5000 });
        }
        load();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "slot_cases", filter: `doctor_slot=eq.${doctor.slot}` }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "slot_cases", filter: `doctor_slot=eq.${doctor.slot}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctor.slot, load]);

  async function togglePin(c: SlotCase) {
    const { error } = await supabase.from("slot_cases")
      .update({ pinned: !c.pinned, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(!c.pinned ? "تم تثبيت الحالة" : "تم إلغاء التثبيت");
  }
  async function remove(c: SlotCase) {
    if (!confirm(`حذف الحالة "${c.case_code} — ${c.patient_name}" نهائياً؟`)) return;
    const { error } = await supabase.from("slot_cases").delete().eq("id", c.id);
    if (error) toast.error(error.message); else toast.success("تم حذف الحالة");
  }

  if (loading) return <div className="p-12 text-center text-muted-foreground text-sm">جارِ تحميل الحالات...</div>;

  // Doctor page shows only active cases. Archiving lives in the technician + admin pages.
  const activeCases = cases.filter(c => !c.archived && !c.final_archived);
  const revisionCount = activeCases.filter(c => c.doctor_decision === "revision").length;
  const visible = stageFilter === "all"
    ? activeCases
    : stageFilter === "revision"
      ? activeCases.filter(c => c.doctor_decision === "revision")
      : activeCases.filter(c => getStage(deriveStageKey(c)).key === stageFilter);
  const stageCounts = new Map<CaseStage, number>();
  for (const c of activeCases) {
    const key = getStage(deriveStageKey(c)).key;
    stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          عدد الحالات النشطة: <span className="font-bold text-foreground">{visible.length}</span>
          {stageFilter !== "all" && <span> من أصل {activeCases.length}</span>}
        </div>
        <Link to="/doctors/$slot/new-case" params={{ slot: String(doctor.slot) }}
          className="inline-flex items-center gap-2 rounded-xl gradient-brown px-4 py-2 text-sm font-bold shadow-luxury">
          <Plus className="size-4" /> حالة جديدة
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-2">
        <span className="text-[11px] font-bold text-muted-foreground inline-flex items-center gap-1.5">
          <ClipboardList className="size-3.5" /> تصفية حسب المستوى:
        </span>
        <button type="button" onClick={() => setStageFilter("all")}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${stageFilter === "all" ? "gradient-gold text-gold-foreground border-transparent shadow-gold" : "border-border bg-background hover:border-gold"}`}>
          الكل <span className="opacity-80">({activeCases.length})</span>
        </button>
        {STAGES.map(stage => {
          const count = stageCounts.get(stage.key) ?? 0;
          const selected = stageFilter === stage.key;
          return (
            <button key={stage.key} type="button" onClick={() => setStageFilter(selected ? "all" : stage.key)}
              disabled={count === 0 && !selected}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed ${selected ? "gradient-gold text-gold-foreground border-transparent shadow-gold" : "border-border bg-background hover:border-gold"}`}>
              {stage.label} <span className="opacity-80">({count})</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setStageFilter(stageFilter === "revision" ? "all" : "revision")}
          disabled={revisionCount === 0 && stageFilter !== "revision"}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed ${stageFilter === "revision" ? "bg-destructive text-destructive-foreground border-transparent shadow-luxury" : "border-destructive/50 text-destructive bg-background hover:border-destructive"}`}>
          يلزم تعديل <span className="opacity-80">({revisionCount})</span>
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground text-sm shadow-luxury">
          <ClipboardList className="size-10 mx-auto mb-3 opacity-40" />
          لا توجد حالات نشطة حالياً.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map(c => (
            <CaseCard key={c.id} c={c} doctorName={doctor.name}
              doctorSlot={doctor.slot} me={me} myName={myName}
              onEdit={() => setEditing(c)}
              onPin={() => togglePin(c)}
              onDelete={() => remove(c)} />
          ))}
        </div>
      )}

      {editing && <EditCaseModal c={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CaseCard({ c, doctorName, doctorSlot, me, myName, onEdit, onPin, onDelete }: {
  c: SlotCase; doctorName: string; doctorSlot: number; me: RoleKey; myName: string;
  onEdit: () => void; onPin: () => void; onDelete: () => void;
}) {
  const stage = getStage(deriveStageKey(c));
  const stageIdx = STAGES.findIndex(s => s.key === stage.key);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <article className={`relative rounded-2xl bg-card border p-5 shadow-luxury hover:border-gold/60 transition ${c.pinned ? "border-gold/70" : "border-border"}`}>
      {c.pinned && (
        <span className="absolute -top-2 -start-2 rounded-full gradient-gold text-gold-foreground text-[10px] font-bold px-2 py-0.5 shadow-gold inline-flex items-center gap-1">
          <Pin className="size-3" /> مثبّتة
        </span>
      )}
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground">{c.case_code}</div>
          <div className="font-bold text-base truncate">{c.patient_name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {c.case_type || "—"}{c.tooth_number ? ` • سن ${c.tooth_number}` : ""}{c.teeth_count ? ` • عدد ${c.teeth_count}` : ""}
          </div>
          {c.shade && <div className="mt-2"><ShadeBadge shade={c.shade} size="sm" /></div>}
        </div>
        <span className="shrink-0 rounded-full gradient-gold text-gold-foreground text-[11px] font-bold px-2.5 py-1 shadow-gold">
          {stage.label}
        </span>
      </header>

      {/* Gold journey progress */}
      <div className="space-y-2">
        <div className="relative h-2.5 rounded-full bg-muted/60 overflow-hidden">
          <div className="absolute inset-y-0 right-0 gradient-gold transition-all duration-700 shadow-gold"
            style={{ width: `${stage.percent}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground font-bold">
          {STAGES.map((s, i) => {
            const tick = stageTickState(s.key, c);
            const label = s.key === "doctor_review" && (c as any).doctor_decision ? "تمت المراجعة" : s.label;
            return (
              <span key={s.key} className={`whitespace-nowrap inline-flex items-center gap-1 ${i <= stageIdx ? "text-gold" : ""}`}>
                {label}
                <StageTick state={tick} />
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border">
        <CaseWorkflowControls c={c as any} actor="doctor" actorName={doctorName} doctorName={doctorName} />
      </div>

      <footer className="flex items-center justify-between mt-4 pt-3 border-t border-border gap-2 flex-wrap">
        <div className="text-[11px] text-muted-foreground">
          آخر تحديث: {new Date(c.updated_at).toLocaleString("ar")}
        </div>
        <div className="flex items-center gap-2">
          <CaseChatButton doctorSlot={doctorSlot} doctorName={doctorName}
            me={me} myName={myName} caseCode={c.case_code} caseLabel={c.patient_name} />
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
            className={`rounded-lg border p-2 transition ${menuOpen ? "border-gold gradient-gold text-gold-foreground" : "border-border hover:border-gold"}`}
            title="أدوات الحالة">
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div role="menu" className={`absolute ${Z.dropdown} mt-2 end-0 w-48 rounded-xl border border-border bg-popover shadow-luxury overflow-hidden animate-in fade-in zoom-in-95`}>
              <MenuItem icon={Pencil} label="تعديل" onClick={() => { setMenuOpen(false); onEdit(); }} />
              {(() => {
                const isAdmin = typeof window !== "undefined" && (
                  localStorage.getItem("zircon_admin_all") === "1" ||
                  localStorage.getItem("zircon_staff_admin") === "1"
                );
                const canPinDelete = isAdmin;
                return <>
                  <MenuItem icon={c.pinned ? PinOff : Pin} label={c.pinned ? "إلغاء التثبيت" : "تثبيت"} onClick={() => { setMenuOpen(false); onPin(); }} />
                  {canPinDelete && (
                    <MenuItem icon={Trash2} label="حذف" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
                  )}
                  {!isAdmin && (
                    <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
                      الأرشفة والحذف يتمّان من صفحة الفني/الإدارة
                    </div>
                  )}
                </>;
              })()}
            </div>
          )}
        </div>
        </div>
      </footer>
    </article>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-start hover:bg-muted ${danger ? "text-destructive hover:bg-destructive/10" : ""}`}>
      <Icon className="size-4" /> {label}
    </button>
  );
}

const SHADES_LIST = ["A1","A2","A3","A3.5","A4","B1","B2","B3","B4","C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4","OM2","OM3","1M1","1M2","2M1","2M2","2M3","2L1.5","2L2.5","2R1.5","2R2.5","3M1","3M2","3M3","3L1.5","3L2.5","3R1.5","3R2.5","4M1","4M2","4M3","4L1.5","4L2.5","4R1.5","4R2.5","5M1","5M2","5M3"];

function EditCaseModal({ c, onClose, onSaved }: { c: SlotCase; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    patient_name: c.patient_name,
    patient_phone: c.patient_phone ?? "",
    patient_age: c.patient_age != null ? String(c.patient_age) : "",
    tooth_number: c.tooth_number ?? "",
    teeth_count: c.teeth_count ?? "",
    shade: c.shade ?? "A2",
    case_type: c.case_type ?? "",
    notes: c.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.patient_name.trim().length < 2) { toast.error("اسم المريض يجب أن لا يقل عن حرفين"); return; }
    if (form.patient_age && (!/^\d+$/.test(form.patient_age) || +form.patient_age < 0 || +form.patient_age > 120)) {
      toast.error("العمر يجب أن يكون رقماً بين 0 و 120"); return;
    }
    if (form.tooth_number && !/^([1-4][1-8])(\s*[,،\-]\s*[1-4][1-8])*$/.test(form.tooth_number)) {
      toast.error("رقم السن غير صالح (نظام FDI)"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("slot_cases").update({
      patient_name: form.patient_name.trim(),
      patient_phone: form.patient_phone.trim() || null,
      patient_age: form.patient_age ? Number(form.patient_age) : null,
      tooth_number: form.tooth_number.trim() || null,
      teeth_count: form.teeth_count.trim() || null,
      shade: form.shade || null,
      case_type: form.case_type || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", c.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("تم حفظ التعديلات"); onSaved(); }
  }

  return (
    <div className={`fixed inset-0 ${Z.overlay} grid place-items-center p-4 bg-black/60 backdrop-blur-sm`} onClick={onClose}>
      <form onSubmit={save} onClick={e=>e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-luxury p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground font-mono">{c.case_code}</div>
            <h2 className="text-lg font-bold mt-0.5">تعديل بيانات الحالة</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border p-2 hover:border-gold"><X className="size-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="block col-span-2">
            <div className="text-xs font-bold text-muted-foreground mb-1">اسم المريض *</div>
            <input className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              value={form.patient_name} onChange={e=>setForm({...form, patient_name: e.target.value})} required />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-muted-foreground mb-1">الهاتف</div>
            <input dir="ltr" className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              value={form.patient_phone} onChange={e=>setForm({...form, patient_phone: e.target.value})} />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-muted-foreground mb-1">العمر</div>
            <input type="number" min={0} max={120} className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              value={form.patient_age} onChange={e=>setForm({...form, patient_age: e.target.value})} />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-muted-foreground mb-1">رقم السن (FDI)</div>
            <input className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              value={form.tooth_number} onChange={e=>setForm({...form, tooth_number: e.target.value})} placeholder="مثال: 11, 24" />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-muted-foreground mb-1">عدد الأسنان</div>
            <input className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              value={form.teeth_count} onChange={e=>setForm({...form, teeth_count: e.target.value})} placeholder="مثال: 3" />
          </label>
          <label className="block">
            <div className="text-xs font-bold text-muted-foreground mb-1">اللون</div>
            <select className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold"
              value={form.shade} onChange={e=>setForm({...form, shade: e.target.value})}>
              {SHADES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block col-span-2">
            <div className="text-xs font-bold text-muted-foreground mb-1">ملاحظات</div>
            <textarea rows={3} className="w-full rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-gold resize-none"
              value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})} />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs font-bold">إلغاء</button>
          <button type="submit" disabled={saving}
            className="rounded-lg gradient-brown px-5 py-2 text-xs font-bold shadow-luxury inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? <><Loader2 className="size-3.5 animate-spin" /> جارِ الحفظ...</> : "حفظ التعديلات"}
          </button>
        </div>
      </form>
    </div>
  );
}
