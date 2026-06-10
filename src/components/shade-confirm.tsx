import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import { ShadeBadge } from "@/components/shade-badge";

/**
 * Active-case tooth-shade confirmation.
 *
 * Shows the shade badge plus an attention-grabbing prompt that blinks once a
 * second in a deep "gazelle-blood" crimson with the text "تأكد من اختيار
 * اللون". Once the designer / technician taps it, it turns solid green to
 * confirm the shade was checked before designing / manufacturing. The
 * confirmation is remembered per case (localStorage) so it stays green.
 */
const CRIMSON = "#6e0b14"; // دم الغزال الغامق

export function ShadeConfirm({
  shade,
  caseCode,
  className = "",
}: {
  shade?: string | null;
  caseCode?: string | null;
  className?: string;
}) {
  if (!shade) return null;
  const storageKey = `shade-confirmed:${caseCode ?? shade}`;

  const [confirmed, setConfirmed] = useState(false);
  const [blinkOn, setBlinkOn] = useState(true);

  useEffect(() => {
    try {
      setConfirmed(localStorage.getItem(storageKey) === "1");
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (confirmed) return;
    const id = setInterval(() => setBlinkOn((v) => !v), 1000);
    return () => clearInterval(id);
  }, [confirmed]);

  function confirm() {
    setConfirmed(true);
    try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <ShadeBadge shade={shade} />
      <button
        type="button"
        onClick={confirm}
        aria-pressed={confirmed}
        title={confirmed ? "تم تأكيد اللون" : "اضغط للتأكد من اختيار اللون"}
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
        {confirmed ? "تم تأكيد اللون" : "تأكد من اختيار اللون"}
      </button>
    </div>
  );
}
