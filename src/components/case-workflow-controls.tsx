import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckSquare, Square, Loader2, AlertCircle,
  FileArchive, FileCode, ChevronDown, ChevronUp, Check, Send, Truck,
  ThumbsUp, Pencil, X, Archive,
} from "lucide-react";
import type { RoleKey } from "@/lib/chat";
import { ROLE_LABEL } from "@/lib/chat";

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
  final_archived?: boolean | null;
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

async function uploadAttachment(file: File, c: WorkflowCase, phase: string): Promise<{ url: string; path: string } | null> {
  const path = `${c.doctor_slot}/${phase}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
  if (error) { toast.error(error.message); return null; }
  const { data: signed } = await supabase.storage.from("chat-attachments")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return { url: signed?.signedUrl ?? path, path };
}

// ============== DESIGNER ==============
function DesignerControls({ c, actorName, doctorName, target, blockedByPending }: {
  c: WorkflowCase; actorName: string; doctorName: string; target: RoleKey; blockedByPending: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const rarRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);
  const rarSent = !!c.design_file_sent;
  const htmlSent = !!c.design_html_sent;
  const bothSent = rarSent && htmlSent;
  const doneFlag = !!c.design_done;
  const blocked = !doneFlag && !!blockedByPending;

  async function sendFile(e: React.ChangeEvent<HTMLInputElement>, kind: "rar" | "html") {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (kind === "rar" && !RAR_RE.test(f.name)) { toast.error("ملف يجب أن يكون .rar"); return; }
    if (kind === "html" && !HTML_RE.test(f.name)) { toast.error("ملف يجب أن يكون .html"); return; }
    setBusy(true);
    try {
      const up = await uploadAttachment(f, c, `design-${kind}`);
      if (!up) return;
      const convId = await ensureConv(c, "designer", target, doctorName);
      if (!convId) { toast.error("تعذر إنشاء المحادثة"); return; }
      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender: "designer",
        sender_name: actorName,
        content: `📦 ملف التصميم (${kind.toUpperCase()}) — الحالة ${c.case_code} (${c.patient_name})`,
        message_type: "file",
        attachment_path: up.url,
        attachment_name: f.name,
        attachment_mime: f.type || (kind === "rar" ? "application/vnd.rar" : "text/html"),
        attachment_size: f.size,
      });
      const patch: any = kind === "rar"
        ? { design_file_sent: true }
        : { design_html_sent: true, design_html_path: up.url, design_html_name: f.name };
      await supabase.from("slot_cases").update(patch).eq("id", c.id);
      toast.success(`تم إرسال ملف ${kind.toUpperCase()} إلى ${ROLE_LABEL[target]}`);
    } catch (err: any) { toast.error(err.message || "فشل الإرسال"); }
    finally { setBusy(false); }
  }

  async function toggleDone() {
    if (busy) return;
    if (doneFlag) {
      if (rarSent || htmlSent) { toast.error("لا يمكن إلغاء العلامة بعد إرسال أي ملف"); return; }
      setBusy(true);
      const { error } = await supabase.from("slot_cases").update({ design_done: false }).eq("id", c.id);
      setBusy(false);
      if (error) toast.error(error.message); else toast.success("تم إلغاء العلامة");
      return;
    }
    if (blocked) { toast.error(`أرسل أولاً ملفات الحالة المعلّقة: ${blockedByPending}`); return; }
    if (!bothSent) {
      toast.error("يجب رفع ملف .rar وملف .html قبل وضع علامة تم التصميم");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("slot_cases").update({ design_done: true }).eq("id", c.id);
    if (!error) {
      const convId = await ensureConv(c, "designer", target, doctorName);
      if (convId) {
        await supabase.from("chat_messages").insert({
          conversation_id: convId, sender: "designer", sender_name: actorName,
          content: `✅ تم التصميم — الحالة ${c.case_code} (${c.patient_name})\nبانتظار تأكيد استلام الفني.`,
          message_type: "text",
        });
      }
      toast.success(`✅ تم التصميم — تم إشعار ${ROLE_LABEL[target]}`);
    } else toast.error(error.message);
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${rarSent ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5" />}
          {rarSent ? "تم إرسال .rar" : "إرسال ملف .rar"}
          <input ref={rarRef} type="file" accept=".rar" className="hidden"
            onChange={(e) => sendFile(e, "rar")} disabled={busy || rarSent} />
        </label>
        <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${htmlSent ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileCode className="size-3.5" />}
          {htmlSent ? "تم إرسال .html" : "إرسال ملف .html"}
          <input ref={htmlRef} type="file" accept=".html,.htm" className="hidden"
            onChange={(e) => sendFile(e, "html")} disabled={busy || htmlSent} />
        </label>
        <button onClick={toggleDone} disabled={busy || (!doneFlag && (!bothSent || blocked))}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition border
            ${doneFlag ? "gradient-gold text-gold-foreground border-gold shadow-gold"
                       : !bothSent ? "border-border text-muted-foreground cursor-not-allowed"
                                   : "border-border bg-card hover:border-gold"}`}>
          {doneFlag ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
          تم التصميم
        </button>
        {doneFlag && !c.design_received_by_tech && (
          <span className="text-[11px] text-amber-700 font-bold">بانتظار تأكيد الفني…</span>
        )}
        {c.design_received_by_tech && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
            <Check className="size-3.5" /> أكد الفني الاستلام
          </span>
        )}
      </div>
      {blocked && !doneFlag && (
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
function DesignerRevisionSection({ c, actorName, doctorName }: {
  c: WorkflowCase; actorName: string; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (c.doctor_decision !== "revision") return null;
  const done = !!c.revision_design_done;
  const approved = !!c.revision_approved_by_tech;

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
      <div className="flex items-center gap-2 flex-wrap">
        <label className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer transition border
          ${done ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileArchive className="size-3.5" />}
          {done ? "تم إرسال ملف التعديل" : "رفع ملف التعديل (.rar)"}
          <input ref={fileRef} type="file" accept=".rar" className="hidden"
            onChange={uploadRevision} disabled={busy || done} />
        </label>
        {done && !approved && (
          <span className="text-[11px] text-amber-700 font-bold">بانتظار اعتماد الفني…</span>
        )}
        {approved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
            <Check className="size-3.5" /> اعتمد الفني التعديل
          </span>
        )}
      </div>
    </div>
  );
}

// ============== TECHNICIAN ==============
function TechnicianControls({ c, actorName, doctorName, target }: {
  c: WorkflowCase; actorName: string; doctorName: string; target: RoleKey | null;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const designReady = !!(c.design_done && c.design_file_sent && c.design_html_sent);
  const confirmed = !!c.design_received_by_tech;
  const fabDone = !!c.fabrication_done;
  const dataSent = !!c.tech_data_sent_to_secretary;
  const secReceived = !!c.secretary_received;
  const shipped = !!c.shipped_to_doctor;

  async function confirmReceipt() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ design_received_by_tech: true }).eq("id", c.id);
    if (!error) {
      // notify designer + doctor
      const designerConv = await ensureConv(c, "technician", "designer", doctorName);
      if (designerConv) {
        await supabase.from("chat_messages").insert({
          conversation_id: designerConv, sender: "technician", sender_name: actorName,
          content: `✅ تم استلام ملفات التصميم — الحالة ${c.case_code} (${c.patient_name})\nالحالة الآن: قيد التصنيع.`,
          message_type: "text",
        });
      }
      const docConv = await ensureConv(c, "technician", "doctor", doctorName);
      if (docConv) {
        await supabase.from("chat_messages").insert({
          conversation_id: docConv, sender: "technician", sender_name: actorName,
          content: `🔔 الحالة ${c.case_code} (${c.patient_name}) — قيد التصنيع.`,
          message_type: "text",
        });
      }
      toast.success("تم تأكيد الاستلام — الحالة قيد التصنيع");
    } else toast.error(error.message);
    setBusy(false);
  }

  async function toggleFabDone() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ fabrication_done: !fabDone }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(!fabDone ? "✅ تم التصنيع" : "تم إلغاء العلامة");
  }

  async function sendDataToSecretary() {
    if (!target) { toast.error("لا يوجد فرع سكرتارية محدد"); return; }
    setBusy(true);
    const lines = [
      `📋 حالة جاهزة للترحيل`,
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
    const convId = await ensureConv(c, "technician", target, doctorName);
    if (convId) {
      await supabase.from("chat_messages").insert({
        conversation_id: convId, sender: "technician", sender_name: actorName,
        content: lines, message_type: "text",
      });
    }
    const { error } = await supabase.from("slot_cases")
      .update({ tech_data_sent_to_secretary: true }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(`تم إرسال بيانات الحالة إلى ${ROLE_LABEL[target]}`);
  }

  async function markShipped() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ shipped_to_doctor: true }).eq("id", c.id);
    if (!error) {
      const docConv = await ensureConv(c, "technician", "doctor", doctorName);
      if (docConv) {
        await supabase.from("chat_messages").insert({
          conversation_id: docConv, sender: "technician", sender_name: actorName,
          content: `🚚 تم ترحيل الحالة ${c.case_code} (${c.patient_name}).`,
          message_type: "text",
        });
      }
      toast.success("تم وضع شارة: تم الترحيل");
    } else toast.error(error.message);
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      {/* Receipt confirmation card */}
      {designReady && !confirmed && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-3">
          <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-2">
              <FileArchive className="size-3.5 text-gold" /> ملفات الحالة من المصمم
            </span>
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {open && (
            <div className="mt-2 space-y-1 text-xs">
              <div><span className="text-muted-foreground">المريض:</span> <b>{c.patient_name}</b></div>
              {c.tooth_number && <div><span className="text-muted-foreground">السن:</span> {c.tooth_number}</div>}
              {c.shade && <div><span className="text-muted-foreground">اللون:</span> {c.shade}</div>}
              {c.case_type && <div><span className="text-muted-foreground">النوع:</span> {c.case_type}</div>}
              <div className="text-emerald-700 font-bold flex items-center gap-1"><Check className="size-3" /> ملف .rar مُرسل</div>
              <div className="text-emerald-700 font-bold flex items-center gap-1"><Check className="size-3" /> ملف .html مُرسل</div>
              {c.design_html_path && (
                <a href={c.design_html_path} target="_blank" rel="noreferrer"
                  className="inline-block underline text-gold">فتح ملف HTML</a>
              )}
            </div>
          )}
          <button onClick={confirmReceipt} disabled={busy}
            className="mt-2 inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            تأكيد استلام
          </button>
        </div>
      )}

      {confirmed && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={toggleFabDone} disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition border
              ${fabDone ? "gradient-gold text-gold-foreground border-gold shadow-gold" : "border-border bg-card hover:border-gold"}`}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : fabDone ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
            تم التصنيع
          </button>
          {fabDone && !dataSent && target && (
            <button onClick={sendDataToSecretary} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
              <Send className="size-3.5" /> إرسال البيانات إلى {ROLE_LABEL[target]}
            </button>
          )}
          {dataSent && !secReceived && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold">
              بانتظار استلام السكرتارية…
            </span>
          )}
          {secReceived && !shipped && (
            <button onClick={markShipped} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold">
              <Truck className="size-3.5" /> تأكيد الترحيل (تم الترحيل)
            </button>
          )}
          {shipped && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
              <Check className="size-3.5" /> تم ترحيل المؤقت
            </span>
          )}
        </div>
      )}

      <TechnicianPermanentSection c={c} actorName={actorName} doctorName={doctorName} target={target} />
    </div>
  );
}

// ---------- Technician: permanent-cycle (after doctor decision) ----------
function TechnicianPermanentSection({ c, actorName, doctorName, target }: {
  c: WorkflowCase; actorName: string; doctorName: string; target: RoleKey | null;
}) {
  const [busy, setBusy] = useState(false);
  const decision = c.doctor_decision;
  // Show only after doctor has decided OR revision design is back.
  const approved = decision === "approved";
  const revisionReady = decision === "revision" && c.revision_design_done;
  const revisionApproved = !!c.revision_approved_by_tech;
  const permDone = !!c.permanent_fabrication_done;
  const permSent = !!c.permanent_shipped_to_secretary;
  if (!approved && !revisionReady && !permDone && !permSent) return null;

  async function approveRevision() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ revision_approved_by_tech: true }).eq("id", c.id);
    if (!error) {
      const conv = await ensureConv(c, "technician", "designer", doctorName);
      if (conv) await supabase.from("chat_messages").insert({
        conversation_id: conv, sender: "technician", sender_name: actorName,
        content: `✅ تم اعتماد التعديل النهائي — الحالة ${c.case_code} (${c.patient_name}). يبدأ تصنيع الأسنان الدائمة.`,
        message_type: "text",
      });
      toast.success("تم اعتماد التعديل");
    } else toast.error(error.message);
    setBusy(false);
  }

  async function togglePermDone() {
    setBusy(true);
    const next = !permDone;
    const { error } = await supabase.from("slot_cases")
      .update({ permanent_fabrication_done: next }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(next ? "✅ تم تصنيع الأسنان الدائمة" : "تم إلغاء العلامة");
  }

  async function sendPermToSecretary() {
    if (!target) { toast.error("لا يوجد فرع سكرتارية محدد"); return; }
    setBusy(true);
    const conv = await ensureConv(c, "technician", target, doctorName);
    if (conv) await supabase.from("chat_messages").insert({
      conversation_id: conv, sender: "technician", sender_name: actorName,
      content: `🦷 الأسنان الدائمة جاهزة للترحيل\nرمز: ${c.case_code}\nالطبيب: ${doctorName}\nالمريض: ${c.patient_name}`,
      message_type: "text",
    });
    const { error } = await supabase.from("slot_cases")
      .update({ permanent_shipped_to_secretary: true }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(`تم إشعار ${ROLE_LABEL[target]} بجاهزية الدائم`);
  }

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-50/40 p-3 space-y-2">
      <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
        <ThumbsUp className="size-3.5" />
        {approved ? "تم الاعتماد النهائي من الطبيب — جاهز لتصنيع الدائم"
                  : revisionReady && !revisionApproved ? "تعديل تصميم جاهز للاعتماد"
                  : "تصنيع الأسنان الدائمة"}
      </div>
      {revisionReady && !revisionApproved && (
        <button onClick={approveRevision} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          اعتماد التعديل لتصنيع الدائم
        </button>
      )}
      {(approved || revisionApproved) && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={togglePermDone} disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition border
              ${permDone ? "gradient-gold text-gold-foreground border-gold shadow-gold" : "border-border bg-card hover:border-gold"}`}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : permDone ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
            تم تصنيع الدائم
          </button>
          {permDone && !permSent && target && (
            <button onClick={sendPermToSecretary} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold">
              <Send className="size-3.5" /> إشعار {ROLE_LABEL[target]}
            </button>
          )}
          {permSent && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
              <Check className="size-3.5" /> تم الإشعار بجاهزية الدائم
            </span>
          )}
        </div>
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
  const permDelivered = !!c.permanent_delivered_to_doctor;
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
        content: `🦷 تم استلام الأسنان المؤقتة (للتجربة) — الحالة ${c.case_code} (${c.patient_name}). جاهزة للترحيل إليكم.`,
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

  async function deliverPermanent() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ permanent_delivered_to_doctor: true }).eq("id", c.id);
    if (!error) {
      const dconv = await ensureConv(c, actor, "doctor", doctorName);
      if (dconv) await supabase.from("chat_messages").insert({
        conversation_id: dconv, sender: actor, sender_name: actorName,
        content: `🚚 تم ترحيل الأسنان الدائمة — الحالة ${c.case_code} (${c.patient_name}).`,
        message_type: "text",
      });
      toast.success("تم ترحيل الدائم للطبيب");
    } else toast.error(error.message);
    setBusy(false);
  }

  async function archiveFinal() {
    if (!confirm("أرشفة الحالة نهائياً؟")) return;
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ final_archived: true, archived: true }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("تمت الأرشفة النهائية");
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
            <Truck className="size-3.5" /> تم ترحيل المؤقت
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

      {(permSent || permDelivered || archived) && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-50/40 p-3 space-y-2">
          <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
            <Truck className="size-3.5" /> الأسنان الدائمة
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {permSent && !permDelivered && (
              <button onClick={deliverPermanent} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold">
                <Truck className="size-3.5" /> تأكيد ترحيل الدائم للطبيب
              </button>
            )}
            {permDelivered && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                <Check className="size-3.5" /> تم ترحيل الدائم
              </span>
            )}
            {permDelivered && !archived && (
              <button onClick={archiveFinal} disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
                <Archive className="size-3.5" /> أرشفة نهائية
              </button>
            )}
            {archived && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
                <Archive className="size-3.5" /> مؤرشفة نهائياً
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== DOCTOR ==============
function DoctorControls({ c, actorName, doctorName }: {
  c: WorkflowCase; actorName: string; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const shipped = !!c.shipped_to_doctor;
  const delivered = !!c.temporary_delivered;
  const decision = c.doctor_decision;
  const permDelivered = !!c.permanent_delivered_to_doctor;

  if (!shipped && !decision && !permDelivered) return null;

  async function confirmDelivered() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ temporary_delivered: true }).eq("id", c.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("تم تأكيد استلام المؤقت");
  }

  async function approve() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ doctor_decision: "approved" }).eq("id", c.id);
    if (!error) {
      const msg = `✅ اعتماد نهائي للتصميم — الحالة ${c.case_code} (${c.patient_name}). يبدأ تصنيع الأسنان الدائمة.`;
      for (const role of ["designer", "technician"] as RoleKey[]) {
        const conv = await ensureConv(c, "doctor", role, doctorName);
        if (conv) await supabase.from("chat_messages").insert({
          conversation_id: conv, sender: "doctor", sender_name: actorName,
          content: msg, message_type: "text",
        });
      }
      toast.success("تم إرسال اعتماد نهائي");
    } else toast.error(error.message);
    setBusy(false);
  }

  async function requestRevision() {
    if (notes.trim().length < 3) { toast.error("اكتب ملاحظات التعديل"); return; }
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ doctor_decision: "revision", revision_notes: notes.trim() }).eq("id", c.id);
    if (!error) {
      const conv = await ensureConv(c, "doctor", "designer", doctorName);
      if (conv) await supabase.from("chat_messages").insert({
        conversation_id: conv, sender: "doctor", sender_name: actorName,
        content: `🔁 طلب تعديل تصميم — الحالة ${c.case_code} (${c.patient_name})\nملاحظات:\n${notes.trim()}`,
        message_type: "text",
      });
      toast.success("تم إرسال طلب التعديل للمصمم");
      setRevOpen(false);
      setNotes("");
    } else toast.error(error.message);
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      {shipped && !delivered && (
        <button onClick={confirmDelivered} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold shadow-luxury">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          تأكيد استلام الأسنان المؤقتة
        </button>
      )}

      {delivered && !decision && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-foreground">قرار الطبيب بعد المراجعة:</div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={approve} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold shadow">
              <ThumbsUp className="size-3.5" /> اعتماد نهائي
            </button>
            <button onClick={() => setRevOpen(true)} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 text-white px-3 py-2 text-xs font-bold shadow">
              <Pencil className="size-3.5" /> طلب تعديل
            </button>
          </div>
        </div>
      )}

      {decision === "approved" && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold">
          <ThumbsUp className="size-3.5" /> تم الاعتماد النهائي — قيد تصنيع الدائم
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

      {permDelivered && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold border border-emerald-500 bg-emerald-50 rounded-lg px-2 py-1">
          <Truck className="size-3.5" /> تم ترحيل الأسنان الدائمة
        </span>
      )}

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
