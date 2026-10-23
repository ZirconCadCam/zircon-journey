import { createServerFn } from "@tanstack/react-start";
import { canConfirmPermanentInstall, permanentInstallSchema } from "./permanent-install";

/** A narrow doctor action, not permission to edit arbitrary patient balances. */
export const confirmPermanentInstall = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => permanentInstallSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireStaff } = await import("./staff-ticket.server");
    const actor = await requireStaff(["admin", "doctor"]);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: c, error: readError } = await db.from("slot_cases")
      .select("doctor_slot,permanent_fabrication_done,final_archived,archive_approval,permanent_installed_by_doctor")
      .eq("id", data.caseId).single();
    if (readError || !c || !canConfirmPermanentInstall(actor.role, actor.slot, c.doctor_slot)) {
      throw new Error("غير مسموح بتأكيد تركيب هذه الحالة");
    }
    if (!c.permanent_fabrication_done || c.final_archived ||
      (c.permanent_installed_by_doctor && c.archive_approval !== "rejected")) {
      throw new Error("الحالة غير متاحة لتأكيد التركيب");
    }
    if (data.receipt && (!data.receipt.path.startsWith(`${c.doctor_slot}/archive-receipts/`) ||
      /[\\\u0000-\u001f%]/.test(data.receipt.path) ||
      data.receipt.path.split("/").some(part => !part || part === "." || part === ".."))) {
      throw new Error("مسار السند غير مسموح");
    }
    const now = new Date().toISOString();
    const { data: saved, error } = await db.from("slot_cases").update({
      permanent_installed_by_doctor: true,
      permanent_delivered_to_doctor: true,
      perm_ship_read_at: now,
      archive_receipt_path: data.receipt?.path ?? null,
      archive_receipt_name: data.receipt?.name ?? null,
      archive_receipt_mime: data.receipt?.mime ?? null,
      archive_receipt_size: data.receipt?.size ?? null,
      archive_receipt_sent_at: now,
      archive_request_note: data.note || null,
      remaining_amount: data.remaining,
      archive_approval: "pending",
      archive_reviewed_at: null,
      archive_reviewed_by: null,
      archive_reject_reason: null,
    }).eq("id", data.caseId).eq("doctor_slot", c.doctor_slot)
      .eq("permanent_fabrication_done", true)
      .or("final_archived.is.null,final_archived.eq.false")
      .or("permanent_installed_by_doctor.is.null,permanent_installed_by_doctor.eq.false,archive_approval.eq.rejected")
      .select("id").single();
    if (error || !saved) throw new Error("تعذّر حفظ تأكيد التركيب؛ حدّث الحالة وأعد المحاولة");
    return { ok: true };
  });