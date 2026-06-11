import { useEffect, useState } from "react";
import { Check, Circle, Lock } from "lucide-react";
import { ShadeBadge } from "@/components/shade-badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Tooth-shade confirmation tooling.
 *
 * - `ShadeConfirm`: a controlled local widget used while the doctor is filling
 *   a new case or requesting a revision. The blinking deep "gazelle-blood"
 *   crimson prompt turns solid green once tapped. Parent owns the boolean.
 *
 * - `CaseShadeConfirm`: a database-backed per-role widget used on case cards.
 *   The doctor must confirm first; the designer and technician confirmations
 *   are gated on (and depend on) the doctor's confirmation.
 */
const CRIMSON = "#6e0b14"; // دم الغزال الغامق

function useBlink(active: boolean) {
  const [blinkOn, setBlinkOn] = useState(true);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setBlinkOn((v) => !v), 1000);
    return () => clearInterval(id);
  }, [active]);
  return blinkOn;
}

function ConfirmButton({
  confirmed,
  disabled,
  onClick,
  labelIdle = "تأكد من اختيار اللون",
  labelDone = "تم تأكيد اللون",
  labelLocked,
}: {
  confirmed: boolean;
  disabled?: boolean;
  onClick: () => void;
  labelIdle?: string;
  labelDone?: string;
  labelLocked?: string;
}) {
  const blinkOn = useBlink(!confirmed && !disabled);
  if (disabled && !confirmed) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold text-white shadow-md"
        style={{ background: "#94a3b8" }}
        title="بانتظار تأكيد الطبيب للون أولاً"
      >
        <Lock className="size-3.5" />
        {labelLocked ?? "بانتظار تأكيد الطبيب"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={confirmed}
      title={confirmed ? labelDone : "اضغط للتأكد من اختيار اللون"}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold text-white shadow-md transition-all duration-300"
      style={
        confirmed
          ? { background: "#15803d" }
          : {
              background: CRIMSON,
              opacity: blinkOn ? 1 : 0.2,
              boxShadow: blinkOn ? `0 0 0 3px ${CRIMSON}33` : "none",
            }
      }
    >
      {confirmed ? <Check className="size-3.5" /> : <Circle className="size-3.5 fill-white" />}
      {confirmed ? labelDone : labelIdle}
    </button>
  );
}

/** Controlled local confirmation (new case form / revision modal). */
export function ShadeConfirm({
  shade,
  confirmed,
  onConfirm,
  className = "",
}: {
  shade?: string | null;
  confirmed: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  if (!shade) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <ShadeBadge shade={shade} />
      <ConfirmButton confirmed={confirmed} onClick={onConfirm} />
    </div>
  );
}

const ROLE_AR: Record<string, string> = {
  doctor: "الطبيب",
  designer: "المصمم",
  technician: "الفني",
};

/**
 * Database-backed shade confirmation for case cards.
 * The doctor's confirmation is the source of truth; designer/technician
 * confirmations are only allowed once the doctor confirmed.
 */
export function CaseShadeConfirm({
  shade,
  caseId,
  actor,
  doctorConfirmed,
  designerConfirmed,
  technicianConfirmed,
  className = "",
}: {
  shade?: string | null;
  caseId: string;
  actor: "doctor" | "designer" | "technician" | "secretary_sanaa" | "secretary_ibb" | "admin";
  doctorConfirmed?: boolean | null;
  designerConfirmed?: boolean | null;
  technicianConfirmed?: boolean | null;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const docOk = !!doctorConfirmed;
  const desOk = !!designerConfirmed;
  const techOk = !!technicianConfirmed;

  if (!shade) return null;

  async function confirm(which: "doctor" | "designer" | "technician") {
    if (saving) return;
    setSaving(true);
    const patch =
      which === "doctor"
        ? { shade_confirmed_doctor: true }
        : which === "designer"
          ? { shade_confirmed_designer: true }
          : { shade_confirmed_technician: true };
    const { error } = await supabase.from("slot_cases").update(patch).eq("id", caseId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("تم تأكيد اللون");
  }

  // Secretary / admin: read-only status view only.
  const interactive = actor === "doctor" || actor === "designer" || actor === "technician";

  return (
    <div className={`flex flex-col gap-2 rounded-xl border border-gold/40 bg-gold/5 p-2.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <ShadeBadge shade={shade} />
        {actor === "doctor" && (
          <ConfirmButton confirmed={docOk} onClick={() => confirm("shade_confirmed_doctor")} />
        )}
        {actor === "designer" && (
          <ConfirmButton
            confirmed={desOk}
            disabled={!docOk}
            onClick={() => confirm("shade_confirmed_designer")}
          />
        )}
        {actor === "technician" && (
          <ConfirmButton
            confirmed={techOk}
            disabled={!docOk}
            onClick={() => confirm("shade_confirmed_technician")}
          />
        )}
      </div>

      {/* Confirmation chain status (visible to everyone) */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <StatusChip label={ROLE_AR.doctor} ok={docOk} />
        <StatusChip label={ROLE_AR.designer} ok={desOk} pending={!docOk} />
        <StatusChip label={ROLE_AR.technician} ok={techOk} pending={!docOk} />
      </div>

      {interactive && (actor === "designer" || actor === "technician") && !docOk && (
        <div className="text-[10px] text-amber-700 font-bold">
          لا يمكن تأكيد اللون قبل أن يؤكده الطبيب.
        </div>
      )}
    </div>
  );
}

function StatusChip({ label, ok, pending }: { label: string; ok: boolean; pending?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
        ok
          ? "bg-emerald-100 text-emerald-700"
          : pending
            ? "bg-slate-100 text-slate-500"
            : "bg-rose-100 text-rose-700"
      }`}
    >
      {ok ? <Check className="size-2.5" /> : <Circle className="size-2.5" />}
      {label}
    </span>
  );
}
