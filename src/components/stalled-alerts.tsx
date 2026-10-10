/**
 * تنبيهات الحالات المتوقفة (Stalled case alerts)
 *
 * تُظهر أيقونة تنبيه أمام كل بوابة (الطبيب / المصمم / الفني) بعدد الحالات
 * التي لم يتقدّم مستواها لأكثر من 12 ساعة، مفلترة حسب المسؤول عن التوقف
 * (مالك المرحلة الحالية `ownerRole`).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deriveStageKey, getStage } from "@/lib/case-stages";
import type { RoleKey } from "@/lib/chat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const STALL_HOURS = 12;

export interface StalledCase {
  id: string;
  case_code: string;
  patient_name: string;
  doctor_slot: number;
  doctorName: string;
  stageLabel: string;
  hours: number;
  owner: RoleKey;
}

/** يقرأ الحالات النشطة ويحسب المتوقفة لكل دور. */
export function useStalledCases() {
  const [rows, setRows] = useState<StalledCase[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [{ data: cases }, { data: docs }] = await Promise.all([
        supabase.from("slot_cases").select("*").eq("archived", false).eq("final_archived", false),
        supabase.from("doctor_profiles").select("slot,name"),
      ]);
      if (!alive) return;
      const names = new Map<number, string>((docs ?? []).map((d: any) => [d.slot, d.name]));
      const now = Date.now();
      const out: StalledCase[] = [];
      for (const c of (cases ?? []) as any[]) {
        const stage = getStage(deriveStageKey(c));
        if (!stage.ownerRole) continue;
        const ts = new Date(c.updated_at ?? c.created_at).getTime();
        const hours = (now - ts) / 3_600_000;
        if (hours < STALL_HOURS) continue;
        out.push({
          id: c.id,
          case_code: c.case_code,
          patient_name: c.patient_name,
          doctor_slot: c.doctor_slot,
          doctorName: names.get(c.doctor_slot) ?? `طبيب ${c.doctor_slot}`,
          stageLabel: stage.label,
          hours: Math.floor(hours),
          owner: stage.ownerRole,
        });
      }
      out.sort((a, b) => b.hours - a.hours);
      setRows(out);
    }
    void load();
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return rows;
}

function fmtDelay(h: number) {
  if (h < 24) return `${h} ساعة`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r ? `${d} يوم و${r} ساعة` : `${d} يوم`;
}

/** شارة تنبيه حمراء بعدّاد للحالات المتوقفة عند طبيب معيّن. */
export function StalledDoctorBadge({ items, label }: { items: StalledCase[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`حالات متوقفة — ${label}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="relative inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/15 px-2 py-0.5 text-[10px] font-extrabold text-destructive"
        >
          <AlertTriangle className="size-3" />
          {items.length}
          <span className="absolute inset-0 animate-ping rounded-full border border-destructive/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-72 p-0"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-xs font-bold">حالات بانتظار إجراء الطبيب — {label}</div>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="max-h-64 divide-y divide-border/60 overflow-y-auto">
          {items.map((c) => (
            <Link
              key={c.id}
              to="/cases/$id"
              params={{ id: c.id }}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-right hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{c.case_code}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
                  <Clock className="size-3" /> {fmtDelay(c.hours)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{c.patient_name}</div>
              <div className="text-[11px] text-gold">{c.stageLabel}</div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** أيقونة التنبيهات لدور واحد. */
export function StalledAlertsBadge({
  role,
  all,
  label,
}: {
  role: RoleKey;
  all: StalledCase[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => all.filter((c) => c.owner === role), [all, role]);
  if (!items.length) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`تنبيهات الحالات المتوقفة — ${label}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="relative grid size-9 place-items-center rounded-xl border border-destructive/50 bg-destructive/10 text-destructive transition hover:bg-destructive/20"
        >
          <AlertTriangle className="size-4" />
          <span className="absolute -top-1.5 -left-1.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-extrabold text-destructive-foreground shadow">
            {items.length}
          </span>
          <span className="absolute inset-0 animate-ping rounded-xl border border-destructive/40" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-xs font-bold">
            حالات متوقفة أكثر من {STALL_HOURS} ساعة — {label}
          </div>
          <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-border/60">
          {items.map((c) => (
            <Link
              key={c.id}
              to="/cases/$id"
              params={{ id: c.id }}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-right hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{c.case_code}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
                  <Clock className="size-3" /> {fmtDelay(c.hours)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {c.patient_name} · {c.doctorName}
              </div>
              <div className="text-[11px] text-gold">{c.stageLabel}</div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
