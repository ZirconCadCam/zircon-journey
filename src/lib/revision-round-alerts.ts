import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listRevisionRounds, type RevisionRound } from "@/lib/revision-rounds";

/** localStorage key holding the last time this viewer opened the follow-up tab. */
const key = (scope: string) => `zircon_rounds_seen_${scope}`;

export function getRoundsSeenAt(scope: string): number {
  if (typeof localStorage === "undefined") return 0;
  return Number(localStorage.getItem(key(scope)) || 0);
}

export function markRoundsSeen(scope: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key(scope), String(Date.now()));
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" }); }
  catch { return ts; }
}

/**
 * Watches revision rounds and reports how many arrived since the viewer last
 * opened the follow-up tab. Shows a toast (round number + time) for each new one.
 */
export function useNewRevisionRounds(scope: string, doctorSlot?: number) {
  const [count, setCount] = useState(0);
  const [latest, setLatest] = useState<RevisionRound | null>(null);
  const announced = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const check = useCallback(async () => {
    try {
      const all = await listRevisionRounds();
      const mine = doctorSlot == null ? all : all.filter(r => r.doctor_slot === doctorSlot);
      const seen = getRoundsSeenAt(scope);
      const fresh = mine.filter(r => new Date(r.requested_at).getTime() > seen);
      setCount(fresh.length);
      setLatest(fresh[0] ?? null);
      if (!first.current) {
        for (const r of fresh) {
          if (announced.current.has(r.id)) continue;
          announced.current.add(r.id);
          toast.info(`جولة تعديل جديدة — الجولة ${r.round}`, {
            description: `${r.case_code || "حالة"} · ${r.patient_name || ""} · ${fmtTime(r.requested_at)}`,
          });
        }
      } else {
        for (const r of fresh) announced.current.add(r.id);
        first.current = false;
      }
    } catch { /* alerts must never break the page */ }
  }, [scope, doctorSlot]);

  useEffect(() => {
    check();
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [check]);

  const clear = useCallback(() => { markRoundsSeen(scope); setCount(0); setLatest(null); }, [scope]);

  return { count, latest, clear, refresh: check };
}
