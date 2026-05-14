import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckSquare, Square, Upload, Loader2, AlertCircle } from "lucide-react";
import type { RoleKey } from "@/lib/chat";
import { ROLE_LABEL } from "@/lib/chat";

type Phase = "design" | "fabrication";

export interface WorkflowCase {
  id: string;
  case_code: string;
  patient_name: string;
  doctor_slot: number;
  design_done?: boolean | null;
  design_file_sent?: boolean | null;
  fabrication_done?: boolean | null;
  fabrication_file_sent?: boolean | null;
}

interface Props {
  c: WorkflowCase;
  /** Which actor is operating: designer or technician */
  actor: "designer" | "technician";
  actorName: string;
  doctorName: string;
  /** target role to send the file to (technician for designer, secretary_* for technician) */
  target: RoleKey;
  /**
   * If there is another case (different from `c`) that this actor already
   * checked but hasn't yet sent the file for, the checkbox here must be
   * disabled. Pass that pending case-code (or null) here.
   */
  blockedByPending: string | null;
}

const RAR_RE = /\.rar$/i;

export function CaseWorkflowControls({ c, actor, actorName, doctorName, target, blockedByPending }: Props) {
  const phase: Phase = actor === "designer" ? "design" : "fabrication";
  const doneFlag = phase === "design" ? !!c.design_done : !!c.fabrication_done;
  const sentFlag = phase === "design" ? !!c.design_file_sent : !!c.fabrication_file_sent;
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const stageLabel = phase === "design" ? "تم التصميم" : "تم التصنيع";
  const blocked = !doneFlag && !!blockedByPending;

  async function ensureConversation(): Promise<string | null> {
    const { data: existing } = await supabase.from("chat_conversations")
      .select("id,participants").eq("doctor_slot", c.doctor_slot);
    const conv = (existing ?? []).find((x: any) =>
      Array.isArray(x.participants) && x.participants.length === 2
      && x.participants.includes(actor) && x.participants.includes(target)
    ) as { id: string } | undefined;
    if (conv) return conv.id;
    const { data: created, error } = await supabase.from("chat_conversations")
      .insert({
        doctor_slot: c.doctor_slot,
        participants: [actor, target],
        title: `حالات ${doctorName} — ${ROLE_LABEL[target]}`,
        created_by: actor,
      }).select("id").single();
    if (error || !created) { toast.error("تعذر إنشاء المحادثة"); return null; }
    return created.id;
  }

  async function toggleDone() {
    if (busy) return;
    if (doneFlag) {
      // un-check (only allowed if file not yet sent)
      if (sentFlag) { toast.error("لا يمكن إلغاء العلامة بعد إرسال الملف"); return; }
      setBusy(true);
      const patch: any = phase === "design" ? { design_done: false } : { fabrication_done: false };
      const { error } = await supabase.from("slot_cases").update(patch).eq("id", c.id);
      setBusy(false);
      if (error) toast.error(error.message); else toast.success("تم إلغاء العلامة");
      return;
    }
    if (blocked) {
      toast.error(`أرسل أولاً ملف الحالة المعلّقة: ${blockedByPending}`);
      return;
    }
    setBusy(true);
    const patch: any = phase === "design" ? { design_done: true } : { fabrication_done: true };
    const { error } = await supabase.from("slot_cases").update(patch).eq("id", c.id);
    if (error) { setBusy(false); toast.error(error.message); return; }

    // Send notification to target role via chat
    const convId = await ensureConversation();
    if (convId) {
      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender: actor,
        sender_name: actorName,
        content: `🔔 ${stageLabel} — الحالة ${c.case_code} (${c.patient_name})\nبانتظار استلام ملف الحالة (.rar) من ${actor === "designer" ? "المصمم" : "الفني"}.`,
        message_type: "text",
      });
    }
    setBusy(false);
    toast.success(`✅ ${stageLabel} — تم إشعار ${ROLE_LABEL[target]}`);
  }

  async function sendRar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (!RAR_RE.test(f.name)) { toast.error("الملف يجب أن يكون بصيغة .rar"); return; }
    setBusy(true);
    try {
      const path = `${c.doctor_slot}/${phase}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, f, { upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? path;

      const convId = await ensureConversation();
      if (!convId) throw new Error("conversation");
      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        sender: actor,
        sender_name: actorName,
        content: `📦 ملف الحالة ${c.case_code} (${c.patient_name})`,
        message_type: "file",
        attachment_path: url,
        attachment_name: f.name,
        attachment_mime: f.type || "application/vnd.rar",
        attachment_size: f.size,
      });

      const patch: any = phase === "design"
        ? { design_file_sent: true }
        : { fabrication_file_sent: true };
      const { error: updErr } = await supabase.from("slot_cases").update(patch).eq("id", c.id);
      if (updErr) throw updErr;
      toast.success(`تم إرسال الملف إلى ${ROLE_LABEL[target]}`);
    } catch (err: any) {
      toast.error(err.message || "تعذر إرسال الملف");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={toggleDone} disabled={busy || (blocked && !doneFlag)}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition border
            ${doneFlag ? "gradient-gold text-gold-foreground border-gold shadow-gold"
                       : blocked ? "border-destructive/40 text-destructive cursor-not-allowed"
                                 : "border-border bg-card hover:border-gold"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" />
                : doneFlag ? <CheckSquare className="size-3.5" />
                           : <Square className="size-3.5" />}
          {stageLabel}
        </button>

        {doneFlag && !sentFlag && (
          <label className="inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-2 text-xs font-bold cursor-pointer shadow-luxury">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            إرسال ملف الحالة (.rar) إلى {ROLE_LABEL[target]}
            <input ref={fileRef} type="file" accept=".rar,application/vnd.rar,application/x-rar-compressed"
              className="hidden" onChange={sendRar} disabled={busy} />
          </label>
        )}
        {sentFlag && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-bold">
            <CheckSquare className="size-3.5" /> تم إرسال الملف إلى {ROLE_LABEL[target]}
          </span>
        )}
      </div>

      {blocked && !doneFlag && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertCircle className="size-3" />
          لا يمكن وضع علامة على حالة جديدة قبل إرسال ملف الحالة المعلّقة:
          <span className="font-mono font-bold">{blockedByPending}</span>
        </div>
      )}
    </div>
  );
}
