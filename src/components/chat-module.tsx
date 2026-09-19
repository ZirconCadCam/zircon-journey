import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ATTACHMENTS_BUCKET, ROLE_COLOR, ROLE_LABEL, STAFF_ROLES, getSignedUrl,
  summarizeParticipants,
  type ChatConversation, type ChatMessage, type RoleKey,
} from "@/lib/chat";
import { startResumableUpload, type ResumableHandle } from "@/lib/resumable-upload";
import { saveToCenter, downloadUrlToCenter, fileManagerSupported, pickCenterFolder, getCenterFolder, CENTER_FOLDER_NAME } from "@/lib/file-manager";
import { InAppFileViewer } from "@/components/in-app-file-viewer";
import {
  Send, Paperclip, Mic, Square, X, MessageSquare, Plus, Archive, ArchiveRestore,
  Search, FileText, Download, ChevronRight, Trash2, Check, CheckCheck, Clock, AlertCircle,
  Copy, Reply, Share2, Save, FolderOpen, Pause, Play, RotateCw, Pencil, ExternalLink, Loader2,
} from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { compareByCreatedAt, formatChatTime, formatChatFull, formatDayLabel, isNewDay } from "@/lib/time";
import { getDoctorAvatar } from "@/lib/doctor-avatars";
import { getOverrideUrl, roleSubject, useAvatarVersion } from "@/lib/avatar-store";
import { removePrivateObjects } from "@/lib/secure-storage";



interface Props {
  doctorSlot: number;
  doctorName: string;
  me: RoleKey;
  myName: string;
  /** When set, only show conversations whose title starts with `[caseCode]`,
   * and auto-prefix new conversations with that tag. */
  caseCode?: string;
  caseLabel?: string;
}

type LocalMsg = ChatMessage & {
  _local?: "sending" | "uploading" | "failed" | "paused";
  _progress?: number;
  _file?: File;          // kept in memory for resume after failure
  _replyToId?: string;   // local-only reply reference
};

const ARCHIVED_KEY = (convId: string) => `zircon_msg_archived_${convId}`;

function newId() {
  return (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatModule({ doctorSlot, doctorName, me, myName, caseCode, caseLabel }: Props) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [filterRole, setFilterRole] = useState<RoleKey | "all">("all");
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const titlePrefix = caseCode ? `[${caseCode}]` : null;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("chat_conversations").select("*")
      .eq("doctor_slot", doctorSlot)
      .order("last_message_at", { ascending: false });
    const list = ((data ?? []) as ChatConversation[]).filter(c =>
      (me === "admin" ? true : c.participants.includes(me))
      && (!titlePrefix || (c.title ?? "").startsWith(titlePrefix))
    );
    setConversations(list);
  }, [doctorSlot, me, titlePrefix]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`chat-conv-${doctorSlot}${titlePrefix ? "-" + titlePrefix : ""}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `doctor_slot=eq.${doctorSlot}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [doctorSlot, load, titlePrefix]);

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
          <FileManagerBadge />
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
          titlePrefix={titlePrefix} caseLabel={caseLabel}
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

function FileManagerBadge() {
  const [linked, setLinked] = useState(false);
  useEffect(() => { (async () => setLinked(!!(await getCenterFolder())))(); }, []);
  if (!fileManagerSupported()) return null;
  return (
    <button
      onClick={async () => {
        const ok = await pickCenterFolder();
        setLinked(!!(await getCenterFolder()));
        if (ok) toast.success(`تم ربط مجلد "${CENTER_FOLDER_NAME}"`);
      }}
      className={`rounded-full px-3 py-1.5 text-[11px] font-bold border inline-flex items-center gap-1.5 ${linked ? "bg-emerald-600 text-white border-emerald-700" : "bg-card border-border hover:border-gold"}`}
      title={linked ? `محفوظات تحفظ في "${CENTER_FOLDER_NAME}"` : `اربط مجلد "${CENTER_FOLDER_NAME}" على جهازك`}>
      <FolderOpen className="size-3.5" /> {linked ? "مدير الملفات مرتبط" : "ربط مدير الملفات"}
    </button>
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

function ComposeNew({ doctorSlot, me, myName, onClose, onCreated, titlePrefix, caseLabel }: {
  doctorSlot: number; me: RoleKey; myName: string;
  onClose: () => void; onCreated: (id: string) => void;
  titlePrefix?: string | null; caseLabel?: string;
}) {
  const [selected, setSelected] = useState<Set<RoleKey>>(new Set());
  const [title, setTitle] = useState(titlePrefix && caseLabel ? caseLabel : "");
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
    const composedTitle = titlePrefix
      ? `${titlePrefix} ${title.trim() || caseLabel || ""}`.trim()
      : (title.trim() || null);
    const { data, error } = await supabase.from("chat_conversations").insert({
      doctor_slot: doctorSlot, participants,
      title: composedTitle, created_by: me,
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
  const [msgs, setMsgs] = useState<LocalMsg[]>([]);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(ARCHIVED_KEY(conv.id)) || "[]")); }
    catch { return new Set(); }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [replyTo, setReplyTo] = useState<LocalMsg | null>(null);
  const [menuFor, setMenuFor] = useState<{ msg: LocalMsg; x: number; y: number } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const uploadHandles = useRef<Map<string, ResumableHandle>>(new Map());

  function persistArchived(next: Set<string>) {
    setArchivedIds(new Set(next));
    if (typeof window !== "undefined")
      localStorage.setItem(ARCHIVED_KEY(conv.id), JSON.stringify(Array.from(next)));
  }

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
          // Preserve local upload state (_local/_progress/_file) when the
          // server echo of our own optimistic message arrives.
          const next = idx >= 0
            ? prev.map(x => x.id === m.id
                ? { ...m, _local: x._local, _progress: x._progress, _file: x._file }
                : x)
            : [...prev, m];
          // Keep strict chronological order by the server timestamp so every
          // participant sees the same sequence regardless of arrival order.
          return next.slice().sort(compareByCreatedAt);
        });
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

  // Auto-resume failed/paused uploads when network comes back
  useEffect(() => {
    function onOnline() {
      const failed = msgs.filter(m => (m._local === "failed" || m._local === "paused") && m._file);
      if (failed.length === 0) return;
      toast.info(`استئناف ${failed.length} رفع متوقف...`);
      failed.forEach(m => resumeUpload(m));
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  function buildContent(raw: string): string {
    if (!replyTo) return raw;
    const snippet = (replyTo.message_type === "text"
      ? replyTo.content
      : replyTo.attachment_name || replyTo.content || "ملف"
    ).slice(0, 120);
    return `↪ رداً على ${ROLE_LABEL[replyTo.sender]}: «${snippet}»\n${raw}`;
  }

  async function sendText() {
    const t = text.trim();
    if (!t) return;
    const finalContent = buildContent(t);
    setText(""); setReplyTo(null);
    const id = newId();
    const optimistic: LocalMsg = {
      id, conversation_id: conv.id, sender: me, sender_name: myName,
      content: finalContent, message_type: "text",
      attachment_path: null, attachment_name: null, attachment_size: null, attachment_mime: null,
      read_by: [me], created_at: new Date().toISOString(), _local: "sending",
    };
    setMsgs(prev => [...prev, optimistic]);
    const { error } = await supabase.from("chat_messages").insert({
      id, conversation_id: conv.id, sender: me, sender_name: myName,
      content: finalContent, message_type: "text", read_by: [me],
    });
    if (error) {
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m));
      toast.error(error.message);
    } else {
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: undefined } : m));
    }
  }

  async function startUpload(id: string, path: string, file: File) {
    const { registerUpload } = await import("@/lib/transfer-manager");
    const tracker = registerUpload(file.name || "ملف", {
      pause: () => { try { uploadHandles.current.get(id)?.pause(); } catch {} tracker.paused();
        setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "paused" as any } : m)); },
      resume: () => { try { uploadHandles.current.get(id)?.resume(); } catch {} tracker.resumed();
        setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "uploading" } : m)); },
      cancel: () => { try { uploadHandles.current.get(id)?.abort(); } catch {} uploadHandles.current.delete(id);
        tracker.remove(); setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m)); },
    });
    try {
      const handle = await startResumableUpload({
        path, file,
        onProgress: (pct, loaded, total) => {
          tracker.update(pct, loaded, total);
          setMsgs(prev => prev.map(m => m.id === id ? { ...m, _progress: pct, _local: "uploading" } : m));
        },
        onError: (err) => {
          tracker.fail();
          setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m));
          toast.error("توقف الرفع — سيتم الاستئناف تلقائياً عند عودة الاتصال");
          console.error("[upload]", err);
        },
        onSuccess: async () => {
          uploadHandles.current.delete(id);
          const cur = msgs.find(m => m.id === id);
          const insertContent = cur?.content ?? (file.name || "ملف");
          const kind = (cur?.message_type ?? "file") as "file" | "audio";
          const { error } = await supabase.from("chat_messages").insert({
            id, conversation_id: conv.id, sender: me, sender_name: myName,
            content: insertContent, message_type: kind,
            attachment_path: path, attachment_name: file.name,
            attachment_mime: file.type || null, attachment_size: file.size,
            read_by: [me],
          });
          if (error) {
            tracker.fail();
            setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m));
            toast.error(error.message);
          } else {
            tracker.done();
            setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: undefined, _progress: 100, _file: undefined } : m));
            // Mirror every chat attachment to the clinic's Telegram group.
            const { queueTelegram } = await import("@/lib/telegram-outbox");
            void queueTelegram(
              `📎 إرسال تلقائي — مرفق من المحادثة\n──────────────\n📤 المصدر: ${ROLE_LABEL[me]} (${myName})\n📁 الملف: ${file.name || "ملف"}`,
              [{ bucket: "chat-attachments", path, filename: file.name || "ملف" }],
            );
          }
        },
      });
      uploadHandles.current.set(id, handle);
    } catch (e: any) {
      tracker.fail();
      setMsgs(prev => prev.map(m => m.id === id ? { ...m, _local: "failed" } : m));
      toast.error(e?.message ?? "فشل بدء الرفع");
    }
  }

  async function sendAttachment(file: File, kind: "file" | "audio") {
    const id = newId();
    const safeName = file.name || (kind === "audio" ? `voice-${Date.now()}.webm` : `file-${Date.now()}`);
    // Supabase Storage keys must be ASCII-safe. Sanitize while preserving the extension.
    const dot = safeName.lastIndexOf(".");
    const ext = dot > 0 ? safeName.slice(dot + 1).replace(/[^A-Za-z0-9]/g, "").toLowerCase() : "";
    const sanitized = (dot > 0 ? safeName.slice(0, dot) : safeName)
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "file";
    const storageName = ext ? `${sanitized}.${ext}` : sanitized;
    const path = `${conv.doctor_slot}/${conv.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${storageName}`;
    const baseContent = kind === "audio" ? "🎤 تسجيل صوتي" : safeName;
    const finalContent = buildContent(baseContent);
    setReplyTo(null);
    const optimistic: LocalMsg = {
      id, conversation_id: conv.id, sender: me, sender_name: myName,
      content: finalContent, message_type: kind,
      attachment_path: path, attachment_name: safeName,
      attachment_mime: file.type || null, attachment_size: file.size,
      read_by: [me], created_at: new Date().toISOString(),
      _local: "uploading", _progress: 0, _file: file,
    };
    setMsgs(prev => [...prev, optimistic]);
    await startUpload(id, path, file);
  }

  function resumeUpload(m: LocalMsg) {
    if (!m._file || !m.attachment_path) return;
    const existing = uploadHandles.current.get(m.id);
    if (existing) { try { existing.resume(); } catch {} ; return; }
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, _local: "uploading" } : x));
    startUpload(m.id, m.attachment_path, m._file);
  }

  function pauseUpload(m: LocalMsg) {
    const h = uploadHandles.current.get(m.id);
    if (h) { try { h.pause(); } catch {} }
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, _local: "paused" } : x));
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

  // ---- Message context-menu actions ----
  async function actCopy(m: LocalMsg) {
    const txt = m.message_type === "text" ? m.content : (m.attachment_name || m.content);
    await navigator.clipboard.writeText(txt);
    toast.success("تم النسخ");
  }
  function actComment(m: LocalMsg) { setReplyTo(m); }
  async function actResend(m: LocalMsg) {
    if (m.message_type === "text") {
      setText(m.content);
      toast.info("جاهز لإعادة الإرسال");
    } else if (m._file) {
      await sendAttachment(m._file, m.message_type as any);
    } else if (m.attachment_path) {
      // re-share existing file as a new message (no re-upload needed)
      const id = newId();
      const { error } = await supabase.from("chat_messages").insert({
        id, conversation_id: conv.id, sender: me, sender_name: myName,
        content: m.content, message_type: m.message_type,
        attachment_path: m.attachment_path, attachment_name: m.attachment_name,
        attachment_mime: m.attachment_mime, attachment_size: m.attachment_size,
        read_by: [me],
      });
      if (error) toast.error(error.message); else toast.success("تم إعادة الإرسال");
    }
  }
  async function actShare(m: LocalMsg) {
    const text = m.content;
    // For attachments, try sharing the actual file (Blob) so the receiver gets a file, not a link.
    if (m.attachment_path) {
      let url: string | null = null;
      if (/^https?:\/\//i.test(m.attachment_path)) url = m.attachment_path;
      else url = await getSignedUrl(m.attachment_path, 3600);
      if (url) {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const fname = m.attachment_name || `file-${m.id.slice(0,8)}`;
          const file = new File([blob], fname, { type: m.attachment_mime || blob.type || "application/octet-stream" });
          if (typeof navigator !== "undefined" && (navigator as any).canShare?.({ files: [file] })) {
            await (navigator as any).share({ files: [file], title: fname, text });
            return;
          }
          // Fallback: trigger a direct file download (no link sharing).
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl; a.download = fname;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          toast.success("تم تنزيل الملف للمشاركة");
          return;
        } catch { /* fall through */ }
      }
      toast.error("تعذر تجهيز الملف للمشاركة");
      return;
    }
    if (navigator.share) { try { await navigator.share({ title: "Zircon Journey", text }); return; } catch {} }
    await navigator.clipboard.writeText(text); toast.success("تم النسخ للمشاركة");
  }
  async function actSave(m: LocalMsg) {
    if (m.message_type === "text") {
      const blob = new Blob([m.content], { type: "text/plain;charset=utf-8" });
      const r = await saveToCenter(blob, `message-${m.id.slice(0,8)}.txt`, "نصوص");
      toast.success(r.fallback ? "تم التحميل" : `حُفظ في ${CENTER_FOLDER_NAME}/نصوص`);
      return;
    }
    if (!m.attachment_path) return;
    const url = await getSignedUrl(m.attachment_path, 600);
    if (!url) { toast.error("تعذر الحصول على الرابط"); return; }
    try {
      const sub = m.message_type === "audio" ? "تسجيلات" : "ملفات";
      const r = await downloadUrlToCenter(url, m.attachment_name || `file-${m.id.slice(0,8)}`, sub);
      toast.success(r.fallback ? "تم التحميل" : `حُفظ في ${CENTER_FOLDER_NAME}/${sub}`);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر الحفظ");
    }
  }
  async function actDelete(m: LocalMsg) {
    if (!confirm("حذف هذه الرسالة نهائياً؟")) return;
    if (m._local) {
      const h = uploadHandles.current.get(m.id);
      if (h) { try { h.abort(); } catch {} ; uploadHandles.current.delete(m.id); }
      setMsgs(prev => prev.filter(x => x.id !== m.id));
      return;
    }
    if (m.attachment_path) {
      await removePrivateObjects("chat-attachments", [m.attachment_path]);
    }
    const { error } = await supabase.from("chat_messages").delete().eq("id", m.id);
    if (error) toast.error(error.message);
    else { setMsgs(prev => prev.filter(x => x.id !== m.id)); toast.success("تم الحذف"); }
  }
  async function actEdit(m: LocalMsg) {
    if (m.sender !== me) { toast.error("لا يمكنك تعديل رسالة شخص آخر"); return; }
    if (m.message_type !== "text") { toast.error("التعديل متاح للرسائل النصية فقط"); return; }
    const next = window.prompt("تعديل الرسالة:", m.content);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === m.content) return;
    const { error } = await supabase.from("chat_messages")
      .update({ content: trimmed, edited_at: new Date().toISOString() }).eq("id", m.id);
    if (error) toast.error(error.message);
    else { setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, content: trimmed } : x)); toast.success("تم تعديل الرسالة"); }
  }
  function actArchive(m: LocalMsg) {
    const next = new Set(archivedIds);
    if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
    persistArchived(next);
    toast.success(next.has(m.id) ? "تمت أرشفة الرسالة" : "تم إخراجها من الأرشيف");
  }

  const otherParticipants = conv.participants.filter(p => p !== me);
  const visibleMsgs = msgs
    .filter(m => showArchived ? archivedIds.has(m.id) : !archivedIds.has(m.id))
    .slice()
    .sort(compareByCreatedAt);

  return (
    <div className="rounded-2xl bg-card border border-border flex flex-col h-[640px] shadow-luxury">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="rounded-lg border border-border p-2 hover:border-gold shrink-0" title="عودة">
            <ChevronRight className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{conv.title || summarizeParticipants(conv.participants)}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {conv.participants.map(p => (
                <span key={p} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_COLOR[p]}`}>{ROLE_LABEL[p]}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowArchived(v=>!v)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold border ${showArchived?"gradient-gold border-gold":"bg-card border-border hover:border-gold"}`}
            title="أرشيف الرسائل (محلي)">
            <Archive className="inline size-3 me-1" /> {showArchived ? `عرض الكل` : `أرشيف (${archivedIds.size})`}
          </button>
          <span className={`text-[11px] font-bold rounded-full px-3 py-1 ${ROLE_COLOR[me]}`}>
            أنت: {ROLE_LABEL[me]}{myName ? ` — ${myName}` : ""}
          </span>
        </div>
      </div>

      {me === "admin" && !conv.participants.includes("admin") && (
        <div className="px-4 py-2 border-b border-border bg-rose-50 dark:bg-rose-950/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-rose-800 dark:text-rose-200 font-bold">
            👁 أنت تشاهد محادثة خاصة كمشرف. لن يراك أحد إلا إذا انضممت كطرف ثالث.
          </div>
          <button
            onClick={async () => {
              const next = Array.from(new Set<RoleKey>([...conv.participants, "admin"]));
              const { error } = await supabase.from("chat_conversations").update({ participants: next }).eq("id", conv.id);
              if (error) toast.error(error.message);
              else { toast.success("تم انضمامك كطرف ثالث"); onChange(); }
            }}
            className="rounded-lg gradient-brown px-3 py-1.5 text-xs font-bold shadow-luxury">
            الانضمام كطرف ثالث
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {visibleMsgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">{showArchived ? "لا رسائل مؤرشفة." : "ابدأ المحادثة الآن."}</div>}
        {visibleMsgs.map((m, i) => {
          const mine = m.sender === me;
          const prev = visibleMsgs[i - 1];
          const showDay = isNewDay(prev?.created_at, m.created_at);
          return (
            <div key={m.id}>
              {showDay && (
                <div className="flex justify-center my-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold text-muted-foreground shadow-sm">
                    {formatDayLabel(m.created_at)}
                  </span>
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <MessageBubble
                  m={m} mine={mine} doctorName={doctorName} otherParticipants={otherParticipants}
                  onLongPress={(x, y) => setMenuFor({ msg: m, x, y })}
                  onResume={() => resumeUpload(m)}
                  onPause={() => pauseUpload(m)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {replyTo && (
        <div className="px-4 py-2 border-t border-border bg-muted/40 flex items-center gap-2 text-xs">
          <Reply className="size-3.5 text-gold shrink-0" />
          <div className="flex-1 truncate">
            <span className="font-bold">{ROLE_LABEL[replyTo.sender]}: </span>
            <span className="opacity-80">{(replyTo.message_type === "text" ? replyTo.content : replyTo.attachment_name || "ملف").slice(0,80)}</span>
          </div>
          <button onClick={()=>setReplyTo(null)} className="rounded p-1 hover:bg-card"><X className="size-3.5" /></button>
        </div>
      )}

      {recording ? (
        <div className="p-3 border-t border-border flex items-center gap-3 bg-rose-50 dark:bg-rose-950/20">
          <span className="size-3 rounded-full bg-rose-600 animate-pulse" />
          <span className="text-sm font-mono">جارِ التسجيل... {String(Math.floor(recordSec/60)).padStart(2,"0")}:{String(recordSec%60).padStart(2,"0")}</span>
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
            className="rounded-xl border border-border p-2.5 hover:border-gold" title="إرفاق ملف (أي حجم — رفع قابل للاستئناف)">
            <Paperclip className="size-4" />
          </button>
          <button onClick={startRecording} className="rounded-xl border border-border p-2.5 hover:border-gold" title="تسجيل صوتي">
            <Mic className="size-4" />
          </button>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendText(); } }}
            className="flex-1 rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-gold"
            placeholder={replyTo ? "اكتب تعليقك..." : "اكتب رسالة..."} />
          <button onClick={sendText} disabled={!text.trim()} className="rounded-xl gradient-gold p-3 shadow-gold disabled:opacity-50">
            <Send className="size-4 text-gold-foreground" />
          </button>
        </div>
      )}

      {menuFor && (
        <MessageMenu
          x={menuFor.x} y={menuFor.y} msg={menuFor.msg} archived={archivedIds.has(menuFor.msg.id)}
          canEdit={menuFor.msg.sender === me && menuFor.msg.message_type === "text" && !menuFor.msg._local}
          onClose={() => setMenuFor(null)}
          onCopy={actCopy} onComment={actComment} onResend={actResend} onEdit={actEdit}
          onShare={actShare} onSave={actSave} onDelete={actDelete} onArchive={actArchive}
        />
      )}
    </div>
  );
}

function MessageBubble({ m, mine, doctorName, otherParticipants, onLongPress, onResume, onPause }: {
  m: LocalMsg; mine: boolean; doctorName: string; otherParticipants: RoleKey[];
  onLongPress: (x: number, y: number) => void;
  onResume: () => void; onPause: () => void;
}) {
  const pressTimer = useRef<number | null>(null);
  function startPress(x: number, y: number) {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => onLongPress(x, y), 500);
  }
  function cancelPress() { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } }

  useAvatarVersion();
  const senderName = m.sender === "doctor" ? doctorName : (m.sender_name || "");
  const staffUrl = (m.sender === "designer" || m.sender === "technician")
    ? getOverrideUrl(roleSubject(m.sender)) : null;
  const avatarUrl = staffUrl || getDoctorAvatar(senderName);

  return (
    <div className={`flex items-end gap-2 max-w-[85%] ${mine ? "flex-row-reverse" : "flex-row"}`}>
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={senderName}
          loading="lazy"
          className="size-8 rounded-full object-cover ring-2 ring-gold/60 shadow-gold shrink-0"
        />
      )}
      <div
        className={`rounded-2xl px-4 py-2 text-sm shadow-sm select-none ${mine ? ROLE_COLOR[m.sender] : "bg-card border border-border"}`}
        onContextMenu={(e) => { e.preventDefault(); onLongPress(e.clientX, e.clientY); }}
        onTouchStart={(e) => { const t = e.touches[0]; startPress(t.clientX, t.clientY); }}
        onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}
        onMouseDown={(e) => startPress(e.clientX, e.clientY)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      >
        <div className={`text-[10px] font-bold mb-0.5 ${mine ? "opacity-80" : "text-gold"}`}>
          {ROLE_LABEL[m.sender]}{m.sender_name ? ` • ${m.sender_name}` : (m.sender === "doctor" ? ` • ${doctorName}` : "")}
        </div>
      {m.message_type === "audio" ? (
        <AudioBubble path={m.attachment_path!} name={m.attachment_name} mime={m.attachment_mime} />
      ) : m.message_type === "file" ? (
        <FileBubble msg={m} mine={mine} />
      ) : (
        <div className="leading-relaxed whitespace-pre-wrap">{m.content}</div>
      )}
      {(m._local === "uploading" || m._local === "paused" || m._local === "failed") && (
        <div className="mt-2">
          {(m._local === "uploading" || m._local === "paused") && (
            <Progress value={m._progress ?? 0} className="h-1.5 bg-white/20" />
          )}
          <div className="text-[10px] opacity-80 mt-1 flex items-center gap-2">
            <span>
              {m._local === "uploading" && `${m._progress ?? 0}% • جارِ الرفع...`}
              {m._local === "paused" && `${m._progress ?? 0}% • متوقف مؤقتاً`}
              {m._local === "failed" && `فشل الرفع — اضغط للاستئناف`}
            </span>
            {m._local === "uploading" && (
              <button onClick={(e)=>{e.stopPropagation(); onPause();}} className="ms-auto inline-flex items-center gap-1 rounded bg-black/20 px-2 py-0.5">
                <Pause className="size-3" /> إيقاف
              </button>
            )}
            {(m._local === "paused" || m._local === "failed") && m._file && (
              <button onClick={(e)=>{e.stopPropagation(); onResume();}} className="ms-auto inline-flex items-center gap-1 rounded bg-black/20 px-2 py-0.5">
                <Play className="size-3" /> استئناف
              </button>
            )}
          </div>
        </div>
      )}
      <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1.5 justify-end">
        <span title={formatChatFull(m.created_at)}>{formatChatTime(m.created_at)}</span>
        {mine && <MessageStatus msg={m} otherParticipants={otherParticipants} />}
      </div>
      </div>
    </div>
  );
}

function MessageMenu({ x, y, msg, archived, canEdit, onClose, onCopy, onComment, onResend, onEdit, onShare, onSave, onDelete, onArchive }: {
  x: number; y: number; msg: LocalMsg; archived: boolean; canEdit: boolean; onClose: () => void;
  onCopy: (m: LocalMsg) => void; onComment: (m: LocalMsg) => void; onResend: (m: LocalMsg) => void;
  onEdit: (m: LocalMsg) => void;
  onShare: (m: LocalMsg) => void; onSave: (m: LocalMsg) => void; onDelete: (m: LocalMsg) => void;
  onArchive: (m: LocalMsg) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function out(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", out);
    document.addEventListener("touchstart", out);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("touchstart", out); };
  }, [onClose]);
  const items = [
    { icon: Copy, label: "نسخ", run: () => onCopy(msg) },
    { icon: Reply, label: "تعليق / رد", run: () => onComment(msg) },
    ...(canEdit ? [{ icon: Pencil, label: "تعديل", run: () => onEdit(msg) }] : []),
    { icon: RotateCw, label: "إعادة الإرسال", run: () => onResend(msg) },
    { icon: Share2, label: "مشاركة خارجية", run: () => onShare(msg) },
    { icon: Save, label: `حفظ في ${CENTER_FOLDER_NAME}`, run: () => onSave(msg) },
    { icon: Archive, label: archived ? "إخراج من الأرشيف" : "أرشفة", run: () => onArchive(msg) },
    { icon: Trash2, label: "حذف", danger: true, run: () => onDelete(msg) },
  ];
  // Clamp to viewport
  const top = Math.min(y, window.innerHeight - 320);
  const left = Math.min(x, window.innerWidth - 240);
  return (
    <div className="fixed inset-0 z-50" onContextMenu={(e)=>e.preventDefault()}>
      <div ref={ref} style={{ top, left }} className="absolute w-56 rounded-xl border border-border bg-popover text-popover-foreground shadow-luxury overflow-hidden">
        {items.map((it, i) => (
          <button key={i}
            onClick={() => { it.run(); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-start hover:bg-muted ${it.danger ? "text-destructive hover:bg-destructive/10" : ""}`}>
            <it.icon className="size-4" /> {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageStatus({ msg, otherParticipants }: { msg: LocalMsg; otherParticipants: RoleKey[] }) {
  if (msg._local === "failed") return <span title="فشل — سيستأنف تلقائياً عند الاتصال"><AlertCircle className="size-3.5 text-rose-300" /></span>;
  if (msg._local === "paused") return <span title="متوقف"><Pause className="size-3.5 opacity-80" /></span>;
  if (msg._local === "sending" || msg._local === "uploading") return <span title="جارِ الإرسال"><Clock className="size-3.5 opacity-80" /></span>;
  const readers = (msg.read_by ?? []).filter(r => otherParticipants.includes(r));
  if (readers.length > 0) {
    return <span title={`قرأها: ${readers.map(r => ROLE_LABEL[r]).join("، ")}`}><CheckCheck className="size-3.5 text-sky-300" /></span>;
  }
  return <span title="تم التسليم"><Check className="size-3.5 opacity-90" /></span>;
}

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)$/i;
function isImageMsg(msg: LocalMsg): boolean {
  return (msg.attachment_mime?.startsWith("image/") ?? false) || IMG_RE.test(msg.attachment_name || "");
}

function FileBubble({ msg, mine }: { msg: LocalMsg; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const isImage = isImageMsg(msg);
  async function resolveUrl(): Promise<string | null> {
    if (!msg.attachment_path) return null;
    if (/^https?:\/\//i.test(msg.attachment_path)) return msg.attachment_path;
    return await getSignedUrl(msg.attachment_path, 60 * 60);
  }

  // Resolve a preview URL for images so they render inline (open) in the chat.
  useEffect(() => {
    if (!isImage) return;
    if (msg._file) { const u = URL.createObjectURL(msg._file); setImgUrl(u); return () => URL.revokeObjectURL(u); }
    let cancelled = false;
    (async () => { const u = await resolveUrl(); if (!cancelled) setImgUrl(u); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.attachment_path, msg._file, isImage]);
  async function forceDownload(url: string, name: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      return true;
    } catch { return false; }
  }
  async function download() {
    if (!msg.attachment_path) return;
    setBusy(true);
    const url = await resolveUrl();
    if (!url) { setBusy(false); toast.error("تعذر إنشاء رابط التحميل"); return; }
    const name = msg.attachment_name || `file-${msg.id.slice(0,8)}`;
    try {
      const { transferDownload } = await import("@/lib/transfer-manager");
      await transferDownload({ url, filename: name, mime: msg.attachment_mime, saveToCenter: fileManagerSupported() });
    } catch {
      const ok = await forceDownload(url, name);
      if (!ok) window.open(url, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }
  async function openInApp() {
    if (!msg.attachment_path) return;
    setBusy(true);
    const url = await resolveUrl();
    setBusy(false);
    if (!url) { toast.error("تعذر فتح الملف"); return; }
    setViewerUrl(url);
    setViewerOpen(true);
  }

  const sizeLabel = msg.attachment_size
    ? msg.attachment_size > 1024*1024
      ? `${(msg.attachment_size/1024/1024).toFixed(1)} MB`
      : `${(msg.attachment_size/1024).toFixed(1)} KB`
    : "";
  if (isImage) {
    return (
      <>
        <div className="mt-1 space-y-1.5">
          <button type="button" onClick={() => imgUrl && setLightbox(true)}
            className="block rounded-lg overflow-hidden border border-border/60 bg-black/5">
            {imgUrl ? (
              <img src={imgUrl} alt={msg.attachment_name || "صورة"} loading="lazy"
                className="max-h-64 w-auto max-w-full object-contain" />
            ) : (
              <div className="h-40 w-56 grid place-items-center text-muted-foreground">
                <Loader2Icon />
              </div>
            )}
          </button>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] opacity-70 truncate">{msg.attachment_name}{sizeLabel ? ` — ${sizeLabel}` : ""}</span>
            <button onClick={download} disabled={busy || !!msg._local}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold shrink-0 disabled:opacity-50 ${mine ? "bg-white/20 hover:bg-white/30" : "gradient-gold text-gold-foreground"}`}
              title="تحميل الصورة">
              <Download className="size-3.5" /> تحميل
            </button>
          </div>
        </div>
        {lightbox && imgUrl && (
          <ImageLightbox
            images={[{ url: imgUrl, name: msg.attachment_name || "صورة" }]}
            index={0}
            onClose={() => setLightbox(false)}
            onIndexChange={() => {}}
          />
        )}
      </>
    );
  }
  return (
    <>
    <div className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 ${mine ? "border-white/30 bg-white/10" : "border-border bg-muted/40"}`}>
      <FileText className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold truncate">{msg.attachment_name}</div>
        <div className="text-[10px] opacity-70">
          {sizeLabel}{sizeLabel ? " — " : ""}{msg._local ? "جارِ الرفع..." : "تحميل أو فتح الملف"}
        </div>
      </div>
      <button onClick={openInApp} disabled={busy || !!msg._local}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold shrink-0 disabled:opacity-50 ${mine ? "bg-white/20 hover:bg-white/30" : "bg-background border border-border hover:border-gold"}`}
        title="فتح داخل التطبيق">
        <ExternalLink className="size-3.5" /> فتح
      </button>
      <button onClick={download} disabled={busy || !!msg._local}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold shrink-0 disabled:opacity-50 ${mine ? "bg-white/20 hover:bg-white/30" : "gradient-gold text-gold-foreground"}`}
        title="تحميل الملف">
        <Download className="size-3.5" /> تحميل
      </button>
    </div>
    <InAppFileViewer
      open={viewerOpen}
      onOpenChange={setViewerOpen}
      url={viewerUrl}
      name={msg.attachment_name || `file-${msg.id.slice(0,8)}`}
      mime={msg.attachment_mime}
    />
    </>
  );
}

function Loader2Icon() {
  return <Loader2 className="size-5 animate-spin" />;
}


function AudioBubble({ path, name, mime }: { path: string; name?: string | null; mime?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  async function resolveUrl(): Promise<string | null> {
    if (/^https?:\/\//i.test(path)) return path;
    return await getSignedUrl(path, 600);
  }
  async function loadAudio() {
    setBusy(true);
    const u = await resolveUrl();
    setBusy(false);
    if (!u) { toast.error("تعذر تحميل التسجيل"); return; }
    setUrl(u);
  }
  async function downloadAudio() {
    setDownloading(true);
    const u = await resolveUrl();
    if (!u) { setDownloading(false); toast.error("تعذر إنشاء الرابط"); return; }
    const filename = name || `voice-${Date.now()}.${(mime || "audio/webm").includes("mp4") ? "m4a" : "webm"}`;
    try {
      const { transferDownload } = await import("@/lib/transfer-manager");
      await transferDownload({ url: u, filename, mime, saveToCenter: fileManagerSupported(), subfolder: "تسجيلات" });
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر التحميل");
    } finally { setDownloading(false); }
  }
  return (
    <div className="mt-1 space-y-2">
      {url ? (
        <audio controls autoPlay src={url} className="max-w-full" />
      ) : (
        <button onClick={loadAudio} disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold">
          <Mic className="size-4" /> {busy ? "جارِ التحميل..." : "تشغيل التسجيل الصوتي"}
        </button>
      )}
      <button onClick={downloadAudio} disabled={downloading}
        className="inline-flex items-center gap-1.5 rounded-md gradient-gold text-gold-foreground px-2.5 py-1 text-[11px] font-bold disabled:opacity-50">
        <Download className="size-3.5" /> {downloading ? "جارِ التحميل..." : "تحميل الملف"}
      </button>
    </div>
  );
}

