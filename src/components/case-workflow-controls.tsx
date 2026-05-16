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
  if (actor === "designer") {
    return <DesignerControls c={c} actorName={actorName} doctorName={doctorName}
      target={target ?? "technician"} blockedByPending={blockedByPending ?? null} />;
  }
  if (actor === "technician") {
    return <TechnicianControls c={c} actorName={actorName} doctorName={doctorName} target={target ?? null} />;
  }
  return <SecretaryControls c={c} actorName={actorName} actor={actor} />;
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
              <Check className="size-3.5" /> تم الترحيل
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============== SECRETARY ==============
function SecretaryControls({ c, actorName, actor }: {
  c: WorkflowCase; actorName: string; actor: "secretary_sanaa" | "secretary_ibb";
}) {
  const [busy, setBusy] = useState(false);
  const received = !!c.secretary_received;
  const shipped = !!c.shipped_to_doctor;
  const tempOk = !!c.received_temporary;
  const permOk = !!c.received_permanent;

  async function markReceived() {
    setBusy(true);
    const { error } = await supabase.from("slot_cases")
      .update({ secretary_received: true }).eq("id", c.id);
    if (!error) {
      const convId = await ensureConv(c, actor, "technician", "");
      if (convId) {
        await supabase.from("chat_messages").insert({
          conversation_id: convId, sender: actor, sender_name: actorName,
          content: `✅ استلمت السكرتارية بيانات الحالة ${c.case_code} (${c.patient_name}).`,
          message_type: "text",
        });
      }
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
            <Truck className="size-3.5" /> تم الترحيل
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
    </div>
  );
}
