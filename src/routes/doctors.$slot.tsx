import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import { ChatModule } from "@/components/chat-module";
import { ROLE_LABEL as CHAT_LABEL, type RoleKey } from "@/lib/chat";
import {
  Sparkles, ArrowRight, Lock, Upload, FileText, Download, Archive,
  Trash2, Share2, MessageSquare, Files as FilesIcon, ArchiveRestore, Copy, Check, Search,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/doctors/$slot")({
  component: DoctorPortal,
});

type Sender = "doctor" | "designer" | "technician" | "secretary" | "admin";

interface Doctor { slot: number; name: string; branch: string | null; password: string; active: boolean }
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
  const [actor, setActor] = useState<Sender>("doctor");
  const [actorName, setActorName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("doctor_profiles").select("*").eq("slot", Number(slot)).maybeSingle();
      setDoctor(data as Doctor);
    })();
  }, [slot]);

  useEffect(() => {
    if (authLoading) return;
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

  if (!doctor) return <div className="min-h-screen grid place-items-center text-muted-foreground">جارِ التحميل...</div>;
  if (!doctor.active) return (
    <ShellHeader>
      <div className="container mx-auto px-6 py-20 text-center">
        <div className="text-xl font-bold mb-2">الخانة غير مفعّلة</div>
        <p className="text-muted-foreground">هذه الخانة شاغرة. تواصل مع الإدارة لتفعيلها.</p>
      </div>
    </ShellHeader>
  );

  if (!authed) return <PasswordGate doctor={doctor} onOk={() => {
    localStorage.setItem(SESSION_KEY(slot), "1");
    setActor("doctor");
    setActorName(doctor.name);
    setAuthed(true);
  }} />;

  return <Portal doctor={doctor} actor={actor} actorName={actorName || doctor.name} onLogout={() => {
    if (actor === "doctor") localStorage.removeItem(SESSION_KEY(slot));
    nav({ to: "/doctors" });
  }} />;
}

function ShellHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
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
  const [err, setErr] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === doctor.password) onOk();
    else setErr("كلمة المرور غير صحيحة");
  }
  return (
    <ShellHeader>
      <main className="container mx-auto px-6 py-16 grid place-items-center">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-card border border-border p-8 shadow-luxury">
          <div className="size-16 rounded-full gradient-gold grid place-items-center mx-auto shadow-gold">
            <Lock className="size-7 text-gold-foreground" />
          </div>
          <div className="text-center mt-4">
            <div className="text-xl font-bold">{doctor.name}</div>
            <div className="text-xs text-muted-foreground mt-1">أدخل كلمة المرور الخاصة للدخول إلى صفحتك</div>
          </div>
          <input type="password" autoFocus value={pw} onChange={e=>{setPw(e.target.value); setErr("");}}
            placeholder="كلمة المرور" className="mt-6 w-full rounded-xl border border-input bg-background px-4 py-3 text-center font-mono text-lg outline-none focus:border-gold" />
          {err && <div className="text-xs text-destructive mt-2 text-center">{err}</div>}
          <button type="submit" className="mt-4 w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury">دخول</button>
        </form>
      </main>
    </ShellHeader>
  );
}

function Portal({ doctor, actor, actorName, onLogout }: { doctor: Doctor; actor: Sender; actorName: string; onLogout: () => void }) {
  const { branch } = useAuth();
  const [tab, setTab] = useState<"files" | "chat">("files");
  const [unread, setUnread] = useState(0);

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
      <button onClick={onLogout} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition">
        خروج
      </button>
    }>
      <main className="container mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl gradient-gold grid place-items-center shadow-gold">
              <span className="text-2xl font-extrabold text-gold-foreground">{doctor.name.replace(/^د\.\s*/, "").charAt(0)}</span>
            </div>
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

        <div className="mt-6 flex items-center gap-2 border-b border-border">
          <TabBtn active={tab==="files"} onClick={()=>setTab("files")} icon={<FilesIcon className="size-4" />} label="الملفات" />
          <TabBtn active={tab==="chat"} onClick={()=>{ setTab("chat"); setUnread(0); }} icon={<MessageSquare className="size-4" />} label="المحادثة" badge={unread} />
        </div>

        <div className="mt-6">
          {tab === "files"
            ? <FilesPanel doctor={doctor} actor={actor} />
            : <ChatModule doctorSlot={doctor.slot} doctorName={doctor.name} me={chatRole} myName={actorName || doctor.name} />}
        </div>

        <ChatNotificationsListener doctorSlot={doctor.slot} me={chatRole}
          onUnread={(n) => { if (tab !== "chat") setUnread(n); }} />
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
