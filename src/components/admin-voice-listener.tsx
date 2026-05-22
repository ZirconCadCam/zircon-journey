import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { speak } from "@/lib/voice-notify";
import { deriveStageKey, getStage } from "@/lib/case-stages";

/**
 * Admin-only background listener. On every change to `slot_cases` it derives
 * the current stage of each case and, when the stage advances compared with
 * the previous snapshot, plays an Arabic AI voice announcement.
 *
 * Renders nothing — purely a side-effect component.
 */
export function AdminVoiceListener() {
  const stageMap = useRef<Map<string, string>>(new Map());
  const doctorNames = useRef<Map<number, string>>(new Map());
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh(initial = false) {
      const [{ data: docs }, { data: cs }] = await Promise.all([
        supabase.from("doctor_profiles").select("slot,name"),
        supabase.from("slot_cases").select("*").eq("archived", false),
      ]);
      if (cancelled) return;
      doctorNames.current = new Map(
        ((docs ?? []) as any[]).map((d) => [d.slot, d.name as string]),
      );
      const next = new Map<string, string>();
      for (const c of (cs ?? []) as any[]) {
        const stage = deriveStageKey(c);
        next.set(c.id, stage);
        if (!initial && hydrated.current) {
          const prev = stageMap.current.get(c.id);
          if (prev !== stage) {
            const doctor =
              doctorNames.current.get(c.doctor_slot) ?? `Slot ${c.doctor_slot}`;
            const label = getStage(stage).label;
            const phrase = prev
              ? `تنبيه إدارة. الحالة ${c.patient_name} للدكتور ${doctor} انتقلت إلى مرحلة ${label}.`
              : `تنبيه إدارة. حالة جديدة باسم ${c.patient_name} للدكتور ${doctor}.`;
            speak(phrase);
          }
        }
      }
      stageMap.current = next;
      hydrated.current = true;
    }

    void refresh(true);

    const ch = supabase
      .channel("admin-voice-listener")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "slot_cases" },
        () => void refresh(false),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return null;
}
