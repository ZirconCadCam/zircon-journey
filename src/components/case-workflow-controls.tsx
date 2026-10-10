import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckSquare, Square, Loader2, AlertCircle,
  FileArchive, FileCode, ChevronDown, ChevronUp, Check, Send, Truck,
  ThumbsUp, Pencil, X, Archive, Download, Type, FileText, Image as ImageIcon, Highlighter,
  Mic, Trash2, Upload,
} from "lucide-react";
import type { RoleKey } from "@/lib/chat";
import { ROLE_LABEL, getSignedUrl } from "@/lib/chat";
import { CaseFileActivityLog } from "@/components/case-file-activity-log";
import { ShadeConfirm, ShadePicker, CaseShadeConfirm } from "@/components/shade-confirm";
import { ImageAnnotator } from "@/components/image-annotator";
import { ImageLightbox } from "@/components/image-lightbox";
import { ArchiveReceiptEditor, ArchiveRequestStatus } from "@/components/archive-receipt-editor";
import { signPrivateUrl } from "@/lib/secure-storage";



export interface WorkflowCase {
  id: string;
  case_code: string;
  patient_name: string;
  doctor_slot: number;
  design_done?: boolean | null;
  design_file_sent?: boolean | null;
  attachment_rar_path?: string | null;
  design_html_sent?: boolean | null;
  design_html_path?: string | null;
  design_html_name?: string | null;
  design_received_by_tech?: boolean | null;
  fabrication_done?: boolean | null;
  fabrication_file_sent?: boolean | null;
  tech_data_sent_to_secretary?: boolean | null;
  secretary_received?: boolean | null;
  shipped_to_doctor?: boolean | null;
  received_temporary?: boolean | null;
  received_permanent?: boolean | null;
  // Second-cycle (review → permanent) fields:
  temporary_delivered?: boolean | null;
  doctor_decision?: string | null;
  revision_notes?: string | null;
  revision_design_file_path?: string | null;
  revision_design_file_name?: string | null;
  revision_design_done?: boolean | null;
  revision_approved_by_tech?: boolean | null;
  permanent_fabrication_done?: boolean | null;
  permanent_shipped_to_secretary?: boolean | null;
  permanent_delivered_to_doctor?: boolean | null;
  permanent_received_by_secretary?: boolean | null;
  permanent_installed_by_doctor?: boolean | null;
  final_archived?: boolean | null;
  archive_receipt_path?: string | null;
  archive_receipt_name?: string | null;
  archive_receipt_sent_at?: string | null;
  archive_request_note?: string | null;
  archive_approval?: string | null;
  archive_reviewed_at?: string | null;
  archive_reviewed_by?: string | null;
  archive_reject_reason?: string | null;

  perm_delivered_at?: string | null;
  perm_read_at?: string | null;
  audit_log?: Array<{ at: string; actor: string; action: string; notes?: string }> | null;
  // For folded card display:
  patient_phone?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  tooth_number?: string | null;
  teeth_count?: string | null;
  shade?: string | null;
  shade_confirmed_doctor?: boolean | null;
  shade_confirmed_designer?: boolean | null;
  shade_confirmed_technician?: boolean | null;
  case_type?: string | null;
  notes?: string | null;
  scan_path?: string | null;
  scan_name?: string | null;
  scan_mime?: string | null;
  extra_zip_path?: string | null;
  extra_zip_name?: string | null;
  extra_zip_mime?: string | null;
  extra_zip_size?: number | null;
  notes_images?: { url: string; name: string }[] | null;
  notes_image_comments?: import("@/lib/image-comments").NoteImageComment[] | null;
}

interface Props {
  c: WorkflowCase;
  /** Which actor is operating */
  actor: "doctor" | "designer" | "technician" | "secretary_sanaa" | "secretary_ibb";
  actorName: string;
  doctorName: string;
  /** target role to send the file to (technician for designer, secretary_* for technician) */
  target?: RoleKey;
  blockedByPending?: string | null;
}

const RAR_RE = /\.rar$/i;
const HTML_RE = /\.html?$/i;

export function CaseWorkflowControls({ c, actor, actorName, doctorName, target, blockedByPending }: Props) {
  if (actor === "doctor") {
    return <DoctorControls c={c} actorName={actorName} doctorName={doctorName} />;
  }
  if (actor === "designer") {
    return <DesignerControls c={c} actorName={actorName} doctorName={doctorName}
      target={target ?? "technician"} blockedByPending={blockedByPending ?? null} />;
  }
  if (actor === "technician") {
    return <TechnicianControls c={c} actorName={actorName} doctorName={doctorName} target={target ?? null} />;
  }
  return <SecretaryControls c={c} actorName={actorName} actor={actor} doctorName={doctorName} />;
}

// ---------- helpers ----------
async function ensureConv(c: WorkflowCase, sender: RoleKey, target: RoleKey, doctorName: string): Promise<string | null> {
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants").eq("doctor_slot", c.doctor_slot);
  const conv = (existing ?? []).find((x: any) =>
    Array.isArray(x.participants) && x.participants.length === 2
    && x.participants.includes(sender) && x.participants.includes(target)
  ) as { id: string } | undefined;
  if (conv) return conv.id;
  const { data: created, error } = await supabase.from("chat_conversations")
    .insert({
      doctor_slot: c.doctor_slot,
      participants: [sender, target],
      title: `حالات ${doctorName} — ${ROLE_LABEL[target]}`,
      created_by: sender,
    }).select("id").single();
  if (error || !created) return null;
  return created.id;
}

/** Ensure a case-scoped doctor↔designer conversation exists (title starts with
 *  `[case_code]`) so files/messages appear automatically in the doctor's
 *  per-case chat. Returns the conversation id. */
async function ensureCaseConvForDoctor(c: WorkflowCase): Promise<string | null> {
  const prefix = `[${c.case_code}]`;
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants,title").eq("doctor_slot", c.doctor_slot);
  const conv = (existing ?? []).find((x: any) =>
    Array.isArray(x.participants)
    && x.participants.includes("doctor") && x.participants.includes("designer")
    && typeof x.title === "string" && x.title.startsWith(prefix)
  ) as { id: string } | undefined;
  if (conv) return conv.id;
  const { data: created, error } = await supabase.from("chat_conversations")
    .insert({
      doctor_slot: c.doctor_slot,
      participants: ["doctor", "designer"],
      title: `${prefix} ${c.patient_name}`,
      created_by: "designer",
    }).select("id").single();
  if (error || !created) return null;
  return created.id;
}

/** Ensure a case-scoped conversation that includes the doctor, designer AND
 *  technician (title starts with `[case_code]`), so notes/images the doctor
 *  posts appear inside the per-case chat on the doctor, designer and
 *  technician pages simultaneously. Returns the conversation id. */
async function ensureCaseConvAll(c: WorkflowCase): Promise<string | null> {
  const prefix = `[${c.case_code}]`;
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants,title").eq("doctor_slot", c.doctor_slot);
  const conv = (existing ?? []).find((x: any) =>
    Array.isArray(x.participants)
    && x.participants.includes("doctor")
    && x.participants.includes("designer")
    && x.participants.includes("technician")
    && typeof x.title === "string" && x.title.startsWith(prefix)
  ) as { id: string } | undefined;
  if (conv) return conv.id;
  const { data: created, error } = await supabase.from("chat_conversations")
    .insert({
      doctor_slot: c.doctor_slot,
      participants: ["doctor", "designer", "technician"],
      title: `${prefix} ${c.patient_name}`,
      created_by: "doctor",
    }).select("id").single();
  if (error || !created) return null;
  return created.id;
}

/** Resolve the matching branch secretary role for a case's doctor, so we never
 *  notify (and thus re-create conversations with) the wrong-branch secretary. */
async function branchSecretaryRole(slot: number): Promise<RoleKey | null> {
  const { data } = await supabase.from("doctor_profiles")
    .select("branch").eq("slot", slot).maybeSingle();
  const branch = (data as { branch?: string | null } | null)?.branch;
  if (branch === "sanaa") return "secretary_sanaa";
  if (branch === "ibb") return "secretary_ibb";
  return null;
}

async function uploadAttachment(file: File, c: WorkflowCase, phase: string): Promise<{ url: string; path: string } | null> {
  const path = `${c.doctor_slot}/${phase}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { registerUpload } = await import("@/lib/transfer-manager");
  const { startResumableUpload } = await import("@/lib/resumable-upload");

  return new Promise(async (resolve) => {
    let handle: { abort: () => void; pause: () => void; resume: () => void } | null = null;
    let settled = false;
    const task = registerUpload(file.name, {
      pause: () => { handle?.pause(); task.paused(); },
      resume: () => { handle?.resume(); task.resumed(); },
      cancel: () => { handle?.abort(); task.remove(); if (!settled) { settled = true; resolve(null); } },
    });
    try {
      handle = await startResumableUpload({
        bucket: "chat-attachments",
        path,
        file,
        fileName: file.name,
        onProgress: (pct, loaded, total) => task.update(pct, loaded, total),
        onError: (err) => {
          task.fail();
          if (!settled) { settled = true; toast.error(err.message || "فشل رفع الملف"); resolve(null); }
        },
        onSuccess: async () => {
          task.done();
          const signedUrl = await signPrivateUrl("chat-attachments", path, 60 * 60 * 24 * 365);
          if (!settled) { settled = true; resolve({ url: signedUrl ?? path, path }); }
        },
      });
    } catch (e: any) {
      task.fail();
      if (!settled) { settled = true; toast.error(e.message || "فشل رفع الملف"); resolve(null); }
    }
  });
}


/** Reusable drag & drop area for desktop file uploads (.rar / .html), reusable many times. */
function FileDropZone({ busy, onFiles, title, hint, accept = ".rar,.RAR,.html,.htm,application/vnd.rar,application/x-rar-compressed,text/html,application/octet-stream" }: {
  busy?: boolean;
  onFiles: (files: FileList | File[] | null) => void | Promise<void>;
  title: string;
  hint?: string;
  accept?: string;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        if (busy) return;
        onFiles(e.dataTransfer?.files ?? null);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center transition
        ${over ? "border-gold bg-gold/10 ring-2 ring-gold" : busy ? "border-border bg-muted/40 opacity-70" : "border-border bg-card/60 hover:border-gold hover:bg-gold/5"}`}
    >
      {busy ? <Loader2 className="size-5 animate-spin text-gold" /> : <Upload className="size-5 text-gold" />}
      <span className="text-xs font-bold">{over ? "أفلت الملفات الآن" : title}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
        disabled={busy}
        onChange={(e) => { const fl = e.target.files; e.target.value = ""; onFiles(fl); }} />
    </label>
  );
}

// ============== DESIGNER ==============
function DesignerControls({ c, actorName, doctorName, target, blockedByPending }: {
  c: WorkflowCase; actorName: string; doctorName: string; target: RoleKey; blockedByPending: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [busyHtml, setBusyHtml] = useState(false);
  const [dragRar, setDragRar] = useState(false);
  const [dragHtml, setDragHtml] = useState(false);
  const rarRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);
  const rarSent = !!c.design_file_sent;
  const htmlSent = !!c.design_html_sent;
  const blocked = !rarSent && !!blockedByPending;

  async function processHtml(f: File) {
    if (!f) return;
    if (!HTML_RE.test(f.name)) { toast.error("الملف يجب أن يكون .html"); return; }
    setBusyHtml(true);
    try {
      const up = await uploadAttachment(f, c, "design-html");
      if (!up) return;
      const convId = await ensureConv(c, "designer", target, doctorName);
      if (!convId) { toast.error("تعذر إنشاء المحادثة"); return; }
      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender: "designer",
        sender_name: actorName,
        content: `🌐 ملف التصميم (HTML) — الحالة ${c.case_code} (${c.patient_name})`,
        message_type: "file",
        attachment_path: up.url,
        attachment_name: f.name,
        attachment_mime: f.type || "text/html",
        attachment_size: f.size,
      });
      // Also publish the HTML file into the doctor's per-case chat so it shows
      // up automatically on the doctor's page conversation for this case.
      const docConvId = await ensureCaseConvForDoctor(c);
      if (docConvId) {
        await supabase.from("chat_messages").insert({
          conversation_id: docConvId,
          sender: "designer",
          sender_name: actorName,
          content: `🌐 ملف التصميم (HTML) — الحالة ${c.case_code} (${c.patient_name})`,
          message_type: "file",
          attachment_path: up.url,
          attachment_name: f.name,
          attachment_mime: f.type || "text/html",
          attachment_size: f.size,
        });
      }
      await supabase.from("slot_cases").update({
        design_html_sent: true,
        design_html_path: up.url,
        design_html_name: f.name,
      }).eq("id", c.id);
      // Auto-forward the HTML design file to the clinic's Telegram group.
      const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
      const { deriveStageKey, getStage } = await import("@/lib/case-stages");
      autoSendFileToTelegram({
        kind: "html", from: `المصمم (${actorName})`, caseCode: c.case_code,
        patientName: c.patient_name, doctorName, caseId: c.id,
        stageLabel: getStage(deriveStageKey({ ...(c as any), design_html_sent: true })).label,
        url: up.url, filename: f.name,
      });
      toast.success("✅ تم رفع ملف HTML وإظهاره في محادثة الطبيب");

    } catch (err: any) { toast.error(err.message || "فشل رفع ملف HTML"); }
    finally { setBusyHtml(false); }
  }

  async function processRar(f: File) {
    if (!f) return;
    if (!RAR_RE.test(f.name)) { toast.error("الملف يجب أن يكون .rar"); return; }
    if (blocked) { toast.error(`أرسل أولاً ملفات الحالة المعلّقة: ${blockedByPending}`); return; }
    setBusy(true);
    try {
      const up = await uploadAttachment(f, c, "design-rar");
      if (!up) return;
      const convId = await ensureConv(c, "designer", target, doctorName);
      if (!convId) { toast.error("تعذر إنشاء المحادثة"); return; }
      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender: "designer",
        sender_name: actorName,
        content: `📦 ملف التصميم (RAR) — الحالة ${c.case_code} (${c.patient_name})`,
        message_type: "file",
        attachment_path: up.url,
        attachment_name: f.name,
        attachment_mime: f.type || "application/vnd.rar",
        attachment_size: f.size,
      });
      // Auto-mark design as done. design_received_by_tech now flips when the
      // technician opens the case (handled in TechnicianControls / list view).
      await supabase.from("slot_cases").update({
        design_file_sent: true,
        design_done: true,
        design_sent_at: new Date().toISOString(),
      }).eq("id", c.id);
      // Instant auto-forward to the clinic's Telegram group.
      const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
      const { deriveStageKey, getStage } = await import("@/lib/case-stages");
      autoSendFileToTelegram({
        kind: "rar", from: `المصمم (${actorName})`, caseCode: c.case_code,
        patientName: c.patient_name, doctorName, caseId: c.id,
        stageLabel: getStage(deriveStageKey({ ...(c as any), design_file_sent: true, design_done: true })).label,
        url: up.url, filename: f.name,
      });
      toast.success(`✅ تم إرسال ملف التصميم إلى ${ROLE_LABEL[target]}`);
    } catch (err: any) { toast.error(err.message || "فشل الإرسال"); }
    finally { setBusy(false); }
  }

  function sendHtml(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (f) processHtml(f);
  }

  function sendRar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (f) processRar(f);
  }

  function pickDropped(dt: DataTransfer): File | null {
    if (dt.files && dt.files.length) return dt.files[0];
    return null;
  }

  /** Route every dropped/selected file by extension — supports many files at once. */
  async function processMany(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    for (const f of files) {
      if (RAR_RE.test(f.name)) await processRar(f);
      else if (HTML_RE.test(f.name)) await processHtml(f);
      else toast.error(`صيغة غير مدعومة: ${f.name} (المسموح .rar و .html)`);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragRar(true); }}
          onDragLeave={() => setDragRar(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragRar(false);
            if (busy) return;
            const f = pickDropped(e.dataTransfer);
            if (f) processRar(f);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${dragRar ? "border-gold bg-gold/10 ring-2 ring-gold" : rarSent ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5" />}
          {dragRar ? "أفلت ملف .rar هنا" : rarSent ? "إرسال ملف تصميم آخر (.rar)" : "إرسال ملف التصميم (.rar)"}
          <input ref={rarRef} type="file"
            accept=".rar,.RAR,application/vnd.rar,application/x-rar-compressed,application/octet-stream"
            className="hidden"
            onChange={sendRar} disabled={busy} />
        </label>
        <label
          onDragOver={(e) => { e.preventDefault(); if (!busyHtml) setDragHtml(true); }}
          onDragLeave={() => setDragHtml(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragHtml(false);
            if (busyHtml) return;
            const f = pickDropped(e.dataTransfer);
            if (f) processHtml(f);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${dragHtml ? "border-gold bg-gold/10 ring-2 ring-gold" : htmlSent ? "border-sky-500 bg-sky-50 text-sky-700" : "border-border bg-card hover:border-gold"}`}>
          {busyHtml ? <Loader2 className="size-3.5 animate-spin" /> : <FileCode className="size-3.5" />}
          {dragHtml ? "أفلت ملف .html هنا" : htmlSent ? "رفع ملف HTML آخر" : "رفع ملف التصميم (.html)"}
          <input ref={htmlRef} type="file"
            accept=".html,.htm,text/html,application/octet-stream"
            className="hidden"
            onChange={sendHtml} disabled={busyHtml} />
        </label>
        {rarSent && !c.design_received_by_tech && (
          <span className="text-[11px] text-amber-700 font-bold">بانتظار فتح الفني للحالة…</span>
        )}
        {c.design_received_by_tech && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
            <Check className="size-3.5" /> فتح الفني الحالة
          </span>
        )}
      </div>

      {/* Unified drag & drop zone — accepts .rar and .html, any number of times */}
      <FileDropZone
        busy={busy || busyHtml}
        onFiles={processMany}
        title="اسحب ملفات التصميم وأفلتها هنا (.rar / .html)"
        hint="يمكنك السحب والإفلات عدة مرات — قبل التعديل وبعده — أو اضغط للاختيار من الكمبيوتر"
      />
      {blocked && !rarSent && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="size-3" />
          أرسل أولاً ملفات الحالة المعلّقة:
          <span className="font-mono font-bold">{blockedByPending}</span>
        </div>
      )}
      <DesignerRevisionSection c={c} actorName={actorName} doctorName={doctorName} />
    </div>
  );
}

// ---------- Designer: revision request from the doctor ----------
interface DoctorRevisionFile { name: string; path: string; mime: string | null }

function DesignerRevisionSection({ c, actorName, doctorName }: {
  c: WorkflowCase; actorName: string; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [htmlSent, setHtmlSent] = useState(false);
  const htmlRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [docFiles, setDocFiles] = useState<DoctorRevisionFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = !!c.revision_design_done;
  const approved = !!c.revision_approved_by_tech;

  // Load the modification files the doctor attached to the revision request
  // (sent into the doctor → designer conversation as file messages).
  useEffect(() => {
    if (c.doctor_decision !== "revision") return;
    let cancelled = false;
    (async () => {
      const { data: convs } = await supabase.from("chat_conversations")
        .select("id,participants").eq("doctor_slot", c.doctor_slot);
      const conv = (convs ?? []).find((x: any) =>
        Array.isArray(x.participants) && x.participants.length === 2
        && x.participants.includes("doctor") && x.participants.includes("designer"));
      if (!conv) return;
      const { data: msgs } = await supabase.from("chat_messages")
        .select("attachment_path,attachment_name,attachment_mime,content,message_type,sender,created_at")
        .eq("conversation_id", (conv as { id: string }).id)
        .eq("sender", "doctor")
        .eq("message_type", "file")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const files = (msgs ?? [])
        .filter((m: any) => m.attachment_path && (m.content ?? "").includes("طلب التعديل"))
        .map((m: any) => ({ name: m.attachment_name as string, path: m.attachment_path as string, mime: m.attachment_mime as string | null }));
      setDocFiles(files);
    })();
    return () => { cancelled = true; };
  }, [c.id, c.doctor_decision, c.doctor_slot]);

  if (c.doctor_decision !== "revision") return null;

  async function downloadDocFile(f: DoctorRevisionFile) {
    const url = /^https?:\/\//i.test(f.path) ? f.path : (await getSignedUrl(f.path)) ?? f.path;
    const { transferDownload } = await import("@/lib/transfer-manager");
    await transferDownload({ url, filename: f.name || "ملف-التعديل", mime: f.mime, saveToCenter: true });
  }

  async function uploadRevision(f: File | null | undefined) {
    if (!f) return;
    if (!RAR_RE.test(f.name)) { toast.error("الملف يجب أن يكون .rar"); return; }
    setBusy(true);
    try {
      const up = await uploadAttachment(f, c, "revision");
      if (!up) return;
      // Notify the technician
      const conv = await ensureConv(c, "designer", "technician", doctorName);
      if (conv) await supabase.from("chat_messages").insert({
        conversation_id: conv, sender: "designer", sender_name: actorName,
        content: `🔁 تعديل تصميم نهائي — الحالة ${c.case_code} (${c.patient_name})`,
        message_type: "file",
        attachment_path: up.url, attachment_name: f.name,
        attachment_mime: f.type || "application/vnd.rar", attachment_size: f.size,
      });
      // Notify the doctor
      const dconv = await ensureConv(c, "designer", "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: "designer", sender_name: actorName,
        content: `✏️ تم إنجاز التعديل المطلوب وإرساله للفني — الحالة ${c.case_code}`,
        message_type: "text",
      });
      await supabase.from("slot_cases").update({
        revision_design_file_path: up.url,
        revision_design_file_name: f.name,
        revision_design_done: true,
      }).eq("id", c.id);
      {
        const { attachToLatestRound } = await import("@/lib/revision-rounds");
        await attachToLatestRound(c.id, { rar_path: up.url, rar_name: f.name });
      }
      const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
      const { deriveStageKey, getStage } = await import("@/lib/case-stages");
      autoSendFileToTelegram({
        kind: "rar", from: `المصمم (${actorName}) — تعديل`, caseCode: c.case_code,
        patientName: c.patient_name, doctorName, caseId: c.id,
        stageLabel: getStage(deriveStageKey({ ...(c as any), revision_design_done: true })).label,
        url: up.url, filename: f.name,
      });
      toast.success("تم إرسال التعديل للفني");
    } catch (err: any) { toast.error(err.message || "فشل الإرسال"); }
    finally { setBusy(false); }
  }

  /** Optional HTML report the designer may attach with every revision file. */
  async function uploadRevisionHtml(f: File | null | undefined) {
    if (!f) return;
    if (!HTML_RE.test(f.name)) { toast.error("الملف يجب أن يكون .html"); return; }
    setBusy(true);
    try {
      const up = await uploadAttachment(f, c, "revision-html");
      if (!up) return;
      const conv = await ensureConv(c, "designer", "technician", doctorName);
      if (conv) await supabase.from("chat_messages").insert({
        conversation_id: conv, sender: "designer", sender_name: actorName,
        content: `🧾 ملف HTML مرفق مع التعديل — الحالة ${c.case_code} (${c.patient_name})`,
        message_type: "file",
        attachment_path: up.url, attachment_name: f.name,
        attachment_mime: f.type || "text/html", attachment_size: f.size,
      });
      const dconv = await ensureConv(c, "designer", "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: "designer", sender_name: actorName,
        content: `🧾 ملف HTML مرفق مع التعديل — الحالة ${c.case_code}`,
        message_type: "file",
        attachment_path: up.url, attachment_name: f.name,
        attachment_mime: f.type || "text/html", attachment_size: f.size,
      });
      await supabase.from("slot_cases").update({
        design_html_path: up.url,
        design_html_name: f.name,
        design_html_sent: true,
      }).eq("id", c.id);
      {
        const { attachToLatestRound } = await import("@/lib/revision-rounds");
        await attachToLatestRound(c.id, { html_path: up.url, html_name: f.name });
      }
      const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
      autoSendFileToTelegram({
        kind: "html", from: `المصمم (${actorName}) — تعديل`, caseCode: c.case_code,
        patientName: c.patient_name, doctorName, caseId: c.id,
        stageLabel: "تعديل التصميم",
        url: up.url, filename: f.name,
      });
      setHtmlSent(true);
      toast.success("تم إرسال ملف HTML مع التعديل");
    } catch (err: any) { toast.error(err.message || "فشل إرسال ملف HTML"); }
    finally { setBusy(false); }
  }

  // Send the revision as plain text — produces the exact same workflow result
  // as sending the modified .rar (notifies tech + doctor, marks done).
  async function sendRevisionText() {
    const body = text.trim();
    if (body.length < 2) { toast.error("اكتب نص التعديل أولاً"); return; }
    setBusy(true);
    try {
      const conv = await ensureConv(c, "designer", "technician", doctorName);
      if (conv) await supabase.from("chat_messages").insert({
        conversation_id: conv, sender: "designer", sender_name: actorName,
        content: `🔁 تعديل تصميم نهائي (نصي) — الحالة ${c.case_code} (${c.patient_name})\n${body}`,
        message_type: "text",
      });
      const dconv = await ensureConv(c, "designer", "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: "designer", sender_name: actorName,
        content: `✏️ تم إنجاز التعديل المطلوب وإرساله للفني (نصياً) — الحالة ${c.case_code}`,
        message_type: "text",
      });
      await supabase.from("slot_cases").update({
        revision_design_file_name: "تعديل نصي",
        revision_design_done: true,
      }).eq("id", c.id);
      toast.success("تم إرسال التعديل النصي للفني");
      setTextMode(false); setText("");
    } catch (err: any) { toast.error(err.message || "فشل الإرسال"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-50/60 p-3 space-y-2">
      <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
        <Pencil className="size-3.5" /> تعديل مطلوب من الطبيب
      </div>
      {c.revision_notes && (
        <div className="text-xs whitespace-pre-wrap rounded border border-amber-300 bg-white/70 p-2">
          {c.revision_notes}
        </div>
      )}

      {/* Modification files attached by the doctor */}
      {docFiles.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-amber-800">ملفات التعديل المرسلة من الطبيب:</div>
          <ul className="space-y-1">
            {docFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-[11px]">
                <span className="truncate flex-1">{f.name}</span>
                <button type="button" onClick={() => downloadDocFile(f)}
                  className="inline-flex items-center gap-1 rounded-md border border-gold/60 bg-gold/10 px-2 py-1 font-bold hover:bg-gold/20">
                  <Download className="size-3" /> تحميل
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${done ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5" />}
          {done ? "رفع ملف تعديل آخر (.rar)" : "رفع ملف التعديل (.rar)"}
          <input ref={fileRef} type="file"
            accept=".rar,.RAR,application/vnd.rar,application/x-rar-compressed,application/octet-stream" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadRevision(f); }}
            disabled={busy} />
        </label>
        <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${htmlSent ? "border-sky-500 bg-sky-50 text-sky-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileCode className="size-3.5" />}
          {htmlSent ? "إرفاق ملف HTML آخر" : "إرفاق ملف HTML مع التعديل"}
          <input ref={htmlRef} type="file" accept=".html,.htm,text/html" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadRevisionHtml(f); }}
            disabled={busy} />
        </label>
        {!done && (
          <button type="button" onClick={() => setTextMode(o => !o)} disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition border
              ${textMode ? "border-gold bg-gold/10 text-gold" : "border-border bg-card hover:border-gold"}`}>
            <Type className="size-3.5" /> تعديل نصي
          </button>
        )}
        {done && !approved && (
          <span className="text-[11px] text-amber-700 font-bold">بانتظار اعتماد الفني…</span>
        )}
        {approved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
            <Check className="size-3.5" /> اعتمد الفني التعديل
          </span>
        )}
      </div>

      <FileDropZone
        busy={busy}
        onFiles={async (list) => {
          for (const f of Array.from(list ?? [])) {
            if (RAR_RE.test(f.name)) await uploadRevision(f);
            else if (HTML_RE.test(f.name)) await uploadRevisionHtml(f);
            else toast.error(`صيغة غير مدعومة: ${f.name} (المسموح .rar و .html)`);
          }
        }}
        title="اسحب ملفات التعديل وأفلتها هنا (.rar / .html)"
        hint="يمكن الرفع أكثر من مرة — قبل التعديل وبعده"
      />


      {textMode && !done && (
        <div className="space-y-2 rounded-lg border border-gold/40 bg-card p-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
            placeholder="اكتب تفاصيل التعديل النصي للفني…"
            className="w-full rounded-lg border border-input bg-background p-2 text-sm outline-none focus:border-gold" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setTextMode(false); setText(""); }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold">إلغاء</button>
            <button type="button" onClick={sendRevisionText} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg gradient-brown px-3 py-1.5 text-xs font-bold shadow-luxury disabled:opacity-50">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              إرسال النص للفني
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============== TECHNICIAN ==============
function TechnicianControls({ c, actorName, doctorName, target }: {
  c: WorkflowCase; actorName: string; doctorName: string; target: RoleKey | null;
}) {
  const [busy, setBusy] = useState(false);
  const designReady = !!(c.design_file_sent || c.design_done);
  const confirmed = !!c.design_received_by_tech;
  const fabDone = !!c.fabrication_done;
  const dataSent = !!c.tech_data_sent_to_secretary;

  // Auto-confirm "read by technician" when this card mounts (technician opened it).
  useEffect(() => {
    if (!designReady || confirmed) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.from("slot_cases")
        .update({ design_received_by_tech: true, design_read_at: new Date().toISOString() })
        .eq("id", c.id);
      if (cancelled || error) return;
      const designerConv = await ensureConv(c, "technician", "designer", doctorName);
      if (designerConv) await supabase.from("chat_messages").insert({
        conversation_id: designerConv, sender: "technician", sender_name: actorName,
        content: `✅ فتح الفني ملف التصميم — الحالة ${c.case_code} (${c.patient_name}).`,
        message_type: "text",
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, designReady, confirmed]);

  async function toggleFabDone() {
    if (busy) return;
    // Single click on "تم النحت": mark carved AND auto-send the case data to
    // the branch secretary (and notify the doctor) in one step.
    if (!fabDone) {
      if (target && !dataSent) { await sendDataToSecretary(); return; }
      setBusy(true);
      const { error } = await supabase.from("slot_cases")
        .update({ fabrication_done: true }).eq("id", c.id);
      setBusy(false);
      if (error) toast.error(error.message);
      else toast.success("✅ تم النحت");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ fabrication_done: false }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("تم إلغاء العلامة");
  }

  async function sendDataToSecretary() {
    if (!target) { toast.error("لا يوجد فرع سكرتارية محدد"); return; }
    // No shade gate here: the doctor confirms the shade later, at the
    // "قيد المراجعة" stage. Requiring the technician's shade confirmation
    // first created a deadlock (technician confirm is locked until the
    // doctor confirms, and the doctor's prompt only shows after review).

    setBusy(true);
    const lines = [
      `📋 حالة جاهزة للإرسال`,
      `رمز: ${c.case_code}`,
      `الطبيب: ${doctorName}`,
      `المريض: ${c.patient_name}`,
      c.patient_phone ? `الهاتف: ${c.patient_phone}` : null,
      c.patient_age ? `العمر: ${c.patient_age}` : null,
      c.patient_gender ? `الجنس: ${c.patient_gender === "male" ? "ذكر" : "أنثى"}` : null,
      c.tooth_number ? `السن: ${c.tooth_number}` : null,
      c.teeth_count ? `عدد الأسنان: ${c.teeth_count}` : null,
      c.shade ? `اللون: ${c.shade}` : null,
      c.case_type ? `النوع: ${c.case_type}` : null,
      c.notes ? `ملاحظات: ${c.notes}` : null,
    ].filter(Boolean).join("\n");
    // Notify secretary
    const convId = await ensureConv(c, "technician", target, doctorName);
    if (convId) await supabase.from("chat_messages").insert({
      conversation_id: convId, sender: "technician", sender_name: actorName,
      content: lines, message_type: "text",
    });
    // Also notify doctor (replaces "تم إرسال المؤقت" confirmation)
    const docConv = await ensureConv(c, "technician", "doctor", doctorName);
    if (docConv) await supabase.from("chat_messages").insert({
      conversation_id: docConv, sender: "technician", sender_name: actorName,
      content: `🦷 تم نحت المؤقت — الحالة ${c.case_code} (${c.patient_name}) جاهزة للمراجعة.`,
      message_type: "text",
    });
    // Auto-flip the stage to "doctor_review" by setting both flags.
    const { error } = await supabase.from("slot_cases")
      .update({
        tech_data_sent_to_secretary: true,
        fabrication_done: true,
        shipped_to_doctor: true,
        review_sent_at: new Date().toISOString(),
      }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(`✅ تم النحت وإرسال بيانات الحالة إلى ${ROLE_LABEL[target]} والطبيب`);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      {c.shade && (
        <CaseShadeConfirm
          shade={c.shade}
          caseId={c.id}
          actor="technician"
          doctorConfirmed={c.shade_confirmed_doctor}
          designerConfirmed={c.shade_confirmed_designer}
          technicianConfirmed={c.shade_confirmed_technician}
        />
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={toggleFabDone} disabled={busy}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition border
            ${fabDone ? "gradient-gold text-gold-foreground border-gold shadow-gold" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : fabDone ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
          تم النحت
        </button>
        {!dataSent && target && (
          <button onClick={sendDataToSecretary} disabled={busy || !confirmed}
            className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury disabled:opacity-50">
            <Send className="size-3.5" /> إرسال البيانات إلى {ROLE_LABEL[target]}
          </button>
        )}
        {dataSent && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
            <Check className="size-3.5" /> تم إرسال بيانات الحالة
          </span>
        )}
      </div>

      <TechnicianPermanentSection c={c} actorName={actorName} doctorName={doctorName} />
    </div>
  );
}

// ---------- Technician: permanent-cycle (after doctor decision) ----------
function TechnicianPermanentSection({ c, actorName, doctorName }: {
  c: WorkflowCase; actorName: string; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const decision = c.doctor_decision;
  const approved = decision === "approved";
  const revisionPending = decision === "revision" && !c.revision_design_done;
  const revisionReady = decision === "revision" && c.revision_design_done;
  const revisionApproved = !!c.revision_approved_by_tech;
  const permDone = !!c.permanent_fabrication_done;
  if (!approved && !revisionPending && !revisionReady && !permDone) return null;

  // Auto-approve the revision the moment the technician sees the revised rar file.
  // This flips the stage badge from "قيد المراجعة" → "اعتماد نهائي" automatically.
  useEffect(() => {
    if (!revisionReady || revisionApproved) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.from("slot_cases")
        .update({ revision_approved_by_tech: true }).eq("id", c.id);
      if (cancelled || error) return;
      const conv = await ensureConv(c, "technician", "designer", doctorName);
      if (conv) await supabase.from("chat_messages").insert({
        conversation_id: conv, sender: "technician", sender_name: actorName,
        content: `✅ استلم الفني ملف التعديل — الحالة ${c.case_code} (${c.patient_name}). يبدأ نحت الدائم.`,
        message_type: "text",
      });
      const dconv = await ensureConv(c, "technician", "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: "technician", sender_name: actorName,
        content: `✅ تم استلام التعديل — الحالة ${c.case_code} في مرحلة الاعتماد النهائي.`,
        message_type: "text",
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, revisionReady, revisionApproved]);


  /** Single-checkbox flow: when ticked, mark permanent done AND notify
   *  the doctor + both secretaries (sanaa & ibb) automatically. */
  async function togglePermDone() {
    if (busy) return;
    setBusy(true);
    const next = !permDone;
    const patch: any = { permanent_fabrication_done: next };
    if (next) {
      patch.permanent_shipped_to_secretary = true;
      patch.perm_sent_at = new Date().toISOString();
    }
    const { error } = await supabase.from("slot_cases").update(patch).eq("id", c.id);
    if (error) { setBusy(false); toast.error(error.message); return; }
    if (next) {
      const msg = `🦷 تم نحت الأسنان الدائمة — الحالة ${c.case_code} (${c.patient_name}).\nالطبيب: ${doctorName}.\nالأسنان قيد الترحيل.`;
      // Notify the doctor + ONLY the matching-branch secretary (avoid
      // re-creating conversations with the wrong-branch secretary).
      const secRole = await branchSecretaryRole(c.doctor_slot);
      const roles: RoleKey[] = ["doctor"];
      if (secRole) roles.push(secRole);
      for (const role of roles) {
        const conv = await ensureConv(c, "technician", role, doctorName);
        if (conv) await supabase.from("chat_messages").insert({
          conversation_id: conv, sender: "technician", sender_name: actorName,
          content: msg, message_type: "text",
        });
      }
      toast.success("✅ تم تسجيل نحت الدائم وإشعار الطبيب والسكرتارية");
    } else {
      toast.success("تم إلغاء العلامة");
    }
    setBusy(false);
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${revisionPending ? "border-amber-500/60 bg-amber-50/70" : "border-emerald-500/40 bg-emerald-50/40"}`}>
      <div className={`text-xs font-bold flex items-center gap-1.5 ${revisionPending ? "text-amber-900" : "text-emerald-800"}`}>
        {revisionPending ? <Pencil className="size-3.5" /> : <ThumbsUp className="size-3.5" />}
        {revisionPending ? "🔁 طلب تعديل من الطبيب — بانتظار ملف rar المعدل من المصمم"
          : approved ? "تم الاعتماد النهائي من الطبيب — جاهز لنحت الدائم"
          : revisionReady && !revisionApproved ? "جاري اعتماد التعديل تلقائياً…"
          : "نحت الأسنان الدائمة"}
      </div>
      {revisionPending && c.revision_notes && (
        <div className="text-xs whitespace-pre-wrap rounded border border-amber-300 bg-white/70 p-2 text-amber-900">
          ملاحظات الطبيب:{"\n"}{c.revision_notes}
        </div>
      )}
      {(approved || revisionApproved) && (
        <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold rounded-lg border border-border bg-card px-3 py-2 hover:border-gold">
          <input type="checkbox" checked={permDone} onChange={togglePermDone} disabled={busy}
            className="size-4 accent-gold" />
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          تم نحت الزركون الدائم
          {permDone && <Check className="size-3.5 text-emerald-600" />}
        </label>
      )}
    </div>
  );
}

// ============== SECRETARY ==============
function SecretaryControls({ c, actorName, actor, doctorName }: {
  c: WorkflowCase; actorName: string; actor: "secretary_sanaa" | "secretary_ibb"; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const received = !!c.secretary_received;
  const shipped = !!c.shipped_to_doctor;
  const tempOk = !!c.received_temporary;
  const permOk = !!c.received_permanent;
  const permSent = !!c.permanent_shipped_to_secretary;
  const permReceived = !!c.permanent_received_by_secretary;
  const permDelivered = !!c.permanent_delivered_to_doctor;
  const installed = !!c.permanent_installed_by_doctor;
  const archived = !!c.final_archived;

  async function markReceived() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ secretary_received: true }).eq("id", c.id);
    if (!error) {
      const convId = await ensureConv(c, actor, "technician", doctorName);
      if (convId) await supabase.from("chat_messages").insert({
        conversation_id: convId, sender: actor, sender_name: actorName,
        content: `✅ استلمت السكرتارية بيانات الحالة ${c.case_code} (${c.patient_name}).`,
        message_type: "text",
      });
      const dconv = await ensureConv(c, actor, "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: actor, sender_name: actorName,
        content: `🦷 تم استلام الأسنان المؤقتة (للتجربة) — الحالة ${c.case_code} (${c.patient_name}). جاهزة للإرسال إليكم.`,
        message_type: "text",
      });
      toast.success("تم استلام البيانات");
    } else toast.error(error.message);
    setBusy(false);
  }

  async function toggleTeeth(kind: "temp" | "perm") {
    setBusy(true);
    const patch: any = kind === "temp"
      ? { received_temporary: !tempOk }
      : { received_permanent: !permOk };
    const { error } = await supabase.from("slot_cases").update(patch).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
  }

  async function confirmPermReceipt() {
    if (!window.confirm("تأكيد استلام الأسنان الدائمة من الفني؟")) return;
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ permanent_received_by_secretary: true, received_permanent: true }).eq("id", c.id);
    if (!error) {
      const tconv = await ensureConv(c, actor, "technician", doctorName);
      if (tconv) await supabase.from("chat_messages").insert({
        conversation_id: tconv, sender: actor, sender_name: actorName,
        content: `✅ تم استلام الأسنان الدائمة — الحالة ${c.case_code} (${c.patient_name}).`,
        message_type: "text",
      });
      const dconv = await ensureConv(c, actor, "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: actor, sender_name: actorName,
        content: `🦷 الأسنان الدائمة جاهزة للإرسال إليكم — الحالة ${c.case_code} (${c.patient_name}).`,
        message_type: "text",
      });
      toast.success("✅ تم تأكيد استلام الدائم");
    } else toast.error(error.message);
    setBusy(false);
  }

  async function deliverPermanent() {
    if (!window.confirm("تأكيد إرسال الأسنان الدائمة للطبيب؟")) return;
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ permanent_delivered_to_doctor: true }).eq("id", c.id);
    if (!error) {
      const dconv = await ensureConv(c, actor, "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: actor, sender_name: actorName,
        content: `🚚 تم إرسال الأسنان الدائمة — الحالة ${c.case_code} (${c.patient_name}).`,
        message_type: "text",
      });
      toast.success("تم إرسال الدائم للطبيب");
    } else toast.error(error.message);
    setBusy(false);
  }


  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!received ? (
          <button onClick={markReceived} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            تأكيد استلام البيانات
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
            <Check className="size-3.5" /> تم استلام البيانات
          </span>
        )}
        {shipped && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold border border-emerald-500 bg-emerald-50 rounded-lg px-2 py-1">
            <Truck className="size-3.5" /> تم إرسال المؤقت
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/60">
        <span className="text-[11px] font-bold text-muted-foreground">استلام الأسنان:</span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
          <input type="checkbox" checked={tempOk} onChange={() => toggleTeeth("temp")} disabled={busy}
            className="size-4 accent-gold" />
          أسنان مؤقتة {tempOk && <Check className="size-3 text-emerald-600" />}
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
          <input type="checkbox" checked={permOk} onChange={() => toggleTeeth("perm")} disabled={busy}
            className="size-4 accent-gold" />
          أسنان دائمة {permOk && <Check className="size-3 text-emerald-600" />}
        </label>
      </div>

      {(permSent || permReceived || permDelivered || installed || archived) && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-50/40 p-3 space-y-2">
          <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
            <Truck className="size-3.5" /> الأسنان الدائمة
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {permSent && !permReceived && (
              <button onClick={confirmPermReceipt} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                تأكيد استلام الدائم
              </button>
            )}
            {permReceived && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                <Check className="size-3.5" /> تم استلام الدائم
              </span>
            )}
            {permReceived && !permDelivered && (
              <button onClick={deliverPermanent} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold">
                <Truck className="size-3.5" /> تأكيد إرسال الدائم للطبيب
              </button>
            )}
            {permDelivered && !installed && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold">
                بانتظار تأكيد التركيب من الطبيب…
              </span>
            )}
            {installed && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                <Check className="size-3.5" /> تم التركيب
              </span>
            )}
            {archived && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                <Archive className="size-3.5" /> مؤرشفة نهائياً (تلقائياً)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== DOCTOR ==============
async function appendAudit(c: WorkflowCase, entry: { actor: string; action: string; notes?: string }) {
  const prev = Array.isArray(c.audit_log) ? c.audit_log : [];
  const next = [...prev, { at: new Date().toISOString(), ...entry }];
  await supabase.from("slot_cases").update({ audit_log: next as any }).eq("id", c.id);
}

function DoctorControls({ c, actorName, doctorName }: {
  c: WorkflowCase; actorName: string; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [revFiles, setRevFiles] = useState<File[]>([]);
  const revFileRef = useRef<HTMLInputElement>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [revShadeConfirmed, setRevShadeConfirmed] = useState(false);
  const [revShade, setRevShade] = useState(c.shade ?? "");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [reviewShade, setReviewShade] = useState(c.shade ?? "");

  /** One-time mandatory shade confirmation at the review stage. */
  async function confirmReviewShade() {
    const next = reviewShade.trim();
    if (!next) { toast.error("اختر لون السن أولاً"); return; }
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ shade: next, shade_confirmed_doctor: true }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("✅ تم تأكيد لون السن");
  }


  // Review is ready as soon as the technician dispatches the data.
  // The doctor no longer needs to confirm receipt of the temporary first.
  const reviewReady = !!(c.tech_data_sent_to_secretary || c.shipped_to_doctor);
  const decision = c.doctor_decision;
  // Permanent is "ready for install" once the technician marks it carved.
  const permReady = !!c.permanent_fabrication_done;
  const installed = !!c.permanent_installed_by_doctor;
  const archived = !!c.final_archived;
  const log = Array.isArray(c.audit_log) ? c.audit_log : [];

  // Auto-mark the "permanent done" notification as delivered+read when the
  // doctor's card mounts and the technician has carved the permanent.
  useEffect(() => {
    if (!permReady || installed) return;
    if (c.perm_read_at) return;
    let cancelled = false;
    (async () => {
      const now = new Date().toISOString();
      const patch: any = { perm_read_at: now };
      if (!c.perm_delivered_at) patch.perm_delivered_at = now;
      await supabase.from("slot_cases").update(patch).eq("id", c.id);
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, permReady, installed]);

  async function approve() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({
        doctor_decision: "approved",
        temporary_delivered: true,
        review_read_at: new Date().toISOString(),
      }).eq("id", c.id);
    if (!error) {
      await appendAudit(c, { actor: actorName || "الطبيب", action: "اعتماد التصميم للدائم" });
      const details = [
        `الحالة ${c.case_code}`,
        `المريض: ${c.patient_name}`,
        c.tooth_number ? `السن: ${c.tooth_number}` : null,
        c.teeth_count ? `عدد الأسنان: ${c.teeth_count}` : null,
        c.shade ? `اللون: ${c.shade}` : null,
        c.case_type ? `النوع: ${c.case_type}` : null,
      ].filter(Boolean).join(" — ");
      // 1) Designer: approval + archive prompt
      const dConv = await ensureConv(c, "doctor", "designer", doctorName);
      if (dConv) await supabase.from("chat_messages").insert({
        conversation_id: dConv, sender: "doctor", sender_name: actorName,
        content: `✅ تم اعتماد التصميم للحالة ${details}. بإمكانك أرشفتها.`,
        message_type: "text",
      });
      // 2) Technician: carve the permanent as-is
      const tConv = await ensureConv(c, "doctor", "technician", doctorName);
      if (tConv) await supabase.from("chat_messages").insert({
        conversation_id: tConv, sender: "doctor", sender_name: actorName,
        content: `لا تعديل، قم بنحت الدائم وفق التصميم الحالي — ${details}.`,
        message_type: "text",
      });
      toast.success("✅ تم الاعتماد وإشعار المصمم والفني");
      setConfirmApprove(false);
    } else toast.error(error.message);
    setBusy(false);
  }

  async function requestRevision() {
    if (notes.trim().length < 3) { toast.error("اكتب ملاحظات التعديل"); return; }
    const nextShade = revShade.trim();
    if (!nextShade) { toast.error("الرجاء اختيار لون السن قبل إرسال طلب التعديل"); return; }
    if (!revShadeConfirmed) { toast.error("الرجاء تأكيد اللون قبل إرسال طلب التعديل"); return; }
    setBusy(true);
    const trimmed = notes.trim();
    const shadeChanged = (c.shade ?? "").trim().toUpperCase() !== nextShade.toUpperCase();
    const { error } = await supabase.from("slot_cases")
      .update({
        doctor_decision: "revision",
        revision_notes: trimmed,
        // Open a brand-new revision round: clear the previous designer
        // response so a new modified file can be uploaded and reviewed.
        revision_design_done: false,
        revision_approved_by_tech: false,
        revision_design_file_path: null,
        revision_design_file_name: null,
        // The HTML attachment belongs to the current revision round too.
        design_html_sent: false,
        design_html_path: null,
        design_html_name: null,
        temporary_delivered: true,
        shade: nextShade || null,
        shade_confirmed_doctor: true,
        shade_confirmed_designer: false,
        shade_confirmed_technician: false,
        review_read_at: new Date().toISOString(),
      }).eq("id", c.id);
    if (!error) {
      {
        const { openRevisionRound } = await import("@/lib/revision-rounds");
        await openRevisionRound({
          caseId: c.id, caseCode: c.case_code, patientName: c.patient_name,
          doctorSlot: (c as any).doctor_slot ?? null, doctorName,
          notes: trimmed, shade: nextShade || null,
        });
      }
      await appendAudit(c, {
        actor: actorName || "الطبيب",
        action: shadeChanged ? `طلب تعديل التصميم (تغيير اللون إلى ${nextShade || "—"})` : "طلب تعديل التصميم",
        notes: trimmed,
      });
      const shadeLine = nextShade
        ? shadeChanged
          ? `\n🎨 تم تعديل اللون إلى: ${nextShade}`
          : `\n🎨 اللون: ${nextShade}`
        : "";
      const designerBody = `🔁 طلب تعديل تصميم — الحالة ${c.case_code} (${c.patient_name})${shadeLine}\nملاحظات:\n${trimmed}`;
      const techBody = `🔁 طلب تعديل من الطبيب — الحالة ${c.case_code} (${c.patient_name}). بانتظار وصول ملف rar المعدل من المصمم.${shadeLine}\nملاحظات الطبيب:\n${trimmed}`;
      // Upload each attachment ONCE (with progress tube), then reference the
      // same stored path in both the designer and technician conversations.
      const uploaded: { name: string; path: string; mime: string | null; size: number }[] = [];
      for (const f of revFiles) {
        const up = await uploadAttachment(f, c, "revision-notes");
        if (up) uploaded.push({ name: f.name, path: up.path, mime: f.type || null, size: f.size });
      }
      for (const role of ["designer", "technician"] as RoleKey[]) {
        const conv = await ensureConv(c, "doctor", role, doctorName);
        if (!conv) continue;
        await supabase.from("chat_messages").insert({
          conversation_id: conv, sender: "doctor", sender_name: actorName,
          content: role === "designer" ? designerBody : techBody,
          message_type: "text",
        });
        for (const u of uploaded) {
          await supabase.from("chat_messages").insert({
            conversation_id: conv, sender: "doctor", sender_name: actorName,
            content: `📎 مرفق طلب التعديل: ${u.name}`,
            message_type: "file",
            attachment_path: u.path,
            attachment_name: u.name,
            attachment_mime: u.mime,
            attachment_size: u.size,
          });
        }
      }
      toast.success("✅ تم إرسال طلب التعديل للمصمم والفني");
      setRevOpen(false);
      setNotes("");
      setRevFiles([]);
    } else toast.error(error.message);
    setBusy(false);
  }


  // Installing the permanent now goes through the archive-request editor
  // (receipt photo → administration approval), see ArchiveReceiptEditor.


  // The doctor's decision panel stays open for as many revision rounds as
  // needed — it only closes once the permanent is carved / installed / archived.
  const canDecide = reviewReady && !permReady && !installed && !archived;
  const hasAction = canDecide || (permReady && !installed);
  const stageHint =
    archived ? "تمت أرشفة الحالة نهائياً ✅" :
    installed && c.archive_approval === "pending" ? "أُرسل سند حساب المريض — بانتظار موافقة الإدارة على الأرشفة" :
    installed && c.archive_approval === "rejected" ? "لم توافق الإدارة على الأرشفة — أعد إرسال سند الحساب" :
    permReady ? "تم نحت الأسنان الدائمة — أكد التركيب عند الانتهاء" :

    decision === "approved" ? "تم الاعتماد — بانتظار نحت الدائم من الفني" :
    decision === "revision" ? "تم إرسال طلب التعديل — بانتظار المصمم" :
    reviewReady ? "تمت المراجعة قيد قرارك — اختر معتمد للدائم أو يلزم تعديل" :
    "الحالة قيد التنفيذ — تابع مستوى التقدم";

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      {c.id && <CaseFileActivityLog caseId={c.id} />}
      {!hasAction && (
        <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
          <AlertCircle className="size-3.5 text-gold" /> {stageHint}
        </div>
      )}

      {/* Persistent notes channel: always open until the case is finally
          archived, so the doctor can keep sending notes/images (with drawings
          and measurements) to the designer and technician in parallel. */}
      {!archived && (
        <DoctorNotesComposer c={c} actorName={actorName} doctorName={doctorName} />
      )}




      {/* Mandatory ONE-TIME shade confirmation: shown only at the review
          stage (after the technician marks "تم النحت"). Once the doctor
          confirms, it never appears again. */}
      {canDecide && !c.shade_confirmed_doctor && (
        <div className="rounded-xl border border-gold/50 bg-gold/5 p-3 space-y-2.5">
          <div className="text-[11px] font-bold text-destructive">
            تأكيد لون السن إلزامي قبل اتخاذ قرارك (مرة واحدة فقط).
          </div>
          <ShadePicker value={reviewShade} onChange={setReviewShade} collapsible />
          {reviewShade.trim() ? (
            <ShadeConfirm shade={reviewShade} confirmed={false} onConfirm={confirmReviewShade} />
          ) : (
            <div className="text-[11px] font-bold text-destructive">اختر لون السن أولاً.</div>
          )}
        </div>
      )}

      {canDecide && !!c.shade_confirmed_doctor && !confirmApprove && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-foreground">
            {decision ? "قرارك متاح دائماً — يمكنك طلب تعديل آخر أو الاعتماد النهائي:" : "قرار الطبيب بعد المراجعة:"}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setConfirmApprove(true)} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold shadow">
              <ThumbsUp className="size-3.5" /> معتمد للدائم
            </button>
            <button onClick={() => { setRevShade(c.shade ?? ""); setRevShadeConfirmed(false); setRevOpen(true); }} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-xs font-bold shadow">
              <Pencil className="size-3.5" /> {decision === "revision" ? "طلب تعديل آخر" : "يلزم تعديل"}
            </button>
          </div>
        </div>
      )}

      {canDecide && confirmApprove && (
        <div className="rounded-lg border border-emerald-500/60 bg-emerald-50/70 p-3 space-y-2 animate-in fade-in zoom-in-95">
          <div className="text-xs font-bold text-emerald-900">
            هل أنت متأكد أن التصميم لا يتطلب تعديل؟
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setConfirmApprove(false)} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold">
              <X className="size-3.5" /> تراجع
            </button>
            <button onClick={approve} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold shadow">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              تأكيد الاعتماد
            </button>
          </div>
        </div>
      )}

      {decision === "approved" && !permReady && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
          <ThumbsUp className="size-3.5" /> تم الاعتماد — بانتظار نحت الدائم
        </span>
      )}

      {decision === "revision" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50/50 p-2 text-xs">
          <div className="font-bold text-amber-800 flex items-center gap-1.5 mb-1">
            <Pencil className="size-3.5" /> تم إرسال طلب التعديل
          </div>
          {c.revision_notes && (
            <div className="whitespace-pre-wrap text-amber-900">{c.revision_notes}</div>
          )}
          {c.revision_design_done && (
            <div className="mt-1 text-emerald-700 font-bold flex items-center gap-1">
              <Check className="size-3" /> أنجز المصمم التعديل
            </div>
          )}
        </div>
      )}

      {permReady && (!installed || c.archive_approval === "rejected") && (
        <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold rounded-lg border border-emerald-500/60 bg-emerald-50/60 px-3 py-2 hover:border-emerald-600">
          <input type="checkbox" checked={false} onChange={() => setReceiptOpen(true)} disabled={busy}
            className="size-4 accent-emerald-600" />
          تم تركيب الأسنان الدائمة للمريض (أرشفة تلقائية)
        </label>
      )}

      {(c.archive_approval || archived) && (
        <ArchiveRequestStatus c={c as any} />
      )}

      {archived && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold border border-emerald-500 bg-emerald-50 rounded-lg px-2 py-1">
          <Archive className="size-3.5" /> تم التركيب — مؤرشفة نهائياً
        </span>
      )}

      {receiptOpen && (
        <ArchiveReceiptEditor c={c as any} actorName={actorName} doctorName={doctorName}
          onClose={() => setReceiptOpen(false)} />
      )}


      {/* Audit log */}
      <div className="pt-2 border-t border-border/60">
        <button onClick={() => setLogOpen(o => !o)}
          className="w-full flex items-center justify-between text-[11px] font-bold text-muted-foreground hover:text-foreground transition">
          <span className="flex items-center gap-1.5">
            <FileCode className="size-3.5" /> سجل تدقيق قرارات الطبيب ({log.length})
          </span>
          {logOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {logOpen && (
          <ul className="mt-2 space-y-1.5 max-h-48 overflow-auto">
            {log.length === 0 && (
              <li className="text-[11px] text-muted-foreground italic">لا توجد قرارات مسجلة بعد.</li>
            )}
            {log.slice().reverse().map((e, i) => (
              <li key={i} className="rounded-md border border-border bg-card/60 p-2 text-[11px] space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-gold">{e.action}</span>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {new Date(e.at).toLocaleString("ar")}
                  </span>
                </div>
                <div className="text-muted-foreground">بواسطة: <b className="text-foreground">{e.actor}</b></div>
                {e.notes && <div className="whitespace-pre-wrap text-foreground/90">📝 {e.notes}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {revOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-card border border-border p-5 shadow-luxury">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">ملاحظات التعديل المطلوب</div>
              <button onClick={() => setRevOpen(false)} className="rounded-lg p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            {/* محرر موحّد: تظهر الملفات المرفوعة داخل محرر ملاحظات التعديل نفسه */}
            <div className="rounded-xl border border-input bg-background overflow-hidden focus-within:border-gold transition">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
                <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-gold" /> محرر ملاحظات التعديل
                </span>
                <button
                  type="button"
                  onClick={() => revFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold/60 bg-gold/5 px-2.5 py-1 text-[11px] font-bold hover:bg-gold/10"
                >
                  <FileArchive className="size-3.5" /> إرفاق ملف
                </button>
                <input
                  ref={revFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (e.target) e.target.value = "";
                    if (list.length) setRevFiles(prev => [...prev, ...list]);
                  }}
                />
              </div>

              {revFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2 p-2.5 border-b border-border/60 bg-muted/20 max-h-56 overflow-auto">
                  {revFiles.map((f, i) => (
                    <RevAttachmentPreview
                      key={i}
                      file={f}
                      onRemove={() => setRevFiles(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              )}

              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
                placeholder="اكتب الملاحظات التفصيلية للتعديل… ويمكنك إرفاق الملفات لتظهر داخل المحرر."
                className="w-full bg-transparent p-3 text-sm outline-none border-0 resize-y" />
            </div>

            <div className="mt-3 rounded-xl border border-gold/40 bg-gold/5 p-3 space-y-2.5">
              <div className="text-[11px] font-bold text-amber-800">
                يمكنك تعديل لون السن أثناء كتابة الملاحظات — ثم أعد تأكيد اللون.
                سيُطلب من المصمم والفني تأكيده مجدداً.
              </div>
              <ShadePicker
                value={revShade}
                onChange={(s) => { setRevShade(s); setRevShadeConfirmed(false); }}
                collapsible
              />
              <div className="pt-1 border-t border-gold/30">
                {revShade.trim() ? (
                  <ShadeConfirm
                    shade={revShade}
                    confirmed={revShadeConfirmed}
                    onConfirm={() => setRevShadeConfirmed(true)}
                  />
                ) : (
                  <div className="text-[11px] font-bold text-destructive">اختر لون السن أولاً (إلزامي).</div>
                )}
              </div>
            </div>


            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setRevOpen(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">
                إلغاء
              </button>
              <button onClick={requestRevision} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg gradient-brown px-4 py-2 text-xs font-bold shadow-luxury">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                إرسال للمصمم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Preview tile for a revision attachment: shows the image inline, or a file
 *  icon for non-images, with a remove button. */
function RevAttachmentPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  return (
    <div className="relative group rounded-lg border border-border bg-muted/40 overflow-hidden">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 left-1 z-10 rounded-full bg-black/55 text-white p-0.5 hover:bg-destructive"
        aria-label="حذف"
      >
        <X className="size-3" />
      </button>
      {isImage && url ? (
        <img src={url} alt={file.name} className="h-20 w-full object-cover" />
      ) : (
        <div className="h-20 w-full grid place-items-center text-muted-foreground">
          <FileText className="size-7" />
        </div>
      )}
      <div className="px-1.5 py-1 border-t border-border/60">
        <div className="truncate text-[10px] font-bold" title={file.name}>{file.name}</div>
        <div className="text-[9px] text-muted-foreground font-mono">{(file.size / 1024).toFixed(1)} KB</div>
      </div>
    </div>
  );
}

// ============== DOCTOR: persistent notes / annotated-image channel ==============
/** Always-available editor letting the doctor send text notes and images
 *  (with drawings, arrows and point-to-point measurements) to the designer and
 *  technician at any time until the case is finally archived. Everything is
 *  posted into the case-scoped conversation, so it shows up inside the per-case
 *  chat on the doctor, designer and technician pages. */
function DoctorNotesComposer({ c, actorName, doctorName }: {
  c: WorkflowCase; actorName: string; doctorName: string;
}) {
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  // Dims the send button once a batch is successfully sent; any new edit
  // (typing, attaching, annotating) re-activates it.
  const [sent, setSent] = useState(false);
  const [annotateIdx, setAnnotateIdx] = useState<number | null>(null);
  // Annotate an already-sent case image (stays editable until final archive).
  const [annotateSent, setAnnotateSent] = useState<{ url: string; name: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string }[] | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipInfo, setZipInfo] = useState<{ name: string; size: number } | null>(
    c.extra_zip_path ? { name: c.extra_zip_name || "ملف.zip", size: c.extra_zip_size || 0 } : null,
  );
  // Voice recording (sends a voice reply to the case chat for the designer/tech).
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);

  const archived = !!c.final_archived;

  function addFiles(list: File[]) {
    if (list.length) { setFiles(prev => [...prev, ...list]); setSent(false); }
  }

  /** Attach a ZIP file directly to the case so it appears to the designer as a
   *  second ZIP next to the 3D-scan ZIP. Uploads immediately on pick. */
  async function attachZip(file: File) {
    setZipBusy(true);
    try {
      const up = await uploadAttachment(file, c, "doctor-notes");
      if (!up) { toast.error("تعذر رفع ملف ZIP"); return; }
      const mime = file.type || "application/zip";
      await supabase.from("slot_cases").update({
        extra_zip_path: up.url,
        extra_zip_name: file.name,
        extra_zip_mime: mime,
        extra_zip_size: file.size,
      }).eq("id", c.id);
      const convId = await ensureCaseConvAll(c);
      if (convId) {
        await supabase.from("chat_messages").insert({
          conversation_id: convId, sender: "doctor", sender_name: actorName,
          content: `🗜️ ملف ZIP إضافي من الطبيب — الحالة ${c.case_code}`,
          message_type: "file",
          attachment_path: up.url, attachment_name: file.name,
          attachment_mime: mime, attachment_size: file.size,
        });
      }
      setZipInfo({ name: file.name, size: file.size });
      const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
      const { deriveStageKey, getStage } = await import("@/lib/case-stages");
      autoSendFileToTelegram({
        kind: "zip", from: `الطبيب (${actorName})`, caseCode: c.case_code,
        patientName: c.patient_name, caseId: c.id,
        stageLabel: getStage(deriveStageKey(c as any)).label,
        url: up.url, filename: file.name,
      });
      toast.success("✅ تم إرفاق ملف ZIP للحالة");
    } catch (e: any) {
      toast.error(e?.message || "تعذر الإرفاق");
    } finally { setZipBusy(false); }
  }

  /** Record a voice clip and send it to the case chat for the designer/tech. */
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
        await sendVoice(blob);
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

  async function sendVoice(blob: Blob) {
    setBusy(true);
    try {
      const convId = await ensureCaseConvAll(c);
      if (!convId) { toast.error("تعذر فتح محادثة الحالة"); return; }
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
      const up = await uploadAttachment(file, c, "doctor-notes");
      if (!up) { toast.error("تعذر رفع التسجيل"); return; }
      await supabase.from("chat_messages").insert({
        conversation_id: convId, sender: "doctor", sender_name: actorName,
        content: `🎤 تسجيل صوتي من الطبيب — الحالة ${c.case_code}`,
        message_type: "audio",
        attachment_path: up.url, attachment_name: file.name,
        attachment_mime: file.type || "audio/webm", attachment_size: file.size,
      });
      toast.success("✅ تم إرسال التسجيل الصوتي للمصمم والفني");
    } catch (e: any) {
      toast.error(e?.message || "تعذر الإرسال");
    } finally { setBusy(false); }
  }

  /** Append an image to the case data (so it stays part of the case). */
  async function persistImageToCase(url: string, name: string) {
    const { data: row } = await supabase.from("slot_cases")
      .select("notes_images").eq("id", c.id).maybeSingle();
    const prev = Array.isArray((row as any)?.notes_images)
      ? ((row as any).notes_images as { url: string; name: string }[]) : [];
    await supabase.from("slot_cases")
      .update({ notes_images: [...prev, { url, name }] as any }).eq("id", c.id);
  }

  /** Replace an already-sent case image with the doctor's latest annotated
   *  version, in place, so the designer/technician always see the newest edit.
   *  Existing team comments stay attached by re-pointing them at the new URL. */
  async function replaceImageInCase(oldUrl: string, url: string, name: string) {
    const { data: row } = await supabase.from("slot_cases")
      .select("notes_images,notes_image_comments").eq("id", c.id).maybeSingle();
    const prev = Array.isArray((row as any)?.notes_images)
      ? ((row as any).notes_images as { url: string; name: string }[]) : [];
    const idx = prev.findIndex(i => i.url === oldUrl);
    const nextImages = idx >= 0
      ? prev.map((i, j) => (j === idx ? { url, name } : i))
      : [...prev, { url, name }];
    const prevCmts = Array.isArray((row as any)?.notes_image_comments)
      ? ((row as any).notes_image_comments as { image_url: string }[]) : [];
    const nextCmts = prevCmts.map(k => (k.image_url === oldUrl ? { ...k, image_url: url } : k));
    await supabase.from("slot_cases")
      .update({ notes_images: nextImages as any, notes_image_comments: nextCmts as any })
      .eq("id", c.id);
  }

  /** Re-send an annotated version of an already-sent case image. */
  async function sendAnnotatedImage(blob: Blob, name: string, oldUrl?: string) {
    setBusy(true);
    try {
      const convId = await ensureCaseConvAll(c);
      if (!convId) { toast.error("تعذر فتح محادثة الحالة"); return; }
      const file = new File([blob], name, { type: "image/png" });
      const up = await uploadAttachment(file, c, "doctor-notes");
      if (!up) { toast.error("تعذر رفع الصورة"); return; }
      await supabase.from("chat_messages").insert({
        conversation_id: convId, sender: "doctor", sender_name: actorName,
        content: `🖼️ تحديث صورة من الطبيب (آخر تعديل) — الحالة ${c.case_code}`,
        message_type: "file",
        attachment_path: up.url, attachment_name: name,
        attachment_mime: "image/png", attachment_size: file.size,
      });
      if (oldUrl) await replaceImageInCase(oldUrl, up.url, name);
      else await persistImageToCase(up.url, name);
      const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
      autoSendFileToTelegram({
        kind: "image", from: `الطبيب (${actorName}) — صورة معدّلة بالرسم`,
        caseCode: c.case_code, patientName: c.patient_name, caseId: c.id,
        url: up.url, filename: name,
      });
      toast.success("✅ تم تحديث الصورة عند المصمم والفني بآخر تعديل");
      
    } catch (err: any) {
      toast.error(err?.message || "تعذر الإرسال");
    } finally { setBusy(false); }
  }


  async function send() {
    if (notes.trim().length < 1 && files.length === 0) {
      toast.error("اكتب ملاحظة أو أرفق صورة/ملف أولاً");
      return;
    }
    setBusy(true);
    try {
      const convId = await ensureCaseConvAll(c);
      if (!convId) { toast.error("تعذر فتح محادثة الحالة"); return; }
      if (notes.trim().length >= 1) {
        await supabase.from("chat_messages").insert({
          conversation_id: convId, sender: "doctor", sender_name: actorName,
          content: `📝 ملاحظة الطبيب — الحالة ${c.case_code}\n${notes.trim()}`,
          message_type: "text",
        });
      }
      const newImages: { url: string; name: string }[] = [];
      const allUploaded: { url: string; name: string }[] = [];
      for (const f of files) {
        const up = await uploadAttachment(f, c, "doctor-notes");
        if (!up) continue;
        const isImage = f.type.startsWith("image/");
        if (isImage) newImages.push({ url: up.url, name: f.name });
        allUploaded.push({ url: up.url, name: f.name });
        await supabase.from("chat_messages").insert({
          conversation_id: convId, sender: "doctor", sender_name: actorName,
          content: `${isImage ? "🖼️ صورة" : "📎 ملف"} من الطبيب — الحالة ${c.case_code}`,
          message_type: "file",
          attachment_path: up.url,
          attachment_name: f.name,
          attachment_mime: f.type || null,
          attachment_size: f.size,
        });
      }
      // Persist uploaded images onto the case so they appear in the designer's
      // case info (under the 3D scan) and remain part of the case data.
      if (newImages.length) {
        const { data: row } = await supabase.from("slot_cases")
          .select("notes_images").eq("id", c.id).maybeSingle();
        const prev = Array.isArray((row as any)?.notes_images)
          ? ((row as any).notes_images as { url: string; name: string }[]) : [];
        await supabase.from("slot_cases")
          .update({ notes_images: [...prev, ...newImages] as any }).eq("id", c.id);
      }
      if (allUploaded.length) {
        const { autoSendFilesToTelegram, buildCaseCaption } = await import("@/lib/telegram-auto");
        const { deriveStageKey, getStage } = await import("@/lib/case-stages");
        const onlyImages = allUploaded.length === newImages.length;
        autoSendFilesToTelegram(
          buildCaseCaption({
            icon: onlyImages ? "🖼️" : "📎",
            title: onlyImages ? "إرسال تلقائي — صور من الطبيب" : "إرسال تلقائي — ملفات من الطبيب",
            from: `الطبيب (${actorName})`,
            caseCode: c.case_code,
            patientName: c.patient_name,
            stageLabel: getStage(deriveStageKey(c as any)).label,
            caseId: c.id,
            filenames: allUploaded.map((i) => i.name),
          }),
          allUploaded.map((i) => ({ url: i.url, filename: i.name })),
        );
      }
      toast.success("✅ تم إرسال الملاحظات للمصمم والفني");
      setNotes(""); setFiles([]); setSent(true);

    } catch (err: any) {
      toast.error(err?.message || "تعذر الإرسال");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-card to-muted/20 p-3 space-y-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-foreground flex items-center gap-1.5">
          <FileText className="size-3.5 text-gold" /> ملاحظات وتواصل الحالة (للمصمم والفني)
        </span>
      </div>

      <div className="rounded-xl border border-input bg-background overflow-hidden focus-within:border-gold transition">
        <div className="flex items-center gap-2 flex-wrap border-b border-border/60 bg-muted/40 px-2 py-1.5">
          <button type="button" onClick={() => imgRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold/60 bg-gold/5 px-2.5 py-1 text-[11px] font-bold hover:bg-gold/10">
            <ImageIcon className="size-3.5" /> إضافة صورة
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-bold hover:border-gold">
            <FileArchive className="size-3.5" /> إرفاق ملف
          </button>
          <button type="button" onClick={() => zipRef.current?.click()} disabled={zipBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/5 px-2.5 py-1 text-[11px] font-bold hover:bg-amber-500/10 disabled:opacity-60">
            {zipBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5 text-amber-600" />} إرفاق ZIP
          </button>
          {recording ? (
            <span className="inline-flex items-center gap-1.5">
              <button type="button" onClick={() => stopRecording(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 text-white px-2.5 py-1 text-[11px] font-bold animate-pulse">
                <Square className="size-3.5" /> إيقاف وإرسال {String(Math.floor(recordSec / 60)).padStart(2, "0")}:{String(recordSec % 60).padStart(2, "0")}
              </button>
              <button type="button" onClick={() => stopRecording(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold hover:border-rose-600">
                <X className="size-3.5" /> إلغاء
              </button>
            </span>
          ) : (
            <button type="button" onClick={startRecording} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-rose-500/60 bg-rose-500/5 px-2.5 py-1 text-[11px] font-bold hover:bg-rose-500/10 disabled:opacity-60">
              <Mic className="size-3.5 text-rose-600" /> تسجيل صوتي
            </button>
          )}
          <span className="text-[10px] text-muted-foreground">اضغط على الصورة ثم «رسم وقياس» للشرح.</span>
          <input ref={imgRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const l = Array.from(e.target.files ?? []); if (e.target) e.target.value = ""; addFiles(l); }} />
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={(e) => { const l = Array.from(e.target.files ?? []); if (e.target) e.target.value = ""; addFiles(l); }} />
          <input ref={zipRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (e.target) e.target.value = ""; if (f) void attachZip(f); }} />
        </div>

        {zipInfo && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border/60 bg-amber-500/5 text-[11px]">
            <FileArchive className="size-3.5 text-amber-600 shrink-0" />
            <span className="font-bold text-amber-700">ملف ZIP إضافي مرفق:</span>
            <span className="truncate">{zipInfo.name}</span>
            {zipInfo.size > 0 && <span className="text-muted-foreground shrink-0">({(zipInfo.size / 1024 / 1024).toFixed(1)} MB)</span>}
          </div>
        )}

        {files.length > 0 && (
          <div className="grid grid-cols-3 gap-2 p-2 border-b border-border/60 bg-muted/20 max-h-64 overflow-auto">
            {files.map((f, i) => (
              <NoteAttachmentTile
                key={i}
                file={f}
                onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                onAnnotate={f.type.startsWith("image/") ? () => setAnnotateIdx(i) : undefined}
                onOpen={f.type.startsWith("image/")
                  ? (url) => { setLightbox([{ url, name: f.name }]); setLightboxIdx(0); }
                  : undefined}
              />
            ))}
          </div>
        )}

        <textarea value={notes} onChange={e => { setNotes(e.target.value); setSent(false); }} rows={3}
          placeholder="اكتب ملاحظاتك للمصمم والفني… يمكنك إرفاق صور والرسم عليها لشرح المطلوب."
          className="w-full bg-transparent p-2.5 text-sm outline-none border-0 resize-y" />
      </div>

      {/* Images already sent for this case remain interactive and editable
          (open / annotate / re-send) until the case is finally archived, with
          any replies (comments) the designer/technician left on each one. */}
      {Array.isArray(c.notes_images) && c.notes_images.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-2.5 space-y-2.5">
          <div className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
            <ImageIcon className="size-3.5 text-gold" /> صور الحالة وتعليقات الفريق
          </div>
          {c.notes_images.map((img, idx) => {
            const cmts = (c.notes_image_comments ?? []).filter(k => k.image_url === img.url);
            return (
              <div key={img.url} className="flex gap-2.5">
                <div className="shrink-0 space-y-1">
                  <button type="button"
                    onClick={() => { setLightbox(c.notes_images as { url: string; name: string }[]); setLightboxIdx(idx); }}
                    className="block rounded-lg overflow-hidden border border-border hover:border-gold transition">
                    <img src={img.url} alt={img.name} loading="lazy" className="h-16 w-16 object-cover" />
                  </button>
                  {!archived && (
                    <button type="button" onClick={() => setAnnotateSent(img)}
                      className="inline-flex w-16 items-center justify-center gap-1 rounded-md bg-gold text-gold-foreground px-1 py-0.5 text-[9px] font-bold shadow-gold hover:brightness-105">
                      <Highlighter className="size-3" /> رسم
                    </button>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="truncate text-[10px] font-bold text-muted-foreground">{img.name}</div>
                  {cmts.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground">لا توجد تعليقات بعد.</div>
                  ) : cmts.map((k, ki) => (
                    <div key={ki} className="rounded-lg bg-background border border-border/60 px-2 py-1">
                      <div className="text-[10px] font-bold text-gold">{k.author_name || ROLE_LABEL[k.author_role as RoleKey] || k.author_role}</div>
                      <div className="text-[11px] whitespace-pre-wrap">{k.comment}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {sent && !busy && (
          <span className="text-[10px] font-bold text-emerald-600">✓ تم الإرسال</span>
        )}
        <button type="button" onClick={send} disabled={busy || sent}
          className="inline-flex items-center gap-1.5 rounded-lg gradient-brown px-4 py-2 text-xs font-bold shadow-luxury disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          إرسال للمصمم والفني
        </button>
      </div>

      {annotateIdx != null && files[annotateIdx] && (
        <AnnotatorHost
          file={files[annotateIdx]}
          onCancel={() => setAnnotateIdx(null)}
          onSave={(blob, name) => {
            const newFile = new File([blob], name, { type: "image/png" });
            setFiles(prev => prev.map((f, j) => j === annotateIdx ? newFile : f));
            setAnnotateIdx(null);
            setSent(false);
            toast.success("تم حفظ الشرح على الصورة");
          }}
        />
      )}

      {annotateSent && (
        <ImageAnnotator
          src={annotateSent.url}
          fileName={annotateSent.name.replace(/\.(png|jpe?g|webp|gif)$/i, "") + "-معدلة.png"}
          onCancel={() => setAnnotateSent(null)}
          onSave={async (blob, name) => {
            const target = annotateSent;
            setAnnotateSent(null);
            await sendAnnotatedImage(blob, name || `${target.name}-معدلة.png`, target.url);
          }}
        />
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox}
          index={lightboxIdx}
          onClose={() => setLightbox(null)}
          onIndexChange={setLightboxIdx}
        />
      )}
    </div>
  );
}

/** Bridges a File to the ImageAnnotator by creating a temporary object URL. */
function AnnotatorHost({ file, onCancel, onSave }: {
  file: File; onCancel: () => void; onSave: (blob: Blob, name: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return null;
  return <ImageAnnotator src={url} fileName={file.name} onCancel={onCancel} onSave={onSave} />;
}

/** Attachment tile for the doctor notes composer: inline image preview with
 *  "annotate" and "remove" actions, or a file icon for non-images. */
function NoteAttachmentTile({ file, onRemove, onAnnotate, onOpen }: {
  file: File; onRemove: () => void;
  onAnnotate?: () => void;
  onOpen?: (url: string) => void;
}) {
  const isImage = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  return (
    <div className="relative group rounded-lg border border-border bg-muted/40 overflow-hidden">
      <button type="button" onClick={onRemove}
        className="absolute top-1 left-1 z-10 rounded-full bg-black/55 text-white p-0.5 hover:bg-destructive"
        aria-label="حذف">
        <X className="size-3" />
      </button>
      {isImage && url ? (
        <button type="button" onClick={() => onOpen?.(url)} className="block w-full">
          <img src={url} alt={file.name} className="h-20 w-full object-cover" />
        </button>
      ) : (
        <div className="h-20 w-full grid place-items-center text-muted-foreground">
          <FileText className="size-7" />
        </div>
      )}
      {isImage && onAnnotate && (
        <button type="button" onClick={onAnnotate}
          className="absolute bottom-8 right-1 z-10 inline-flex items-center gap-1 rounded-md bg-gold text-gold-foreground px-1.5 py-0.5 text-[9px] font-bold shadow-gold hover:brightness-105">
          <Highlighter className="size-3" /> رسم وقياس
        </button>
      )}
      <div className="px-1.5 py-1 border-t border-border/60">
        <div className="truncate text-[10px] font-bold" title={file.name}>{file.name}</div>
        <div className="text-[9px] text-muted-foreground font-mono">{(file.size / 1024).toFixed(1)} KB</div>
      </div>
    </div>
  );
}



