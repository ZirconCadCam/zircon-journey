import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ATTACHMENTS_BUCKET, ROLE_COLOR, ROLE_LABEL, STAFF_ROLES, getSignedUrl,
  summarizeParticipants,
  type ChatConversation, type ChatMessage, type RoleKey,
} from "@/lib/chat";
import {
  Send, Paperclip, Mic, Square, X, MessageSquare, Plus, Archive, ArchiveRestore,
  Search, FileText, Download, ChevronRight, Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  doctorSlot: number;
  doctorName: string;
  me: RoleKey;
  myName: string;
}

export function ChatModule({ doctorSlot, doctorName, me, myName }: Props) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [filterRole, setFilterRole] = useState<RoleKey | "all">("all");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("chat_conversations")
      .select("*")
      .eq("doctor_slot", doctorSlot)
      .order("last_message_at", { ascending: false });
    // Privacy: only participants see the conversation.
    // Admin override: admin can view ALL conversations across the portal as a supervisor.
    const list = ((data ?? []) as ChatConversation[]).filter(c =>
      me === "admin" ? true : c.participants.includes(me)
    );
    setConversations(list);
  }, [doctorSlot, me]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`chat-conv-${doctorSlot}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `doctor_slot=eq.${doctorSlot}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctorSlot, load]);

  const visible = useMemo(() => conversations.filter(c =>
    (view === "active" ? !c.archived : c.archived)
    && (filterRole === "all" || c.participants.includes(filterRole))
    && (!search || (c.title ?? "").toLowerCase().includes(search.toLowerCase())
        || summarizeParticipants(c.participants).toLowerCase().includes(search.toLowerCase()))
  ), [conversations, view, filterRole, search]);

  const selected = conversations.find(c => c.id === selectedId) ?? null;

  if (selected) {
    return <ConversationView conv={selected} me={me} myName={myName} doctorName={doctorName}
      onBack={() => setSelectedId(null)} onChange={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={()=>setView("active")} className={`rounded-full px-4 py-1.5 text-xs font-bold border ${view==="active"?"gradient-gold border-gold":"bg-card border-border"}`}>المحادثات النشطة</button>
          <button onClick={()=>setView("archived")} className={`rounded-full px-4 py-1.5 text-xs font-bold border ${view==="archived"?"gradient-gold border-gold":"bg-card border-border"}`}>
            <Archive className="inline size-3 me-1" /> الأرشيف
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filterRole} onChange={e=>setFilterRole(e.target.value as any)}
            className="rounded-xl border border-input bg-card px-3 py-2 text-xs font-bold outline-none focus:border-gold">
            <option value="all">كل المسؤولين</option>
            {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            {me !== "doctor" && <option value="doctor">الطبيب</option>}
          </select>
          <div className="relative">
            <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث..."
              className="rounded-xl border border-input bg-card pr-9 pl-3 py-2 text-xs outline-none focus:border-gold w-40" />
          </div>
          <button onClick={()=>setComposing(true)}
            className="rounded-xl gradient-brown px-4 py-2 text-xs font-bold shadow-luxury inline-flex items-center gap-1.5">
            <Plus className="size-4" /> محادثة جديدة
          </button>
        </div>
      </div>

      {composing && (
        <ComposeNew doctorSlot={doctorSlot} me={me} myName={myName}
          onClose={()=>setComposing(false)}
          onCreated={(id)=>{ setComposing(false); setSelectedId(id); load(); }} />
      )}

      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
        {visible.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <MessageSquare className="size-10 mx-auto mb-3 opacity-40" />
            لا توجد محادثات {view === "archived" ? "مؤرشفة" : "حالياً"}.
            {view === "active" && <div className="mt-2 text-xs">ابدأ بإنشاء محادثة جديدة.</div>}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map(c => <ConversationRow key={c.id} conv={c} me={me} onOpen={()=>setSelectedId(c.id)} onChange={load} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ conv, me, onOpen, onChange }: { conv: ChatConversation; me: RoleKey; onOpen: () => void; onChange: () => void }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    (async () => {
      const { count } = await supabase.from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .neq("sender", me)
        .not("read_by", "cs", `{${me}}`);
      setUnread(count ?? 0);
    })();
  }, [conv.id, conv.last_message_at, me]);

  async function toggleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("chat_conversations").update({ archived: !conv.archived }).eq("id", conv.id);
    onChange();
  }
  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("حذف هذه المحادثة وكل رسائلها؟")) return;
    await supabase.from("chat_conversations").delete().eq("id", conv.id);
    onChange();
  }

  return (
    <li onClick={onOpen} className="p-4 hover:bg-muted/40 transition cursor-pointer flex items-center gap-3">
      <div className="size-11 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
        <MessageSquare className="size-5 text-gold-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-bold text-sm truncate">{conv.title || summarizeParticipants(conv.participants)}</div>
          {unread > 0 && <span className="rounded-full gradient-gold text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] grid place-items-center shadow-gold text-gold-foreground">{unread}</span>}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-1">
          {conv.participants.map(p => (
            <span key={p} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_COLOR[p]}`}>{ROLE_LABEL[p]}</span>
          ))}
          <span className="ms-1">• آخر نشاط: {new Date(conv.last_message_at).toLocaleString("ar")}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={toggleArchive} className="rounded-lg border border-border p-2 hover:border-gold" title={conv.archived?"استرجاع":"أرشفة"}>
          {conv.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </button>
        <button onClick={remove} className="rounded-lg border border-border p-2 hover:bg-destructive hover:text-destructive-foreground" title="حذف">
          <Trash2 className="size-4" />
        </button>
        <ChevronRight className="size-4 text-muted-foreground rotate-180" />
      </div>
    </li>
  );
}

function ComposeNew({ doctorSlot, me, myName, onClose, onCreated }: {
  doctorSlot: number; me: RoleKey; myName: string;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Set<RoleKey>>(new Set());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  // Pickable participants exclude "me"
  const choices: RoleKey[] = me === "doctor" ? STAFF_ROLES : ["doctor", ...STAFF_ROLES.filter(r => r !== me)];

  function toggle(r: RoleKey) {
    const n = new Set(selected);
    if (n.has(r)) n.delete(r); else n.add(r);
    setSelected(n);
  }

  async function create() {
    if (selected.size === 0) { toast.error("اختر مسؤولاً واحداً على الأقل"); return; }
    setBusy(true);
    const participants = Array.from(new Set<RoleKey>([me, ...selected]));
    const { data, error } = await supabase.from("chat_conversations").insert({
      doctor_slot: doctorSlot,
      participants,
      title: title.trim() || null,
      created_by: me,
    }).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "تعذر إنشاء المحادثة"); return; }
    toast.success("تم إنشاء المحادثة");
    onCreated((data as any).id);
  }

  return (
    <div className="rounded-2xl bg-card border-2 border-gold p-5 shadow-luxury">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold flex items-center gap-2"><Plus className="size-4 text-gold" /> محادثة جديدة</div>
        <button onClick={onClose} className="rounded-lg border border-border p-1.5 hover:border-gold"><X className="size-4" /></button>
      </div>
      <div className="text-xs text-muted-foreground mb-2">اختر طرف أو أكثر للمحادثة:</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {choices.map(r => {
          const on = selected.has(r);
          return (
            <button key={r} onClick={()=>toggle(r)}
              className={`rounded-full px-4 py-2 text-xs font-bold border-2 transition ${on?ROLE_COLOR[r]+" border-transparent":"bg-card border-border hover:border-gold"}`}>
              {ROLE_LABEL[r]}
            </button>
          );
        })}
      </div>
      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان اختياري للمحادثة..."
        className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-gold mb-3" />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-xs font-bold">إلغاء</button>
        <button onClick={create} disabled={busy || selected.size === 0}
          className="rounded-lg gradient-brown px-5 py-2 text-xs font-bold shadow-luxury disabled:opacity-50">
          {busy ? "جاري الإنشاء..." : "بدء المحادثة"}
        </button>
      </div>
    </div>
  );
}

function ConversationView({ conv, me, myName, doctorName, onBack, onChange }: {
  conv: ChatConversation; me: RoleKey; myName: string; doctorName: string;
  onBack: () => void; onChange: () => void;
}) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("chat_messages").select("*")
      .eq("conversation_id", conv.id).order("created_at");
    const list = (data ?? []) as ChatMessage[];
    setMsgs(list);
    // mark as read by me (for messages I haven't read)
    const unread = list.filter(m => m.sender !== me && !(m.read_by ?? []).includes(me));
    if (unread.length) {
      await Promise.all(unread.map(m => supabase.from("chat_messages")
        .update({ read_by: [...(m.read_by ?? []), me] }).eq("id", m.id)));
    }
  }, [conv.id, me]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`chat-msgs-${conv.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conv.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conv.id, load]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    setText(""); setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: conv.id, sender: me, sender_name: myName, content: t, message_type: "text", read_by: [me],
    });
    setSending(false);
    if (error) toast.error(error.message);
  }

  async function sendAttachment(file: File, kind: "file" | "audio") {
    setSending(true);
    const safeName = file.name || (kind === "audio" ? `voice-${Date.now()}.webm` : `file-${Date.now()}`);
    const path = `${conv.doctor_slot}/${conv.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) { setSending(false); toast.error(upErr.message); return; }
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: conv.id, sender: me, sender_name: myName,
      content: kind === "audio" ? "🎤 تسجيل صوتي" : safeName,
      message_type: kind,
      attachment_path: path, attachment_name: safeName,
      attachment_mime: file.type || null, attachment_size: file.size,
      read_by: [me],
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
      setRecording(true); setRecordSec(0);
      recTimerRef.current = window.setInterval(() => setRecordSec(s => s + 1), 1000);
    } catch { toast.error("تعذر الوصول للميكروفون"); }
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
    <div className="rounded-2xl bg-card border border-border flex flex-col h-[640px] shadow-luxury">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="rounded-lg border border-border p-2 hover:border-gold shrink-0" title="عودة">
            <ChevronRight className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">
              {conv.title || summarizeParticipants(conv.participants)}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {conv.participants.map(p => (
                <span key={p} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_COLOR[p]}`}>{ROLE_LABEL[p]}</span>
              ))}
            </div>
          </div>
        </div>
        <span className={`text-[11px] font-bold rounded-full px-3 py-1 ${ROLE_COLOR[me]}`}>
          أنت: {ROLE_LABEL[me]}{myName ? ` — ${myName}` : ""}
        </span>
      </div>

      {me === "admin" && !conv.participants.includes("admin") && (
        <div className="px-4 py-2 border-b border-border bg-rose-50 dark:bg-rose-950/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-rose-800 dark:text-rose-200 font-bold">
            👁 أنت تشاهد محادثة خاصة كمشرف. لن يراك أحد إلا إذا انضممت كطرف ثالث.
          </div>
          <button
            onClick={async () => {
              const next = Array.from(new Set<RoleKey>([...conv.participants, "admin"]));
              const { error } = await supabase.from("chat_conversations")
                .update({ participants: next }).eq("id", conv.id);
              if (error) toast.error(error.message);
              else { toast.success("تم انضمامك كطرف ثالث"); onChange(); }
            }}
            className="rounded-lg gradient-brown px-3 py-1.5 text-xs font-bold shadow-luxury">
            الانضمام كطرف ثالث
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {msgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">ابدأ المحادثة الآن.</div>}
        {msgs.map(m => {
          const mine = m.sender === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? ROLE_COLOR[m.sender] : "bg-card border border-border"}`}>
                <div className={`text-[10px] font-bold mb-0.5 ${mine ? "opacity-80" : "text-gold"}`}>
                  {ROLE_LABEL[m.sender]}{m.sender_name ? ` • ${m.sender_name}` : (m.sender === "doctor" ? ` • ${doctorName}` : "")}
                </div>
                {m.message_type === "audio" ? (
                  <AudioBubble path={m.attachment_path!} />
                ) : m.message_type === "file" ? (
                  <FileBubble msg={m} mine={mine} />
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
      ) : me === "admin" && !conv.participants.includes("admin") ? (
        <div className="p-3 border-t border-border text-center text-xs text-muted-foreground">
          وضع المراقبة فقط — انضم كطرف ثالث للمشاركة في المحادثة.
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

function FileBubble({ msg, mine }: { msg: ChatMessage; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    if (!msg.attachment_path) return;
    setBusy(true);
    const url = await getSignedUrl(msg.attachment_path, 300);
    setBusy(false);
    if (!url) { toast.error("تعذر إنشاء رابط التحميل"); return; }
    // open download in new tab; signed URL expires in 5 min
    window.open(url, "_blank", "noopener");
  }
  return (
    <button onClick={download} disabled={busy}
      className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-start w-full ${mine ? "border-white/30 bg-white/10" : "border-border bg-muted/40"} disabled:opacity-50`}>
      <FileText className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate">{msg.attachment_name}</div>
        <div className="text-[10px] opacity-70">
          {msg.attachment_size ? `${(msg.attachment_size/1024).toFixed(1)} KB` : ""} — اضغط للتحميل (رابط آمن مؤقت)
        </div>
      </div>
      <Download className="size-4 ms-auto shrink-0" />
    </button>
  );
}

function AudioBubble({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function loadAudio() {
    setBusy(true);
    const u = await getSignedUrl(path, 600);
    setBusy(false);
    if (!u) { toast.error("تعذر تحميل التسجيل"); return; }
    setUrl(u);
  }
  if (!url) {
    return (
      <button onClick={loadAudio} disabled={busy}
        className="mt-1 flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold">
        <Mic className="size-4" /> {busy ? "جارِ التحميل..." : "تشغيل التسجيل الصوتي"}
      </button>
    );
  }
  return <audio controls autoPlay src={url} className="mt-1 max-w-full" />;
}
