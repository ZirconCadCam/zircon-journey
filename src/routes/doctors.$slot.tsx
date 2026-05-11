import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import {
  Sparkles, ArrowRight, Lock, Upload, Send, FileText, Download, Archive,
  Trash2, Share2, MessageSquare, Files as FilesIcon, ArchiveRestore, Copy, Check, Search,
  Paperclip, Mic, Square, Play, Pause, X,
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
  const [tab, setTab] = useState<"files" | "chat">("files");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

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
                  دخول كـ {SENDER_LABEL[actor]}{actorName && actor !== "doctor" ? ` (${actorName})` : ""}
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
            : <ChatPanel doctor={doctor} actor={actor} actorName={actorName} />}
        </div>

        <NotificationsListener doctor={doctor} actor={actor} onUnread={(n) => tab !== "chat" && setUnread(n)} />
      </main>
    </ShellHeader>
  );
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
          <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl gradient-brown px-4 py-2 text-sm font-bold shadow-luxury">
            <Upload className="size-4" /> {uploading ? "جارِ الرفع..." : "رفع ملف"}
            <input ref={fileInput} type="file" className="hidden" onChange={upload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <FilesIcon className="size-10 mx-auto mb-3 opacity-40" />
            لا توجد ملفات {view === "archived" ? "مؤرشفة" : ""} حالياً.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map(f => <FileRow key={f.id} f={f} onArchive={archive} onRemove={remove} onCopy={copyLink} onShare={shareExternal} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function FileRow({ f, onArchive, onRemove, onCopy, onShare }: any) {
  const [copied, setCopied] = useState(false);
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
            رفع بواسطة {SENDER_LABEL[f.uploaded_by as Sender] ?? f.uploaded_by} • {new Date(f.created_at).toLocaleString("ar")}
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

function ChatPanel({ doctor, actor, actorName }: { doctor: Doctor; actor: Sender; actorName: string }) {
  const [msgs, setMsgs] = useState<DocMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = actor;

  const load = useCallback(async () => {
    const { data } = await supabase.from("doctor_messages").select("*")
      .eq("doctor_slot", doctor.slot).order("created_at");
    setMsgs((data as DocMsg[]) ?? []);
    const readField =
      me === "doctor" ? "read_by_doctor" :
      me === "designer" ? "read_by_designer" :
      me === "admin" ? "read_by_admin" :
      me === "secretary" ? "read_by_secretary" : "read_by_technician";
    await (supabase.from("doctor_messages") as any).update({ [readField]: true })
      .eq("doctor_slot", doctor.slot).neq("sender", me).eq(readField, false);
  }, [doctor.slot, me]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`doctor-msgs-${doctor.slot}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_messages", filter: `doctor_slot=eq.${doctor.slot}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctor.slot, load]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    setText("");
    setSending(true);
    const { error } = await supabase.from("doctor_messages").insert({
      doctor_slot: doctor.slot, sender: me, sender_name: actorName, content: t, message_type: "text",
    });
    setSending(false);
    if (error) toast.error(error.message);
  }

  async function sendAttachment(file: File, kind: "file" | "audio") {
    setSending(true);
    const safeName = file.name || (kind === "audio" ? `voice-${Date.now()}.webm` : `file-${Date.now()}`);
    const path = `${doctor.slot}/chat/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("doctor-files").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) { setSending(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("doctor-files").getPublicUrl(path);
    const { error } = await supabase.from("doctor_messages").insert({
      doctor_slot: doctor.slot, sender: me, sender_name: actorName,
      content: kind === "audio" ? "🎤 تسجيل صوتي" : safeName,
      message_type: kind,
      attachment_url: pub.publicUrl, attachment_name: safeName,
      attachment_mime: file.type || null, attachment_size: file.size,
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success(kind === "audio" ? "تم إرسال التسجيل" : "تم إرسال الملف");
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) await sendAttachment(f, "file");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("التسجيل غير مدعوم في هذا المتصفح"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        await sendAttachment(file, "audio");
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setRecordSec(0);
      recTimerRef.current = window.setInterval(() => setRecordSec(s => s + 1), 1000);
    } catch (e: any) {
      toast.error("تعذر الوصول للميكروفون");
    }
  }

  function stopRecording(cancel = false) {
    const mr = recorderRef.current;
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);
    if (!mr) return;
    if (cancel) {
      mr.ondataavailable = null as any;
      mr.onstop = () => mr.stream?.getTracks().forEach(t => t.stop());
    }
    try { mr.stop(); } catch {}
    recorderRef.current = null;
  }

  return (
    <div className="rounded-2xl bg-card border border-border flex flex-col h-[600px] shadow-luxury">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="font-bold text-sm flex items-center gap-2">
          <MessageSquare className="size-4 text-gold" /> محادثة جماعية: الطبيب • المصمم • الفني • السكرتارية • الإدارة
        </div>
        <span className={`text-[11px] font-bold rounded-full px-3 py-1 ${SENDER_COLOR[me]}`}>
          أنت: {SENDER_LABEL[me]}{actorName && me !== "doctor" ? ` — ${actorName}` : ""}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {msgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">ابدأ المحادثة الآن.</div>}
        {msgs.map(m => {
          const mine = m.sender === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? SENDER_COLOR[m.sender] : "bg-card border border-border"}`}>
                <div className={`text-[10px] font-bold mb-0.5 ${mine ? "opacity-80" : "text-gold"}`}>
                  {SENDER_LABEL[m.sender]}{m.sender_name ? ` • ${m.sender_name}` : (m.sender === "doctor" ? ` • ${doctor.name}` : "")}
                </div>
                {m.message_type === "audio" && m.attachment_url ? (
                  <audio controls src={m.attachment_url} className="mt-1 max-w-full" />
                ) : m.message_type === "file" && m.attachment_url ? (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" download={m.attachment_name ?? undefined}
                    className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 ${mine ? "border-white/30 bg-white/10" : "border-border bg-muted/40"}`}>
                    <FileText className="size-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold truncate">{m.attachment_name}</div>
                      <div className="text-[10px] opacity-70">
                        {m.attachment_size ? `${(m.attachment_size/1024).toFixed(1)} KB` : ""} — اضغط للتحميل
                      </div>
                    </div>
                    <Download className="size-4 ms-auto" />
                  </a>
                ) : (
                  <div className="leading-relaxed whitespace-pre-wrap">{m.content}</div>
                )}
                <div className="text-[10px] opacity-60 mt-1">{new Date(m.created_at).toLocaleTimeString("ar")}</div>
              </div>
            </div>
          );
        })}
      </div>

      {recording ? (
        <div className="p-3 border-t border-border flex items-center gap-3 bg-rose-50 dark:bg-rose-950/20">
          <span className="size-3 rounded-full bg-rose-600 animate-pulse" />
          <span className="text-sm font-mono">
            جارِ التسجيل... {String(Math.floor(recordSec/60)).padStart(2,"0")}:{String(recordSec%60).padStart(2,"0")}
          </span>
          <button onClick={() => stopRecording(true)} className="ms-auto rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold flex items-center gap-1 hover:bg-destructive hover:text-destructive-foreground">
            <X className="size-4" /> إلغاء
          </button>
          <button onClick={() => stopRecording(false)} className="rounded-lg gradient-gold px-3 py-2 text-xs font-bold flex items-center gap-1 shadow-gold text-gold-foreground">
            <Square className="size-4" /> إيقاف وإرسال
          </button>
        </div>
      ) : (
        <div className="p-3 border-t border-border flex gap-2 items-end">
          <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
          <button onClick={() => fileInputRef.current?.click()} disabled={sending}
            className="rounded-xl border border-border p-2.5 hover:border-gold disabled:opacity-50" title="إرفاق ملف">
            <Paperclip className="size-4" />
          </button>
          <button onClick={startRecording} disabled={sending}
            className="rounded-xl border border-border p-2.5 hover:border-gold disabled:opacity-50" title="تسجيل صوتي">
            <Mic className="size-4" />
          </button>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendText()}
            disabled={sending}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-gold disabled:opacity-50"
            placeholder="اكتب رسالة..." />
          <button onClick={sendText} disabled={sending || !text.trim()}
            className="rounded-xl gradient-gold p-3 shadow-gold disabled:opacity-50">
            <Send className="size-4 text-gold-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationsListener({ doctor, actor, onUnread }: { doctor: Doctor; actor: Sender; onUnread: (n: number) => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const me = actor;
  const readField =
    me === "doctor" ? "read_by_doctor" :
    me === "designer" ? "read_by_designer" :
    me === "admin" ? "read_by_admin" :
    me === "secretary" ? "read_by_secretary" : "read_by_technician";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ctx = typeof AudioContext !== "undefined" ? new AudioContext() : null;
    function beep() {
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.type = "sine";
      g.gain.value = 0.0001;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.stop(ctx.currentTime + 0.42);
    }

    const refreshUnread = async () => {
      const { count } = await supabase.from("doctor_messages")
        .select("id", { count: "exact", head: true })
        .eq("doctor_slot", doctor.slot).neq("sender", me).eq(readField, false);
      onUnread(count ?? 0);
    };
    refreshUnread();

    const ch = supabase.channel(`doctor-msgs-notif-${doctor.slot}-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "doctor_messages", filter: `doctor_slot=eq.${doctor.slot}` }, (payload: any) => {
        const m = payload.new as DocMsg;
        if (m.sender !== me) {
          beep();
          const who = SENDER_LABEL[m.sender] + (m.sender_name ? ` — ${m.sender_name}` : "");
          toast(`رسالة جديدة من ${who}`, { description: m.content });
          if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification("Zircon Journey — رسالة جديدة", { body: `${who}: ${m.content}` }); } catch {}
          }
          refreshUnread();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); ctx?.close().catch(()=>{}); };
  }, [doctor.slot, me]);

  return <audio ref={audioRef} hidden />;
}
