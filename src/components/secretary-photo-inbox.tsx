import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImageLightbox } from "@/components/image-lightbox";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { getStage, deriveStageKey } from "@/lib/case-stages";
import { Camera, Sparkles, Inbox, Loader2, Download, RefreshCw, Phone, Hash } from "lucide-react";
import type { RoleKey } from "@/lib/chat";

interface PhotoRow {
  id: string;
  case_code: string;
  patient_name: string;
  patient_phone?: string | null;
  tooth_number?: string | null;
  doctor_slot: number;
  before_photo_path: string | null;
  before_photo_name: string | null;
  before_photo_sent_at: string | null;
  after_photo_path: string | null;
  after_photo_name: string | null;
  after_photo_sent_at: string | null;
  [k: string]: any;
}

type Phase = "before" | "after";

interface Item {
  key: string;
  phase: Phase;
  path: string;
  name: string;
  at: string;
  caseCode: string;
  patient: string;
  phone: string | null;
  tooth: string | null;
  stageLabel: string;
  stagePercent: number;
  doctorSlot: number;
}

const PHASE_LABEL: Record<Phase, string> = {
  before: "قبل التجميل",
  after: "بعد التجميل",
};


/**
 * Secretary-only inbox that gathers every "before"/"after" patient photo sent by
 * the doctors of the secretary's own branch.
 */
export function SecretaryPhotoInbox({ role }: { role: RoleKey }) {
  const branch = role === "secretary_ibb" ? "ibb" : "sanaa";
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<Record<number, string>>({});
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [filter, setFilter] = useState<"all" | Phase>("all");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const { data: docs } = await supabase.from("doctor_profiles")
      .select("slot,name,branch").eq("branch", branch);
    const map: Record<number, string> = {};
    const slots: number[] = [];
    (docs ?? []).forEach((d: any) => { map[d.slot] = d.name; slots.push(d.slot); });
    setDoctors(map);

    if (slots.length === 0) { setRows([]); setLoading(false); return; }
    const { data } = await supabase.from("slot_cases")
      .select("*")
      .in("doctor_slot", slots)
      .or("before_photo_path.not.is.null,after_photo_path.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(300);
    setRows((data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [branch]);

  useEffect(() => {
    const ch = supabase.channel(`sec-photos-${branch}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "slot_cases" }, () => { void load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [branch]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const r of rows) {
      // Every photo stays bound to its own case row, so the patient identity and
      // the live workflow stage are always the case's real ones.
      const stage = getStage(deriveStageKey(r as any));
      const base = {
        caseCode: r.case_code,
        patient: r.patient_name,
        phone: r.patient_phone ?? null,
        tooth: r.tooth_number ?? null,
        stageLabel: stage.label,
        stagePercent: stage.percent,
        doctorSlot: r.doctor_slot,
      };
      if (r.before_photo_path) out.push({
        key: `${r.id}-before`, phase: "before", path: r.before_photo_path,
        name: r.before_photo_name || "صورة قبل", at: r.before_photo_sent_at || "",
        ...base,
      });
      if (r.after_photo_path) out.push({
        key: `${r.id}-after`, phase: "after", path: r.after_photo_path,
        name: r.after_photo_name || "صورة بعد", at: r.after_photo_sent_at || "",
        ...base,
      });
    }
    out.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    return filter === "all" ? out : out.filter(i => i.phase === filter);
  }, [rows, filter]);


  useEffect(() => {
    let alive = true;
    (async () => {
      const missing = items.filter(i => !urls[i.path]).slice(0, 60);
      if (missing.length === 0) return;
      const entries = await Promise.all(missing.map(async (i) => {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(i.path, 3600);
        return [i.path, data?.signedUrl ?? ""] as const;
      }));
      if (!alive) return;
      setUrls(prev => {
        const next = { ...prev };
        for (const [p, u] of entries) if (u) next[p] = u;
        return next;
      });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [items]);

  const lbImages = items.filter(i => urls[i.path]).map(i => ({ url: urls[i.path], name: i.name }));

  return (
    <div className="rounded-2xl bg-card border border-border shadow-luxury overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div className="font-extrabold text-sm flex items-center gap-2">
          <Inbox className="size-4 text-gold" />
          صندوق صور المرضى الواردة من الأطباء
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-1">
            {(["all", "before", "after"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${filter === f ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                {f === "all" ? "الكل" : PHASE_LABEL[f]}
              </button>
            ))}
          </div>
          <button onClick={() => void load()} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-gold transition inline-flex items-center gap-1">
            <RefreshCw className="size-3.5" /> تحديث
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">
          <Loader2 className="size-6 mx-auto animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-sm">
          <Camera className="size-10 mx-auto mb-3 opacity-40" />
          لا توجد صور واردة حتى الآن.
        </div>
      ) : (
        <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            const url = urls[i.path];
            const idx = lbImages.findIndex(x => x.url === url);
            const tone = i.phase === "before"
              ? "border-sky-500/50 bg-sky-50/50"
              : "border-emerald-500/50 bg-emerald-50/50";
            return (
              <div key={i.key} className={`rounded-xl border ${tone} overflow-hidden`}>
                <button type="button" onClick={() => idx >= 0 && setLightbox(idx)}
                  className="block w-full aspect-video bg-muted/40 overflow-hidden">
                  {url ? (
                    <img src={url} alt={i.name} className="w-full h-full object-cover hover:scale-105 transition" />
                  ) : (
                    <div className="w-full h-full grid place-items-center"><Loader2 className="size-5 animate-spin opacity-50" /></div>
                  )}
                </button>
                <div className="p-3 space-y-1.5">
                  <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${i.phase === "before" ? "bg-sky-600" : "bg-emerald-600"}`}>
                    {i.phase === "before" ? <Camera className="size-3" /> : <Sparkles className="size-3" />}
                    {PHASE_LABEL[i.phase]}
                  </div>
                  <div className="text-xs font-bold truncate">{i.patient}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{i.caseCode}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <DoctorAvatar name={doctors[i.doctorSlot] ?? ""} className="size-5" rounded="full" />
                    <span className="truncate">{doctors[i.doctorSlot] ?? "طبيب"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {i.at ? new Date(i.at).toLocaleString("ar-EG") : ""}
                    </span>
                    {url && (
                      <a href={url} download={i.name}
                        className="rounded-md border border-border px-2 py-1 text-[10px] font-bold hover:border-gold transition inline-flex items-center gap-1">
                        <Download className="size-3" /> تنزيل
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox !== null && lbImages.length > 0 && (
        <ImageLightbox images={lbImages} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
