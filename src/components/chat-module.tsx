import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ATTACHMENTS_BUCKET, ROLE_COLOR, ROLE_LABEL, STAFF_ROLES, getSignedUrl,
  summarizeParticipants,
  type ChatConversation, type ChatMessage, type RoleKey,
} from "@/lib/chat";
import {
  Send, Paperclip, Mic, Square, X, MessageSquare, Plus, Archive, ArchiveRestore,
  Search, FileText, Download, ChevronRight, Trash2, Check, CheckCheck, Clock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface Props {
  doctorSlot: number;
  doctorName: string;
  me: RoleKey;
  myName: string;
}

type LocalMsg = ChatMessage & { _local?: "sending" | "uploading" | "failed"; _progress?: number };

function newId() {
  return (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

/** Upload via signed URL with XHR to track progress and support arbitrarily large files. */
async function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "تعذر إنشاء رابط الرفع");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
    xhr.onerror = () => reject(new Error("فشل الاتصال بالخادم"));
    xhr.send(file);
  });
}

function ConversationView({ conv, me, myName, doctorName, onBack, onChange }: {
  conv: ChatConversation; me: RoleKey; myName: string; doctorName: string;
  onBack: () => void; onChange: () => void;
}) {
  const [msgs, setMsgs] = useState<LocalMsg[]>([]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load + mark as read.
  const initialLoad = useCallback(async () => {
    const { data } = await supabase.from("chat_messages").select("*")
      .eq("conversation_id", conv.id).order("created_at");
    const list = (data ?? []) as ChatMessage[];
    setMsgs(list);
    const unread = list.filter(m => m.sender !== me && !(m.read_by ?? []).includes(me));
    if (unread.length) {
      await Promise.all(unread.map(m => supabase.from("chat_messages")
        .update({ read_by: Array.from(new Set([...(m.read_by ?? []), me])) }).eq("id", m.id)));
    }
  }, [conv.id, me]);

  useEffect(() => {
    initialLoad();
    const ch = supabase.channel(`chat-msgs-${conv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conv.id}` }, (payload: any) => {
        const m = payload.new as ChatMessage;
        setMsgs(prev => {
          const idx = prev.findIndex(x => x.id === m.id);
          if (idx >= 0) { const next = [...prev]; next[idx] = m; return next; }
          return [...prev, m];
        });
        // mark read if not from me
        if (m.sender !== me && !(m.read_by ?? []).includes(me)) {
          supabase.from("chat_messages")
            .update({ read_by: Array.from(new Set([...(m.read_by ?? []), me])) })
            .eq("id", m.id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conv.id}` }, (payload: any) => {
        const m = payload.new as ChatMessage;
        setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, ...m, _local: undefined, _progress: undefined } : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conv.id, me, initialLoad]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    setText("");
    const id = newId();
    const optimistic: LocalMsg = {
      id, conversation_id: conv.id, sender: me, sender_name: myName,
      content: t, message_type: "text",
      attachment_path: null, attachment_name: null, attachment_size: null, attachment_mime: null,
      read_by: [me], created_at: new Date().toISOString(), _local: "sending",
    };
    setMsgs(prev => [...prev, optimistic]);
    const { error } = await supabase.from("chat_messages").insert({
      id, conversation_id: conv.id, sender: me, sender_name: myName,
      content: t, message_type: "text", read_by: [me],
    });
    if (error) {
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m));
      toast.error(error.message);
    } else {
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: undefined } : m));
    }
  }

  async function sendAttachment(file: File, kind: "file" | "audio") {
    const id = newId();
    const safeName = file.name || (kind === "audio" ? `voice-${Date.now()}.webm` : `file-${Date.now()}`);
    const path = `${conv.doctor_slot}/${conv.id}/${Date.now()}-${safeName}`;
    const optimistic: LocalMsg = {
      id, conversation_id: conv.id, sender: me, sender_name: myName,
      content: kind === "audio" ? "🎤 تسجيل صوتي" : safeName,
      message_type: kind,
      attachment_path: path, attachment_name: safeName,
      attachment_mime: file.type || null, attachment_size: file.size,
      read_by: [me], created_at: new Date().toISOString(),
      _local: "uploading", _progress: 0,
    };
    setMsgs(prev => [...prev, optimistic]);
    try {
      await uploadWithProgress(path, file, (pct) => {
        setMsgs(prev => prev.map(m => m.id === id ? { ...m, _progress: pct } : m));
      });
      const { error } = await supabase.from("chat_messages").insert({
        id, conversation_id: conv.id, sender: me, sender_name: myName,
        content: optimistic.content, message_type: kind,
        attachment_path: path, attachment_name: safeName,
        attachment_mime: file.type || null, attachment_size: file.size,
        read_by: [me],
      });
      if (error) throw error;
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: undefined, _progress: 100 } : m));
    } catch (e: any) {
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m));
      toast.error(e.message ?? "فشل الإرسال");
    }
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

  const otherParticipants = conv.participants.filter(p => p !== me);

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
                {m._local === "uploading" && (
                  <div className="mt-2">
                    <Progress value={m._progress ?? 0} className="h-1.5 bg-white/20" />
                    <div className="text-[10px] opacity-70 mt-1">{m._progress ?? 0}% • جارِ الرفع...</div>
                  </div>
                )}
                <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1.5 justify-end">
                  <span>{new Date(m.created_at).toLocaleTimeString("ar")}</span>
                  {mine && <MessageStatus msg={m} otherParticipants={otherParticipants} />}
                </div>
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
          <button onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-border p-2.5 hover:border-gold" title="إرفاق ملف (أي حجم)">
            <Paperclip className="size-4" />
          </button>
          <button onClick={startRecording}
            className="rounded-xl border border-border p-2.5 hover:border-gold" title="تسجيل صوتي">
            <Mic className="size-4" />
          </button>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendText(); } }}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-gold"
            placeholder="اكتب رسالة..." />
          <button onClick={sendText} disabled={!text.trim()}
            className="rounded-xl gradient-gold p-3 shadow-gold disabled:opacity-50">
            <Send className="size-4 text-gold-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}

function MessageStatus({ msg, otherParticipants }: { msg: LocalMsg; otherParticipants: RoleKey[] }) {
  if (msg._local === "failed") return <span title="فشل الإرسال — أعد المحاولة"><AlertCircle className="size-3.5 text-rose-300" /></span>;
  if (msg._local === "sending" || msg._local === "uploading") return <span title="جارِ الإرسال"><Clock className="size-3.5 opacity-80" /></span>;
  // Server-confirmed message
  const readers = (msg.read_by ?? []).filter(r => otherParticipants.includes(r));
  if (readers.length > 0) {
    return <span title={`قرأها: ${readers.map(r => ROLE_LABEL[r]).join("، ")}`}><CheckCheck className="size-3.5 text-sky-300" /></span>;
  }
  // Delivered = stored on server (any other participant will receive via realtime when online)
  return <span title="تم التسليم"><Check className="size-3.5 opacity-90" /></span>;
}

function FileBubble({ msg, mine }: { msg: LocalMsg; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    if (!msg.attachment_path) return;
    setBusy(true);
    const url = await getSignedUrl(msg.attachment_path, 300);
    setBusy(false);
    if (!url) { toast.error("تعذر إنشاء رابط التحميل"); return; }
    window.open(url, "_blank", "noopener");
  }
  const sizeLabel = msg.attachment_size
    ? msg.attachment_size > 1024*1024
      ? `${(msg.attachment_size/1024/1024).toFixed(1)} MB`
      : `${(msg.attachment_size/1024).toFixed(1)} KB`
    : "";
  return (
    <button onClick={download} disabled={busy || !!msg._local}
      className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-start w-full ${mine ? "border-white/30 bg-white/10" : "border-border bg-muted/40"} disabled:opacity-50`}>
      <FileText className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate">{msg.attachment_name}</div>
        <div className="text-[10px] opacity-70">
          {sizeLabel}{sizeLabel ? " — " : ""}{msg._local ? "جارِ الرفع..." : "اضغط للتحميل (رابط آمن مؤقت)"}
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
