import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import { ChatModule } from "@/components/chat-module";
import { ROLE_LABEL as CHAT_LABEL, ROLE_COLOR as CHAT_COLOR, type RoleKey } from "@/lib/chat";
import {
  Sparkles, ArrowRight, Lock, Upload, FileText, Download, Archive,
  Trash2, Share2, MessageSquare, Files as FilesIcon, ArchiveRestore, Copy, Check, Search, Plus,
  ClipboardList, MoreHorizontal, Pencil, Pin, PinOff, Send, X, Loader2,
  Palette, Shield, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { STAGES, getStage, notifyRoleAboutCase, localNotify, type CaseStage } from "@/lib/case-stages";
import { Z } from "@/lib/z-index";

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
  const [tab, setTab] = useState<"cases" | "files" | "chat">("cases");
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

        <div className="mt-6 flex items-center gap-2 border-b border-border overflow-x-auto">
          <TabBtn active={tab==="cases"} onClick={()=>setTab("cases")} icon={<ClipboardList className="size-4" />} label="الحالات" />
          <TabBtn active={tab==="files"} onClick={()=>setTab("files")} icon={<FilesIcon className="size-4" />} label="الملفات" />
          <TabBtn active={tab==="chat"} onClick={()=>{ setTab("chat"); setUnread(0); }} icon={<MessageSquare className="size-4" />} label="المحادثة" badge={unread} />
        </div>

        <div className="mt-6">
          {tab === "cases" && <CasesPanel doctor={doctor} />}
          {tab === "files" && <FilesPanel doctor={doctor} actor={actor} />}
          {tab === "chat" && <ChatModule doctorSlot={doctor.slot} doctorName={doctor.name} me={chatRole} myName={actorName || doctor.name} />}
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

function TabBtn({ active, onClick, icon, label, badge }: any) {
  return (
    <button onClick={onClick}
      className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 -mb-px transition ${active?"border-gold text-gold":"border-transparent text-muted-foreground hover:text-foreground"}`}>
      {icon} {label}
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
    if (error) toast.error(error.message); else toast.success("تم رفع الملف");
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
    if (navigator.share) {
      try { await navigator.share({ title: f.file_name, url: f.public_url }); } catch {}
    } else copyLink(f);
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
            {visible.map(f => <FileRow key={f.id} f={f} doctorBranch={doctor.branch}
              onArchive={archive} onRemove={remove} onCopy={copyLink} onShare={shareExternal} onSendTo={sendToRole} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileRow({ f, doctorBranch, onArchive, onRemove, onCopy, onShare, onSendTo }: any) {
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

  return (
    <li className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40 transition flex-wrap">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="size-11 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
          <FileText className="size-5 text-gold-foreground" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{f.file_name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {f.size_bytes ? `${(f.size_bytes/1024).toFixed(1)} KB • ` : ""}
            رفع بواسطة {f.uploaded_by} • {new Date(f.created_at).toLocaleString("ar")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <a href={f.public_url ?? "#"} download={f.file_name} target="_blank" rel="noreferrer"
          className="rounded-lg border border-border p-2 hover:border-gold" title="تحميل">
          <Download className="size-4" />
        </a>
        <button onClick={() => { onCopy(f); setCopied(true); setTimeout(()=>setCopied(false), 1500); }}
          className="rounded-lg border border-border p-2 hover:border-gold" title="نسخ رابط المشاركة">
          {copied ? <Check className="size-4 text-gold" /> : <Copy className="size-4" />}
        </button>

        {/* أرسال إلى — منسدلة احترافية */}
        <div ref={sendRef} className="relative">
          <button onClick={() => setSendOpen(o => !o)}
            className={`rounded-lg border p-2 transition ${sendOpen ? "border-gold gradient-gold text-gold-foreground" : "border-border hover:border-gold"}`}
            title="أرسال إلى"
            aria-haspopup="menu" aria-expanded={sendOpen}>
            <Send className="size-4" />
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

        <button onClick={() => onShare(f)} className="rounded-lg border border-border p-2 hover:border-gold" title="مشاركة خارجية">
          <Share2 className="size-4" />
        </button>
        <button onClick={() => onArchive(f, !f.archived)} className="rounded-lg border border-border p-2 hover:border-gold"
          title={f.archived ? "إسترجاع" : "أرشفة"}>
          {f.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </button>
        <button onClick={() => onRemove(f)} className="rounded-lg border border-border p-2 hover:bg-destructive hover:text-destructive-foreground" title="حذف">
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

interface SlotCase {
  id: string; doctor_slot: number; case_code: string; patient_name: string;
  patient_phone: string | null; patient_age: number | null;
  tooth_number: string | null; shade: string | null;
  case_type: string | null; status: CaseStage; notes: string | null;
  scan_path: string | null; scan_name: string | null;
  pinned: boolean; archived: boolean;
  created_at: string; updated_at: string;
}

function CasesPanel({ doctor }: { doctor: Doctor }) {
  const [cases, setCases] = useState<SlotCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<SlotCase | null>(null);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_cases", filter: `doctor_slot=eq.${doctor.slot}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctor.slot, load]);

  async function togglePin(c: SlotCase) {
    const { error } = await supabase.from("slot_cases")
      .update({ pinned: !c.pinned, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(!c.pinned ? "تم تثبيت الحالة" : "تم إلغاء التثبيت");
  }
  async function toggleArchive(c: SlotCase) {
    const next = !c.archived;
    const { error } = await supabase.from("slot_cases")
      .update({ archived: next, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) toast.error(error.message);
    else toast.success(next ? "تمت الأرشفة" : "تم الاسترجاع");
  }
  async function remove(c: SlotCase) {
    if (!confirm(`حذف الحالة "${c.case_code} — ${c.patient_name}" نهائياً؟`)) return;
    const { error } = await supabase.from("slot_cases").delete().eq("id", c.id);
    if (error) toast.error(error.message); else toast.success("تم حذف الحالة");
  }

  if (loading) return <div className="p-12 text-center text-muted-foreground text-sm">جارِ تحميل الحالات...</div>;

  const visible = cases.filter(c => view === "active" ? !c.archived : c.archived);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={()=>setView("active")} className={`rounded-full px-4 py-1.5 text-xs font-bold border ${view==="active"?"gradient-gold border-gold":"bg-card border-border"}`}>
            النشطة ({cases.filter(c=>!c.archived).length})
          </button>
          <button onClick={()=>setView("archived")} className={`rounded-full px-4 py-1.5 text-xs font-bold border ${view==="archived"?"gradient-gold border-gold":"bg-card border-border"}`}>
            <Archive className="inline size-3 me-1" /> المؤرشفة ({cases.filter(c=>c.archived).length})
          </button>
        </div>
        <Link to="/doctors/$slot/new-case" params={{ slot: String(doctor.slot) }}
          className="inline-flex items-center gap-2 rounded-xl gradient-brown px-4 py-2 text-sm font-bold shadow-luxury">
          <Plus className="size-4" /> حالة جديدة
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground text-sm shadow-luxury">
          <ClipboardList className="size-10 mx-auto mb-3 opacity-40" />
          {view === "archived" ? "لا توجد حالات مؤرشفة." : "لا توجد حالات بعد. ابدأ بإضافة أول حالة."}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map(c => (
            <CaseCard key={c.id} c={c}
              onEdit={() => setEditing(c)}
              onPin={() => togglePin(c)}
              onArchive={() => toggleArchive(c)}
              onDelete={() => remove(c)} />
          ))}
        </div>
      )}

      {editing && <EditCaseModal c={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CaseCard({ c, onEdit, onPin, onArchive, onDelete }: {
  c: SlotCase;
  onEdit: () => void; onPin: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const stage = getStage(c.status);
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
            {c.case_type || "—"}{c.tooth_number ? ` • سن ${c.tooth_number}` : ""}{c.shade ? ` • ${c.shade}` : ""}
          </div>
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
        <div className="flex justify-between text-[10px] text-muted-foreground font-bold">
          {STAGES.map((s, i) => (
            <span key={s.key} className={i <= stageIdx ? "text-gold" : ""}>{s.label}</span>
          ))}
        </div>
      </div>

      <footer className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <div className="text-[11px] text-muted-foreground">
          آخر تحديث: {new Date(c.updated_at).toLocaleString("ar")}
        </div>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
            className={`rounded-lg border p-2 transition ${menuOpen ? "border-gold gradient-gold text-gold-foreground" : "border-border hover:border-gold"}`}
            title="أدوات الحالة">
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div role="menu" className={`absolute ${Z.dropdown} mt-2 end-0 w-48 rounded-xl border border-border bg-popover shadow-luxury overflow-hidden animate-in fade-in zoom-in-95`}>
              <MenuItem icon={Pencil} label="تعديل" onClick={() => { setMenuOpen(false); onEdit(); }} />
              <MenuItem icon={c.pinned ? PinOff : Pin} label={c.pinned ? "إلغاء التثبيت" : "تثبيت"} onClick={() => { setMenuOpen(false); onPin(); }} />
              <MenuItem icon={c.archived ? ArchiveRestore : Archive} label={c.archived ? "استرجاع" : "أرشفة"} onClick={() => { setMenuOpen(false); onArchive(); }} />
              <MenuItem icon={Trash2} label="حذف" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
            </div>
          )}
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

const SHADES_LIST = ["A1","A2","A3","A3.5","A4","B1","B2","B3","B4","C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4"];

function EditCaseModal({ c, onClose, onSaved }: { c: SlotCase; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    patient_name: c.patient_name,
    patient_phone: c.patient_phone ?? "",
    patient_age: c.patient_age != null ? String(c.patient_age) : "",
    tooth_number: c.tooth_number ?? "",
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
