import { Check } from "lucide-react";

export type TickState = "none" | "sent" | "delivered" | "read";

/**
 * WhatsApp-style ticks beside a stage label:
 * - sent      → single check, light brown
 * - delivered → double check, brown
 * - read      → double check, blue
 */
export function StageTick({ state, className = "" }: { state: TickState; className?: string }) {
  if (state === "none") return null;
  if (state === "sent") {
    return (
      <span className={`inline-flex items-center ${className}`} title="أُرسل">
        <Check className="size-3.5" style={{ color: "#b8893a" }} strokeWidth={3} />
      </span>
    );
  }
  const color = state === "read" ? "#2563eb" : "#5b3a14";
  const label = state === "read" ? "قُرئ" : "وصلت";
  return (
    <span className={`inline-flex items-center ${className}`} style={{ letterSpacing: -6 }} title={label}>
      <Check className="size-3.5" style={{ color }} strokeWidth={3} />
      <Check className="size-3.5" style={{ color }} strokeWidth={3} />
    </span>
  );
}

/** Compute tick state from sent/delivered/read timestamps. */
export function tickFromTimestamps(
  sentAt?: string | null,
  deliveredAt?: string | null,
  readAt?: string | null,
): TickState {
  if (readAt) return "read";
  if (deliveredAt) return "delivered";
  if (sentAt) return "sent";
  return "none";
}
