import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckSquare, Square, Loader2, AlertCircle,
  FileArchive, FileCode, ChevronDown, ChevronUp, Check, Send, Truck,
  ThumbsUp, Pencil, X, Archive, Download, Type, FileText,
} from "lucide-react";
import type { RoleKey } from "@/lib/chat";
import { ROLE_LABEL, getSignedUrl } from "@/lib/chat";
import { CaseFileActivityLog } from "@/components/case-file-activity-log";
import { ShadeConfirm, ShadePicker } from "@/components/shade-confirm";

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
  case_type?: string | null;
  notes?: string | null;
  scan_path?: string | null;
  scan_name?: string | null;
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
          const { data: signed } = await supabase.storage.from("chat-attachments")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          if (!settled) { settled = true; resolve({ url: signed?.signedUrl ?? path, path }); }
        },
      });
    } catch (e: any) {
      task.fail();
      if (!settled) { settled = true; toast.error(e.message || "فشل رفع الملف"); resolve(null); }
    }
  });
}


// ============== DESIGNER ==============
function DesignerControls({ c, actorName, doctorName, target, blockedByPending }: {
  c: WorkflowCase; actorName: string; doctorName: string; target: RoleKey; blockedByPending: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const rarRef = useRef<HTMLInputElement>(null);
  const rarSent = !!c.design_file_sent;
  const blocked = !rarSent && !!blockedByPending;

  async function sendRar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
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
      toast.success(`✅ تم إرسال ملف التصميم إلى ${ROLE_LABEL[target]}`);
    } catch (err: any) { toast.error(err.message || "فشل الإرسال"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${rarSent ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5" />}
          {rarSent ? "تم إرسال ملف التصميم" : "إرسال ملف التصميم (.rar)"}
          <input ref={rarRef} type="file" accept=".rar" className="hidden"
            onChange={sendRar} disabled={busy || rarSent} />
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

  async function uploadRevision(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
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
      toast.success("تم إرسال التعديل للفني");
    } catch (err: any) { toast.error(err.message || "فشل الإرسال"); }
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
          {done ? "تم إرسال التعديل" : "رفع ملف التعديل (.rar)"}
          <input ref={fileRef} type="file" accept=".rar" className="hidden"
            onChange={uploadRevision} disabled={busy || done} />
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
    if (nextShade && !revShadeConfirmed) { toast.error("الرجاء تأكيد اللون قبل إرسال طلب التعديل"); return; }
    setBusy(true);
    const trimmed = notes.trim();
    const shadeChanged = (c.shade ?? "").trim().toUpperCase() !== nextShade.toUpperCase();
    const { error } = await supabase.from("slot_cases")
      .update({
        doctor_decision: "revision",
        revision_notes: trimmed,
        revision_design_done: false,
        revision_approved_by_tech: false,
        temporary_delivered: true,
        shade: nextShade || null,
        shade_confirmed_doctor: true,
        shade_confirmed_designer: false,
        shade_confirmed_technician: false,
        review_read_at: new Date().toISOString(),
      }).eq("id", c.id);
    if (!error) {
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


  async function toggleInstalled() {
    if (busy) return;
    setBusy(true);
    const next = !installed;
    const patch: any = { permanent_installed_by_doctor: next };
    if (next) {
      patch.final_archived = true;
      patch.archived = true;
      patch.permanent_delivered_to_doctor = true; // mark delivered implicitly
      patch.perm_ship_read_at = new Date().toISOString();
    }
    const { error } = await supabase.from("slot_cases").update(patch).eq("id", c.id);
    if (error) { setBusy(false); toast.error(error.message); return; }
    if (next) {
      // Auto-archive this case's own conversations (title prefixed with [case_code]).
      await supabase.from("chat_conversations").update({ archived: true })
        .eq("doctor_slot", c.doctor_slot).like("title", `[${c.case_code}]%`);
      await appendAudit(c, { actor: actorName || "الطبيب", action: "تأكيد تركيب الأسنان الدائمة وأرشفة الحالة" });
      const msg = `🦷✅ تم تركيب الأسنان الدائمة للمريض — الحالة ${c.case_code} (${c.patient_name}). الحالة مؤرشفة نهائياً.`;
      // Notify designer + technician + ONLY the matching-branch secretary.
      const secRole = await branchSecretaryRole(c.doctor_slot);
      const roles: RoleKey[] = ["designer", "technician"];
      if (secRole) roles.push(secRole);
      for (const role of roles) {
        const conv = await ensureConv(c, "doctor", role, doctorName);
        if (conv) await supabase.from("chat_messages").insert({
          conversation_id: conv, sender: "doctor", sender_name: actorName,
          content: msg, message_type: "text",
        });
      }
      toast.success("✅ تم تأكيد التركيب — أُرشفت الحالة تلقائياً");
    } else {
      toast.success("تم إلغاء العلامة");
    }
    setBusy(false);
  }

  const hasAction = (reviewReady && !decision) || (permReady && !installed);
  const stageHint =
    archived || installed ? "تمت أرشفة الحالة نهائياً ✅" :
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

      {reviewReady && !decision && !confirmApprove && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-foreground">قرار الطبيب بعد المراجعة:</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setConfirmApprove(true)} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold shadow">
              <ThumbsUp className="size-3.5" /> معتمد للدائم
            </button>
            <button onClick={() => { setRevShadeConfirmed(false); setRevOpen(true); }} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-xs font-bold shadow">
              <Pencil className="size-3.5" /> يلزم تعديل
            </button>
          </div>
        </div>
      )}

      {reviewReady && !decision && confirmApprove && (
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

      {permReady && !installed && (
        <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold rounded-lg border border-emerald-500/60 bg-emerald-50/60 px-3 py-2 hover:border-emerald-600">
          <input type="checkbox" checked={installed} onChange={toggleInstalled} disabled={busy}
            className="size-4 accent-emerald-600" />
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          تم تركيب الأسنان الدائمة للمريض (أرشفة تلقائية)
        </label>
      )}

      {installed && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold border border-emerald-500 bg-emerald-50 rounded-lg px-2 py-1">
          <Archive className="size-3.5" /> تم التركيب — مؤرشفة نهائياً
        </span>
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
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-luxury">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">ملاحظات التعديل المطلوب</div>
              <button onClick={() => setRevOpen(false)} className="rounded-lg p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
              placeholder="اكتب الملاحظات التفصيلية للتعديل…"
              className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-gold" />

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-foreground">المرفقات (صور / ملفات توضيحية)</div>
                <button
                  type="button"
                  onClick={() => revFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold/60 bg-gold/5 px-2.5 py-1.5 text-[11px] font-bold hover:bg-gold/10"
                >
                  <FileArchive className="size-3.5" /> إضافة ملف
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
                <div className="grid grid-cols-3 gap-2 max-h-56 overflow-auto">
                  {revFiles.map((f, i) => (
                    <RevAttachmentPreview
                      key={i}
                      file={f}
                      onRemove={() => setRevFiles(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              )}
            </div>

            {c.shade && (
              <div className="mt-3 rounded-xl border border-gold/40 bg-gold/5 p-3 space-y-1.5">
                <div className="text-[11px] font-bold text-amber-800">
                  أعد تأكيد لون السن قبل إرسال طلب التعديل — سيُطلب من المصمم والفني تأكيده مجدداً.
                </div>
                <ShadeConfirm
                  shade={c.shade}
                  confirmed={revShadeConfirmed}
                  onConfirm={() => setRevShadeConfirmed(true)}
                />
              </div>
            )}

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


