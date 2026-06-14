import { useEffect, useState } from "react";
import { Check, ChevronDown, Circle, Lock, Palette } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ShadeBadge } from "@/components/shade-badge";
import { SHADE_COLORS, shadeColor } from "@/lib/shades";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * `ShadePicker`: a controlled tool to edit/choose a tooth shade. Renders the
 * full VITA-style swatch grid plus a free-text field for non-standard codes.
 * Used (for example) by the doctor while writing revision notes so the target
 * color can be corrected before the revision request is sent.
 */
export function ShadePicker({
  value,
  onChange,
  className = "",
  collapsible = false,
}: {
  value?: string | null;
  onChange: (shade: string) => void;
  className?: string;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = (value ?? "").trim().toUpperCase();
  const shades = Object.keys(SHADE_COLORS);

  const grid = (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        {shades.map((s) => {
          const color = shadeColor(s) ?? "#ccc";
          const selected = current === s.toUpperCase();
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-pressed={selected}
              title={s}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition ${
                selected ? "border-gold shadow-gold" : "border-border hover:border-gold/60"
              }`}
            >
              <span
                className="size-6 rounded-full ring-2 ring-foreground/10 shadow-inner"
                style={{ background: `radial-gradient(circle at 30% 30%, #ffffff55, ${color})` }}
                aria-hidden
              />
              <span
                className={`text-[10px] font-extrabold leading-none ${
                  selected ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {s}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
          أو رمز مخصص:
        </span>
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="مثال: A2"
          className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-gold"
        />
      </div>
    </>
  );

  if (!collapsible) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
          <Palette className="size-3.5 text-gold" /> اختر لون السن
        </div>
        {grid}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`space-y-2 ${className}`}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-gold/20 transition"
        >
          <span className="flex items-center gap-1.5">
            <Palette className="size-3.5 text-gold" /> اختر لون السن
          </span>
          <ChevronDown className={`size-3.5 text-gold transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">{grid}</CollapsibleContent>
    </Collapsible>
  );
}


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
          <ConfirmButton confirmed={docOk} onClick={() => confirm("doctor")} />
        )}
        {actor === "technician" && (
          <ConfirmButton
            confirmed={techOk}
            disabled={!docOk}
            onClick={() => confirm("technician")}
          />
        )}
      </div>

      {/* Confirmation chain status (visible to everyone).
          Color choice/confirmation is the doctor's responsibility; the
          technician confirms the doctor's chosen shade. The designer is not
          involved in shade confirmation. */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
        <StatusChip label={ROLE_AR.doctor} ok={docOk} />
        <StatusChip label={ROLE_AR.technician} ok={techOk} pending={!docOk} />
      </div>

      {interactive && actor === "technician" && !docOk && (
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
