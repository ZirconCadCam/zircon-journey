import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Stethoscope, FileText, Download, Share2, Loader2,
  ScanLine, User, Phone, Hash, ClipboardList, Calendar,
  Archive, MoreVertical, FileArchive, Pin, PinOff, Trash2, ClipboardCheck, Eye,
  RefreshCw, Send, ZoomIn, FolderOpen,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { CaseChatButton } from "@/components/case-chat-dialog";
import { ZipViewerDialog } from "@/components/zip-viewer-dialog";
import { TechRevisionPanel } from "@/components/tech-revision-panel";
import { ImageLightbox } from "@/components/image-lightbox";
import { addImageComment, postImageCommentToChat, postImageVoiceToChat, type NoteImageComment } from "@/lib/image-comments";
import { MessageSquare, Mic, Square, Trash2 as TrashIcon, BellRing, Sparkles, CheckCheck } from "lucide-react";
import { caseSignature, loadSeen, saveSeen, hasBaseline, type SeenMap } from "@/lib/designer-alerts";
import { playPhoneRing, playSystemChime, systemNotify, ensureNotifyPermission } from "@/lib/notify";
import { DesignerNotifyCenter } from "@/components/designer-notify-center";

/** Inject hex overrides for our oklch CSS variables into html2canvas's cloned doc. */
const H2C_ONCLONE = (doc: Document) => {
  const css = doc.createElement("style");
  css.textContent = `:root, html, body, * {
    --background:#ffffff; --foreground:#1a1a1a;
    --card:#ffffff; --card-foreground:#1a1a1a;
    --popover:#ffffff; --popover-foreground:#1a1a1a;
    --primary:#5b3a14; --primary-foreground:#ffffff;
    --secondary:#f5f0e0; --secondary-foreground:#1a1a1a;
    --muted:#f5f0e0; --muted-foreground:#777777;
    --accent:#b8893a; --accent-foreground:#ffffff;
    --destructive:#c0392b; --destructive-foreground:#ffffff;
    --border:#e2d4b1; --input:#e2d4b1; --ring:#b8893a;
    --gold:#b8893a; --gold-foreground:#ffffff;
    --sidebar:#ffffff; --sidebar-foreground:#1a1a1a;
    --sidebar-primary:#5b3a14; --sidebar-primary-foreground:#ffffff;
    --sidebar-accent:#f5f0e0; --sidebar-accent-foreground:#1a1a1a;
    --sidebar-border:#e2d4b1; --sidebar-ring:#b8893a;
    --chart-1:#b8893a; --chart-2:#5b3a14; --chart-3:#777777; --chart-4:#e2d4b1; --chart-5:#faf6ee;
  }
  html, body { background:#ffffff !important; color:#1a1a1a !important; }`;
  doc.head.appendChild(css);
};
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { saveToCenter, downloadUrlToCenter, fileManagerSupported, CENTER_FOLDER_NAME, openCachedFile } from "@/lib/file-manager";
import { loadZipDownloads, markZipDownloaded, clearZipDownloaded } from "@/lib/zip-download-state";
import { CaseShadeConfirm } from "@/components/shade-confirm";

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }
interface Case {
  id: string;
  case_code: string;
  doctor_slot: number;
  patient_name: string;
  patient_phone: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  tooth_number: string | null;
  teeth_count: string | null;
  shade: string | null;
  case_type: string | null;
  notes: string | null;
  notes_images?: { url: string; name: string }[] | null;
  notes_image_comments?: import("@/lib/image-comments").NoteImageComment[] | null;
  status: string;
  created_at: string;
  scan_path: string | null;
  scan_name: string | null;
  scan_size: number | null;
  scan_mime: string | null;
  extra_zip_path?: string | null;
  extra_zip_name?: string | null;
  extra_zip_mime?: string | null;
  extra_zip_size?: number | null;
  design_done: boolean | null;
  design_file_sent: boolean | null;
  design_html_sent?: boolean | null;
  design_html_path?: string | null;
  design_html_name?: string | null;
  design_received_by_tech?: boolean | null;
  fabrication_done: boolean | null;
  fabrication_file_sent: boolean | null;
  tech_data_sent_to_secretary?: boolean | null;
  secretary_received?: boolean | null;
  shipped_to_doctor?: boolean | null;
  received_temporary?: boolean | null;
  received_permanent?: boolean | null;
  final_archived?: boolean | null;
  archived?: boolean | null;
  pinned?: boolean | null;
  revision_design_file_path?: string | null;
  revision_design_file_name?: string | null;
  revision_design_done?: boolean | null;
  doctor_decision?: string | null;
  revision_notes?: string | null;
  tech_exec_notes?: string | null;
  shade_confirmed_doctor?: boolean | null;
  shade_confirmed_designer?: boolean | null;
  shade_confirmed_technician?: boolean | null;
}

import { CaseWorkflowControls } from "@/components/case-workflow-controls";
import { deriveStageKey, getStage, STAGES, type CaseStage } from "@/lib/case-stages";
import type { RoleKey } from "@/lib/chat";
import { ROLE_LABEL, getSignedUrl } from "@/lib/chat";
import { speak, arabicOrdinal } from "@/lib/voice-notify";
import { DoctorAvatar } from "@/components/doctor-avatar";


interface DesignerCasesProps {
  /** Which actor view: designer, technician, branch secretary, or admin */
  actor?: "designer" | "technician" | "secretary_sanaa" | "secretary_ibb" | "admin";
  /** When actor === technician, the secretary branch role to send to */
  technicianTarget?: RoleKey;
  actorName?: string;
}

export function DesignerCases({ actor = "designer", technicianTarget, actorName }: DesignerCasesProps = {}) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [filterSlot, setFilterSlot] = useState<number | "all">("all");
  const [stageFilter, setStageFilter] = useState<CaseStage | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archive">("active");
  const [zipPreview, setZipPreview] = useState<{ url: string; name: string | null } | null>(null);
  // Visual progress for the "إرسال إلى تلجرام" action (per-case).
  const [tgProgress, setTgProgress] = useState<{ id: string; pct: number; label: string; error?: boolean } | null>(null);
  // Designer → technician text revisions, keyed by case_code (shown in the case card).
  const [textRevisions, setTextRevisions] = useState<Record<string, string>>({});
  // Lightbox state for notes images: which case + which image index is open.
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; index: number } | null>(null);
  // Per-device persisted state: which case ZIPs were already downloaded and are
  // ready to re-open from the file manager. Survives refresh + logout/login.
  const [downloadedZips, setDownloadedZips] = useState<Record<string, { fileName: string; mime?: string | null }>>({});
  // Manual refresh button state.
  const [refreshing, setRefreshing] = useState(false);
  // Designer-only: durable "seen" map so unseen doctor-update badges persist
  // across refreshes and only clear when the designer looks at the case.
  const [seen, setSeen] = useState<SeenMap>({});
  // A brief header pulse whenever a fresh doctor update lands while on-page.
  const [alertPulse, setAlertPulse] = useState(false);

  useEffect(() => {
    if (actor === "designer") setSeen(loadSeen());
  }, [actor]);

  useEffect(() => {
    setDownloadedZips(loadZipDownloads(actor));
  }, [actor]);

  /** Re-fetch the case list. Shared by realtime, polling, focus and the button. */
  const refreshCases = useCallback(async () => {
    const { data: cs } = await supabase.from("slot_cases").select("*").order("created_at", { ascending: false });
    setCases((cs ?? []) as Case[]);
  }, []);

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCases();
      toast.success("تم تحديث الحالات");
    } finally {
      setRefreshing(false);
    }
  }, [refreshCases]);

  useEffect(() => {
    (async () => {
      const [{ data: docs }, { data: cs }] = await Promise.all([
        supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot"),
        supabase.from("slot_cases").select("*").order("created_at", { ascending: false }),
      ]);
      setDoctors(((docs ?? []) as Doctor[]).filter(d => d.active));
      setCases((cs ?? []) as Case[]);
      setLoading(false);
    })();

    // Live updates via realtime.
    const ch = supabase.channel("designer-cases-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_cases" }, () => { refreshCases(); })
      .subscribe();

    // Safety-net auto refresh every 20s (covers any missed realtime events,
    // important for the designer working on a desktop browser).
    const interval = 0; // polling removed — realtime + focus refresh are enough
    // Refresh immediately when the tab/window regains focus.
    const onFocus = () => { if (document.visibilityState === "visible") refreshCases(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      supabase.removeChannel(ch);
      void interval;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshCases]);

  const filtered = useMemo(() => {
    if (filterSlot === "all") return cases;
    return cases.filter(c => c.doctor_slot === filterSlot);
  }, [cases, filterSlot]);

  const doctorMap = useMemo(() => {
    const m = new Map<number, Doctor>();
    doctors.forEach(d => m.set(d.slot, d));
    return m;
  }, [doctors]);

  /** Build the device-folder location (role/doctor/case) for a case file. */
  function locFor(c: Case, category?: import("@/lib/case-folders").FileCategory): import("@/lib/case-folders").CaseFileLocation {
    const role: import("@/lib/case-folders").CaseRole =
      actor === "designer" ? "designer" : actor === "technician" ? "technician" : "admin";
    const doctorName = doctorMap.get(c.doctor_slot)?.name ?? `Slot ${c.doctor_slot}`;
    return { role, doctorName, patientName: c.patient_name, caseCode: c.case_code, category };
  }


  // Only count cases that are still live on the doctor's own page — i.e. not
  // manually archived and not finally archived. This keeps the per-doctor
  // badge here identical to the number of cases the doctor actually sees.
  const activeCases = useMemo(
    () => cases.filter(c => !c.archived && !c.final_archived),
    [cases],
  );

  const grouped = useMemo(() => {
    const counts = new Map<number, number>();
    activeCases.forEach(c => counts.set(c.doctor_slot, (counts.get(c.doctor_slot) ?? 0) + 1));
    return counts;
  }, [activeCases]);

  /* ------------------------------------------------------------------
   * Designer-only: unseen "doctor update" tracking.
   *   unseenMap  → caseId → "new" | "updated" for cases the doctor
   *                created/edited and the designer hasn't looked at yet.
   *   unseenByDoctor → per-doctor unseen count (drives the sidebar badges).
   * ------------------------------------------------------------------ */
  const unseenMap = useMemo(() => {
    const m = new Map<string, "new" | "updated">();
    if (actor !== "designer") return m;
    for (const c of activeCases) {
      const sig = caseSignature(c);
      const prev = seen[c.id];
      if (prev === undefined) m.set(c.id, "new");
      else if (prev !== sig) m.set(c.id, "updated");
    }
    return m;
  }, [activeCases, seen, actor]);

  const unseenByDoctor = useMemo(() => {
    const m = new Map<number, number>();
    if (actor !== "designer") return m;
    for (const c of activeCases) {
      if (unseenMap.has(c.id)) m.set(c.doctor_slot, (m.get(c.doctor_slot) ?? 0) + 1);
    }
    return m;
  }, [activeCases, unseenMap, actor]);

  const unseenTotal = unseenMap.size;

  /** Mark a set of cases as seen (persist + clear their badges). */
  const markSeen = useCallback((ids: string[]) => {
    if (actor !== "designer" || ids.length === 0) return;
    setSeen((prev) => {
      const next = { ...prev };
      const byId = new Map(activeCases.map((c) => [c.id, c] as const));
      let changed = false;
      for (const id of ids) {
        const c = byId.get(id);
        if (!c) continue;
        const sig = caseSignature(c);
        if (next[id] !== sig) { next[id] = sig; changed = true; }
      }
      if (changed) saveSeen(next);
      return changed ? next : prev;
    });
  }, [actor, activeCases]);

  const markDoctorSeen = useCallback((slot: number) => {
    markSeen(activeCases.filter((c) => c.doctor_slot === slot).map((c) => c.id));
  }, [markSeen, activeCases]);

  const markAllSeen = useCallback(() => {
    markSeen(activeCases.map((c) => c.id));
    toast.success("تمّت مشاهدة كل تحديثات الأطباء");
  }, [markSeen, activeCases]);

  /** Jump to a case from the notification center (switches tab + scrolls). */
  const focusCase = useCallback((caseId: string, tab: "new" | "revision" | "all") => {
    setFilterSlot("all");
    setView("active");
    setStageFilter(tab === "all" ? "all" : (tab as CaseStage | "all"));
    window.setTimeout(() => {
      const el = document.getElementById(`case-${caseId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-4", "ring-gold");
      window.setTimeout(() => el.classList.remove("ring-4", "ring-gold"), 2500);
    }, 180);
  }, []);




  // Compute the "pending file" gate: if this actor already checked a case
  // but didn't yet send the .rar file, block ticking new ones.
  const pendingCaseCode = useMemo(() => {
    if (actor === "designer") {
      const p = cases.find(c => c.design_done && !c.design_file_sent);
      return p?.case_code ?? null;
    }
    const p = cases.find(c => c.fabrication_done && !c.fabrication_file_sent);
    return p?.case_code ?? null;
  }, [cases, actor]);

  // Filter cases each actor should see.
  const visibleForActor = useMemo(() => {
    // Archive view: show finally-archived cases (technician + admin only),
    // pinned-first then newest.
    if (view === "archive") {
      const arch = filtered.filter(c => c.final_archived);
      return [...arch].sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    // Active view: hide final_archived + manually archived.
    const active = filtered.filter(c => !c.final_archived && !c.archived);
    if (actor === "technician") {
      return active.filter(c => (c.design_file_sent || c.design_done));
    }
    if (actor === "secretary_sanaa" || actor === "secretary_ibb") {
      const branch = actor === "secretary_sanaa" ? "sanaa" : "ibb";
      return active.filter(c => {
        if (!c.tech_data_sent_to_secretary) return false;
        const d = doctorMap.get(c.doctor_slot);
        return d?.branch === branch;
      });
    }
    return active;
  }, [filtered, actor, doctorMap, view]);

  /* Stage-level filtering (professional stage filter bar). */
  const stageCounts = useMemo(() => {
    const m = new Map<CaseStage, number>();
    for (const c of visibleForActor) {
      const k = deriveStageKey(c);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [visibleForActor]);

  /** الحالات التي طلب الطبيب فيها تعديلاً ولم تُعتمد بعد. */
  const needsRevision = useMemo(
    () => visibleForActor.filter(c => c.doctor_decision === "revision"),
    [visibleForActor],
  );

  const displayed = useMemo(() => {
    if (stageFilter === "all") return visibleForActor;
    if (stageFilter === "revision") return needsRevision;
    return visibleForActor.filter(c => deriveStageKey(c) === stageFilter);
  }, [visibleForActor, stageFilter, needsRevision]);




  /* ------------------------------------------------------------------
   * Voice arrival alerts (technician = new .rar arriving).
   * The designer has its own richer engine below.
   * ------------------------------------------------------------------ */
  const seenIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (actor !== "technician") return;
    const currentIds = new Set(visibleForActor.map(c => c.id));
    if (seenIds.current === null) {
      // First pass after load — establish baseline silently.
      seenIds.current = currentIds;
      return;
    }
    const prev = seenIds.current;
    const today = new Date().toDateString();
    const todaysCases = visibleForActor
      .filter(c => new Date(c.created_at).toDateString() === today)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const c of visibleForActor) {
      if (prev.has(c.id)) continue;
      if (new Date(c.created_at).toDateString() !== today) continue;
      const rank = todaysCases.findIndex(x => x.id === c.id) + 1;
      const doctor = doctorMap.get(c.doctor_slot);
      const doctorName = (doctor?.name ?? `Slot ${c.doctor_slot}`).replace(/^د\.?\s*/, "");
      const ord = arabicOrdinal(rank);
      speak(`لديك حالة جديدة من الدكتور ${doctorName}. الحالة رقم ${ord}.`);
    }
    seenIds.current = currentIds;
  }, [visibleForActor, loading, actor, doctorMap]);

  /* ------------------------------------------------------------------
   * Designer notification engine — professional audio + visual + badge
   * alerts whenever a DOCTOR creates or edits a case.
   *   • New case      → landline ring + spoken alert + toast + shade badge.
   *   • Edited case   → status chime + toast (doctor changed data/notes/image).
   * Badges (sidebar + per-card) are driven by `unseenMap` and persist until
   * the designer opens the doctor's list; this effect only handles the
   * live "moment of arrival" audio/visual burst.
   * ------------------------------------------------------------------ */
  const sigRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (loading || actor !== "designer") return;
    const current = new Map<string, string>();
    for (const c of activeCases) current.set(c.id, caseSignature(c));

    if (sigRef.current === null) {
      // First pass after load — establish baseline silently and seed the
      // durable "seen" store the very first time the designer uses the app.
      sigRef.current = current;
      if (!hasBaseline()) {
        const base: SeenMap = {};
        current.forEach((sig, id) => { base[id] = sig; });
        saveSeen(base);
        setSeen(base);
      }
      return;
    }

    const prev = sigRef.current;
    const fresh: { c: typeof activeCases[number]; kind: "new" | "updated" }[] = [];
    for (const c of activeCases) {
      const sig = current.get(c.id)!;
      const before = prev.get(c.id);
      if (before === undefined) fresh.push({ c, kind: "new" });
      else if (before !== sig) fresh.push({ c, kind: "updated" });
    }
    sigRef.current = current;
    if (fresh.length === 0) return;

    const news = fresh.filter(f => f.kind === "new");
    const updates = fresh.filter(f => f.kind === "updated");
    const nameOf = (slot: number) =>
      (doctorMap.get(slot)?.name ?? `Slot ${slot}`).replace(/^د\.?\s*/, "");

    setAlertPulse(true);
    window.setTimeout(() => setAlertPulse(false), 6000);

    if (news.length > 0) {
      playPhoneRing(5000);
      const first = news[0].c;
      const dn = nameOf(first.doctor_slot);
      const title = news.length > 1
        ? `📩 ${news.length} حالات جديدة من الأطباء`
        : `📩 حالة جديدة من الدكتور ${dn}`;
      const body = news.length > 1
        ? `وردت ${news.length} حالات جديدة بانتظار التصميم`
        : `${first.patient_name} — بانتظار التصميم`;
      toast(title, { description: body, icon: <BellRing className="size-4 text-gold" />, duration: 7000 });
      void systemNotify(title, body);
      speak(news.length > 1
        ? `لديك ${news.length} حالات جديدة من الأطباء بانتظار التصميم.`
        : `لديك حالة جديدة من الدكتور ${dn}. المريض ${first.patient_name}.`);
    }

    if (updates.length > 0) {
      playSystemChime();
      const first = updates[0].c;
      const dn = nameOf(first.doctor_slot);
      const title = updates.length > 1
        ? `✏️ ${updates.length} تحديثات من الأطباء`
        : `✏️ تحديث من الدكتور ${dn}`;
      const body = updates.length > 1
        ? `قام الأطباء بتحديث بيانات ${updates.length} حالات`
        : `تم تحديث بيانات الحالة: ${first.patient_name}`;
      toast(title, { description: body, icon: <RefreshCw className="size-4 text-emerald-500" />, duration: 7000, className: "border-emerald-500/40" });
      void systemNotify(title, body);
    }
  }, [activeCases, loading, actor, doctorMap]);

  // Ask for notification permission once, so alerts reach the device shade
  // even when the designer tab is in the background.
  useEffect(() => {
    if (actor === "designer") void ensureNotifyPermission();
  }, [actor]);


  /* ------------------------------------------------------------------
   * Load designer → technician text revisions for the visible cases so the
   * technician can read them directly inside the case data (no chat needed).
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (loading) return;
    if (actor !== "technician" && actor !== "admin") return;
    const codes = visibleForActor.map(c => c.case_code);
    if (codes.length === 0) return;
    let active = true;
    (async () => {
      // Conversations that involve both designer and technician.
      const { data: convs } = await supabase.from("chat_conversations")
        .select("id, participants");
      const convIds = ((convs ?? []) as any[])
        .filter(cv => Array.isArray(cv.participants)
          && cv.participants.includes("designer") && cv.participants.includes("technician"))
        .map(cv => cv.id);
      if (convIds.length === 0) return;
      const { data: msgs } = await supabase.from("chat_messages")
        .select("content, sender, conversation_id, message_type, created_at")
        .eq("message_type", "text")
        .eq("sender", "designer")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
        .limit(800);
      const map: Record<string, string> = {};
      for (const m of (msgs ?? []) as any[]) {
        const content = (m.content || "").trim();
        if (!content) continue;
        const isRev = /تعديل|revision/i.test(content);
        if (!isRev) continue;
        for (const code of codes) {
          if (content.includes(code)) map[code] = content;
        }
      }
      if (active) setTextRevisions(map);
    })();
    return () => { active = false; };
  }, [visibleForActor, loading, actor]);




  async function downloadScan(c: Case) {
    setBusyId(c.id);
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      const branchAr = doctor?.branch === "sanaa" ? "صنعاء" : doctor?.branch === "ibb" ? "إب" : "—";
      const dateStr = new Date(c.created_at).toISOString().slice(0, 10);
      const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
      const filename = `${safe(c.patient_name)} - ${branchAr} - ${safe(doctor?.name ?? `Slot ${c.doctor_slot}`)} - ${dateStr}.pdf`;

      // Build hidden Arabic-friendly node including the scan image when available
      const isImage = !!c.scan_mime?.startsWith("image/");
      const node = document.createElement("div");
      node.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;padding:36px;background:#fff;color:#1a1a1a;font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;text-align:right;line-height:1.7;";
      node.innerHTML = `
        <div style="border-bottom:3px solid #b8893a;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-size:22px;font-weight:800;color:#5b3a14;">Zircon Journey — تفاصيل الحالة</div>
          <div style="font-size:12px;color:#777;margin-top:4px;">${new Date().toLocaleString("ar-EG")}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${row("رمز الحالة", c.case_code)}
          ${row("الطبيب المعالج", doctor?.name ?? `Slot ${c.doctor_slot}`)}
          ${row("الفرع", branchAr)}
          ${row("الحالة", getStage(deriveStageKey(c)).label)}
          ${row("تاريخ الإنشاء", new Date(c.created_at).toLocaleString("ar-EG"))}
        </table>
        <div style="margin-top:18px;padding:12px;background:#faf6ee;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">بيانات المريض</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("الاسم", c.patient_name)}
            ${row("الهاتف", c.patient_phone || "—")}
            ${row("العمر", c.patient_age?.toString() || "—")}
            ${row("الجنس", c.patient_gender === "male" ? "ذكر" : c.patient_gender === "female" ? "أنثى" : "—")}
          </table>
        </div>
        <div style="margin-top:14px;padding:12px;background:#f5f0e0;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">تفاصيل الحالة</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("نوع الحالة", c.case_type || "—")}
            ${row("رقم السن (FDI)", c.tooth_number || "—")}
            ${row("اللون", c.shade || "—")}
          </table>
        </div>
        ${c.notes ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px solid #e2d4b1;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">ملاحظات</div>
          <div style="white-space:pre-wrap;font-size:13px;">${escapeHtml(c.notes)}</div>
        </div>` : ""}
        ${c.scan_path ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px dashed #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:8px;">📎 المسح ثلاثي الأبعاد</div>
          ${isImage ? `<img src="${c.scan_path}" crossorigin="anonymous" style="max-width:100%;max-height:520px;display:block;margin:0 auto;border:1px solid #e2d4b1;border-radius:6px;" />`
            : `<div style="font-size:12px;">الاسم: ${escapeHtml(c.scan_name || "—")}</div>
               ${c.scan_size ? `<div style="font-size:12px;">الحجم: ${(c.scan_size/1024/1024).toFixed(2)} MB</div>` : ""}`}
        </div>` : `<div style="margin-top:14px;padding:12px;background:#fff;border:1px dashed #ccc;color:#999;font-size:12px;">لا يوجد ملف مسح مرفق</div>`}
        <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">
          Zircon CAD/CAM — تقرير حالة آلي
        </div>
      `;
      document.body.appendChild(node);

      // Wait for the embedded image to load (or fail) before rasterizing
      const img = node.querySelector("img");
      if (img && !(img as HTMLImageElement).complete) {
        await new Promise<void>(res => {
          (img as HTMLImageElement).onload = () => res();
          (img as HTMLImageElement).onerror = () => res();
        });
      }

      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, onclone: H2C_ONCLONE });
      document.body.removeChild(node);

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const dataImg = canvas.toDataURL("image/jpeg", 0.92);
      if (imgH <= pageH) {
        pdf.addImage(dataImg, "JPEG", 0, 0, imgW, imgH);
      } else {
        let remaining = imgH; let y = 0;
        while (remaining > 0) {
          pdf.addImage(dataImg, "JPEG", 0, y, imgW, imgH);
          remaining -= pageH;
          if (remaining > 0) { pdf.addPage(); y -= pageH; }
        }
      }
      const blob = pdf.output("blob");

      if (fileManagerSupported()) {
        const r = await saveToCenter(blob, filename, c.case_code, locFor(c, "downloaded"));
        if (r.fallback) toast.success("تم تنزيل ملف PDF");
        else toast.success(`تم الحفظ في ${r.path}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast.success("تم تنزيل ملف PDF");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "تعذر تنزيل المسح");
    } finally { setBusyId(null); }
  }

  async function downloadPdf(c: Case) {
    setBusyId(c.id);
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      // Build a hidden Arabic-friendly HTML node, render via html2canvas (preserves Arabic glyphs)
      const node = document.createElement("div");
      node.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;padding:36px;background:#fff;color:#1a1a1a;font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;text-align:right;line-height:1.7;";
      node.innerHTML = `
        <div style="border-bottom:3px solid #b8893a;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-size:22px;font-weight:800;color:#5b3a14;">Zircon Journey — تفاصيل الحالة</div>
          <div style="font-size:12px;color:#777;margin-top:4px;">${new Date().toLocaleString("ar-EG")}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${row("رمز الحالة", c.case_code)}
          ${row("الطبيب المعالج", doctor?.name ?? `Slot ${c.doctor_slot}`)}
          ${row("الفرع", doctor?.branch === "sanaa" ? "صنعاء" : doctor?.branch === "ibb" ? "إب" : "—")}
          ${row("الحالة", getStage(deriveStageKey(c)).label)}
          ${row("تاريخ الإنشاء", new Date(c.created_at).toLocaleString("ar-EG"))}
        </table>
        <div style="margin-top:18px;padding:12px;background:#faf6ee;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">بيانات المريض</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("الاسم", c.patient_name)}
            ${row("الهاتف", c.patient_phone || "—")}
            ${row("العمر", c.patient_age?.toString() || "—")}
            ${row("الجنس", c.patient_gender === "male" ? "ذكر" : c.patient_gender === "female" ? "أنثى" : "—")}
          </table>
        </div>
        <div style="margin-top:14px;padding:12px;background:#f5f0e0;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">تفاصيل الحالة</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("نوع الحالة", c.case_type || "—")}
            ${row("رقم السن (FDI)", c.tooth_number || "—")}
            ${row("اللون", c.shade || "—")}
          </table>
        </div>
        ${c.notes ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px solid #e2d4b1;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">ملاحظات</div>
          <div style="white-space:pre-wrap;font-size:13px;">${escapeHtml(c.notes)}</div>
        </div>` : ""}
        ${c.scan_path ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px dashed #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">📎 المسح ثلاثي الأبعاد</div>
          <div style="font-size:12px;">الاسم: ${escapeHtml(c.scan_name || "—")}</div>
          ${c.scan_size ? `<div style="font-size:12px;">الحجم: ${(c.scan_size/1024/1024).toFixed(2)} MB</div>` : ""}
          <div style="font-size:11px;color:#777;margin-top:4px;direction:ltr;text-align:left;word-break:break-all;">${escapeHtml(c.scan_path)}</div>
        </div>` : ""}
        <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">
          Zircon CAD/CAM — تقرير حالة آلي
        </div>
      `;
      document.body.appendChild(node);
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, onclone: H2C_ONCLONE });
      document.body.removeChild(node);

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (imgH <= pageH) {
        pdf.addImage(img, "JPEG", 0, 0, imgW, imgH);
      } else {
        // Multi-page
        let remaining = imgH;
        let y = 0;
        while (remaining > 0) {
          pdf.addImage(img, "JPEG", 0, y, imgW, imgH);
          remaining -= pageH;
          if (remaining > 0) { pdf.addPage(); y -= pageH; }
        }
      }
      const blob = pdf.output("blob");
      const filename = `${c.case_code}-${c.patient_name.replace(/[^\p{L}\d_-]+/gu, "_").slice(0, 30)}.pdf`;

      if (fileManagerSupported()) {
        const r = await saveToCenter(blob, filename, c.case_code, locFor(c, "downloaded"));
        if (r.fallback) toast.success("تم تنزيل ملف PDF");
        else toast.success(`تم الحفظ في ${r.path}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast.success("تم تنزيل ملف PDF");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "تعذر إنشاء PDF");
    } finally { setBusyId(null); }
  }

  async function shareExternal(c: Case) {
    const doctor = doctorMap.get(c.doctor_slot);
    const summary = [
      `📋 حالة ${c.case_code}`,
      `الطبيب: ${doctor?.name ?? ""}`,
      `المريض: ${c.patient_name}`,
      c.tooth_number ? `السن: ${c.tooth_number}` : null,
      c.shade ? `اللون: ${c.shade}` : null,
      c.case_type ? `النوع: ${c.case_type}` : null,
      c.notes ? `ملاحظات: ${c.notes}` : null,
    ].filter(Boolean).join("\n");
    // Share the case summary text; falls back to clipboard automatically.
    const { shareOrCopy } = await import("@/lib/share");
    await shareOrCopy({ title: `حالة ${c.case_code}`, text: summary, url: c.scan_path || undefined });
  }

  async function archiveCase(c: Case) {
    if (!confirm(`أرشفة الحالة ${c.case_code}؟ لن تظهر بعدها في القائمة.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from("slot_cases").update({ archived: true }).eq("id", c.id);
    setBusyId(null);
    if (error) { toast.error("تعذرت الأرشفة"); return; }
    setCases(prev => prev.filter(x => x.id !== c.id));
    toast.success("تم نقل الحالة إلى الأرشيف");
  }

  /** Admin: toggle pin on an archived case. */
  async function togglePin(c: Case) {
    setBusyId(c.id);
    const next = !c.pinned;
    const { error } = await supabase.from("slot_cases").update({ pinned: next }).eq("id", c.id);
    setBusyId(null);
    if (error) { toast.error("تعذر التثبيت"); return; }
    setCases(prev => prev.map(x => x.id === c.id ? { ...x, pinned: next } : x));
    toast.success(next ? "تم تثبيت الحالة" : "تم إلغاء التثبيت");
  }

  /** Admin: permanently delete an archived case. */
  async function deleteCase(c: Case) {
    if (!confirm(`حذف الحالة ${c.case_code} نهائياً؟ لا يمكن التراجع.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from("slot_cases").delete().eq("id", c.id);
    setBusyId(null);
    if (error) { toast.error("تعذر الحذف"); return; }
    setCases(prev => prev.filter(x => x.id !== c.id));
    toast.success("تم حذف الحالة نهائياً");
  }


  /** Download the doctor-uploaded scan as a ZIP into the device file manager,
   * showing the floating progress "tube" while streaming + packaging.
   * Filename: "<patient> - د/<doctor> - YYYY-MM-DD.zip" */
  async function downloadScanZip(c: Case) {
    if (!c.scan_path) { toast.error("لا يوجد ملف مرفق"); return; }
    setBusyId(c.id);
    const doctor = doctorMap.get(c.doctor_slot);
    const date = new Date(c.created_at).toISOString().slice(0, 10);
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
    const docName = safe((doctor?.name ?? `Slot ${c.doctor_slot}`).replace(/^د\.?\s*/, ""));
    const baseName = `${safe(c.patient_name)} - د.${docName} - ${date}`;
    const fileName = `${baseName}.zip`;
    try {
      // If we already downloaded this zip before, re-open it straight from the
      // device file manager — no re-download.
      const opened = await openCachedFile(fileName, locFor(c, "downloaded"), "application/zip", c.case_code);
      if (opened) {
        markZipDownloaded(actor, c.id, { fileName, mime: "application/zip" });
        setDownloadedZips(prev => ({ ...prev, [c.id]: { fileName, mime: "application/zip" } }));
        toast.success("تم فتح الملف من جهازك"); setBusyId(null); return;
      }
    } catch { /* fall through to a fresh download */ }
    const { registerDownloadTask, fetchBlobWithProgress } = await import("@/lib/transfer-manager");
    const task = registerDownloadTask(fileName);
    try {
      // Streaming counts for 90% of the bar; packaging/saving the rest.
      const blob = await fetchBlobWithProgress(c.scan_path, (loaded, total) => {
        if (total > 0) task.update((loaded / total) * 90, loaded, total);
      });
      const isZip = (c.scan_mime || "").includes("zip") || /\.zip$/i.test(c.scan_name || "");
      let outBlob = blob;
      if (!isZip) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        zip.file(c.scan_name || "scan.bin", blob);
        outBlob = await zip.generateAsync({ type: "blob" });
      }
      task.update(96);
      const r = await saveToCenter(outBlob, fileName, c.case_code, locFor(c, "downloaded"));
      const blobUrl = URL.createObjectURL(outBlob);
      // persistent: the "open" icon stays until the designer actually opens the file.
      task.done({ blobUrl, savedPath: r.path, fallback: r.fallback, mime: "application/zip", nativeUri: r.uri, persistent: true });
      // Persist the "downloaded → ready to open" state for this case on this device.
      markZipDownloaded(actor, c.id, { fileName, mime: "application/zip", nativeUri: r.uri });
      setDownloadedZips(prev => ({ ...prev, [c.id]: { fileName, mime: "application/zip" } }));
      toast.success(r.fallback ? "تم تنزيل الملف — اضغط لفتحه" : `تم الحفظ في ${r.path} — اضغط لفتحه`);
    } catch (e: any) {
      console.error(e);
      task.fail();
      toast.error(e.message || "تعذر تنزيل الملف");
    } finally { setBusyId(null); }
  }

  /** Re-open a previously-downloaded ZIP straight from the device file manager.
   * If the saved copy is gone, fall back to a fresh download. */
  async function openSavedZip(c: Case) {
    const saved = downloadedZips[c.id];
    if (!saved) { await downloadScanZip(c); return; }
    setBusyId(c.id);
    try {
      const opened = await openCachedFile(saved.fileName, locFor(c, "downloaded"), saved.mime || "application/zip", c.case_code);
      if (opened) { toast.success("تم فتح الملف من جهازك"); return; }
      // Saved copy no longer present on this device — clear and re-download.
      clearZipDownloaded(actor, c.id);
      setDownloadedZips(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      setBusyId(null);
      await downloadScanZip(c);
    } catch {
      setBusyId(null);
      await downloadScanZip(c);
    } finally { setBusyId(null); }
  }

  /** Technician: download the latest .rar from the designer for this case
   * into the device file manager, with the floating progress "tube". */
  async function downloadDesignRar(c: Case) {
    setBusyId(c.id);
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      const date = new Date(c.created_at).toISOString().slice(0, 10);
      const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
      const docName = safe((doctor?.name ?? `Slot ${c.doctor_slot}`).replace(/^د\.?\s*/, ""));
      const baseName = `${safe(c.patient_name)} - د.${docName} - ${date}`;

      // Prefer the revision rar if present, otherwise locate the latest .rar
      // attachment sent by the designer in this case's chat thread.
      let url: string | null = null;
      if ((c as any).revision_design_file_path) {
        url = (c as any).revision_design_file_path as string;
      } else {
        const { data: convs } = await supabase.from("chat_conversations")
          .select("id, participants").eq("doctor_slot", c.doctor_slot);
        const ids = ((convs ?? []) as any[])
          .filter(cv => Array.isArray(cv.participants)
            && cv.participants.includes("designer")
            && cv.participants.includes("technician"))
          .map(cv => cv.id);
        if (ids.length) {
          const { data: msgs } = await supabase.from("chat_messages")
            .select("attachment_path, attachment_name, content, created_at")
            .in("conversation_id", ids)
            .eq("sender", "designer")
            .eq("message_type", "file")
            .order("created_at", { ascending: false }).limit(50);
          const hit = ((msgs ?? []) as any[]).find(m =>
            /\.rar$/i.test(m.attachment_name || "") &&
            (m.content || "").includes(c.case_code));
          if (hit) { url = hit.attachment_path; }
        }
      }

      if (!url) { toast.error("لم يصل ملف التصميم (.rar) بعد"); return; }
      const resolved = /^https?:\/\//i.test(url) ? url : (await getSignedUrl(url, 3600)) ?? url;
      const { transferDownload } = await import("@/lib/transfer-manager");
      await transferDownload({
        url: resolved, filename: `${baseName}.rar`,
        saveToCenter: fileManagerSupported(), subfolder: c.case_code, location: locFor(c, "downloaded"),
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "تعذر تنزيل ملف التصميم");
    } finally { setBusyId(null); }
  }

  /** Item 2: make any stored file (cloud path or URL) clickable to download. */
  async function downloadCloudFile(path: string | null | undefined, name: string, mime?: string | null, location?: import("@/lib/case-folders").CaseFileLocation) {
    if (!path) { toast.error("لا يوجد ملف للتنزيل"); return; }
    try {
      // Re-open from the device file manager if the file was already saved there.
      if (location) {
        const opened = await openCachedFile(name, location, mime);
        if (opened) { toast.success("تم فتح الملف من جهازك"); return; }
      }
      const resolved = /^https?:\/\//i.test(path) ? path : (await getSignedUrl(path, 3600)) ?? path;
      const { transferDownload } = await import("@/lib/transfer-manager");
      await transferDownload({ url: resolved, filename: name, mime, saveToCenter: fileManagerSupported(), location });
    } catch (e: any) {
      toast.error(e.message || "تعذر تنزيل الملف");
    }
  }

  /** Build a PDF of the case conversations, upload it, return a signed URL. */
  async function buildAndUploadConversationsPdf(c: Case, convIds: string[]): Promise<string | null> {
    try {
      if (!convIds.length) return null;
      const { data: msgs } = await supabase.from("chat_messages")
        .select("sender, sender_name, content, created_at, message_type, attachment_name")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true }).limit(500);
      const rows = ((msgs ?? []) as any[]).filter(
        m => (m.content || "").includes(c.case_code) || m.message_type === "file",
      );
      const node = document.createElement("div");
      node.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;padding:36px;background:#fff;color:#1a1a1a;font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;text-align:right;line-height:1.7;";
      node.innerHTML = `
        <div style="border-bottom:3px solid #b8893a;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-size:22px;font-weight:800;color:#5b3a14;">محادثات الحالة ${escapeHtml(c.case_code)}</div>
          <div style="font-size:12px;color:#777;margin-top:4px;">${escapeHtml(c.patient_name)} — ${new Date().toLocaleString("ar-EG")}</div>
        </div>
        ${rows.length ? rows.map(m => `
          <div style="margin-bottom:10px;padding:10px;border:1px solid #e2d4b1;border-radius:8px;background:#faf6ee;">
            <div style="font-size:11px;color:#777;">${escapeHtml(ROLE_LABEL[m.sender as RoleKey] ?? m.sender)} • ${new Date(m.created_at).toLocaleString("ar-EG")}</div>
            <div style="font-size:13px;margin-top:4px;white-space:pre-wrap;">${escapeHtml(m.content || (m.attachment_name ? `📎 ${m.attachment_name}` : "—"))}</div>
          </div>`).join("") : `<div style="color:#999;">لا توجد محادثات لهذه الحالة.</div>`}
      `;
      document.body.appendChild(node);
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, onclone: H2C_ONCLONE });
      document.body.removeChild(node);
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW; const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (imgH <= pageH) pdf.addImage(img, "JPEG", 0, 0, imgW, imgH);
      else { let remaining = imgH, y = 0; while (remaining > 0) { pdf.addImage(img, "JPEG", 0, y, imgW, imgH); remaining -= pageH; if (remaining > 0) { pdf.addPage(); y -= pageH; } } }
      const blob = pdf.output("blob");
      const path = `${c.case_code}/telegram/conversations-${Date.now()}.pdf`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (error) { console.error(error); return null; }
      return await getSignedUrl(path, 3600);
    } catch (e) { console.error(e); return null; }
  }

  /** Item 3: send the whole archived case (data + zip + rar before/after + chat PDF) to Telegram. */
  async function sendToTelegram(c: Case) {
    setBusyId(c.id);
    const prog = (pct: number, label: string, error = false) =>
      setTgProgress({ id: c.id, pct, label, error });
    prog(5, "تجهيز بيانات الحالة…");
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      const branchAr = doctor?.branch === "sanaa" ? "صنعاء" : doctor?.branch === "ibb" ? "إب" : "—";
      const caption = [
        `🦷 تفاصيل الحالة ${c.case_code}`,
        `المريض: ${c.patient_name}`,
        `الطبيب: ${doctor?.name ?? `Slot ${c.doctor_slot}`} • ${branchAr}`,
        c.patient_phone ? `الهاتف: ${c.patient_phone}` : null,
        c.patient_age ? `العمر: ${c.patient_age}` : null,
        c.patient_gender ? `الجنس: ${c.patient_gender === "male" ? "ذكر" : "أنثى"}` : null,
        c.tooth_number ? `السن: ${c.tooth_number}` : null,
        c.shade ? `اللون: ${c.shade}` : null,
        c.case_type ? `النوع: ${c.case_type}` : null,
        c.notes ? `ملاحظات: ${c.notes}` : null,
        `التاريخ: ${new Date(c.created_at).toLocaleDateString("ar-EG")}`,
      ].filter(Boolean).join("\n");

      const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
      const documents: { url: string; filename: string }[] = [];
      // Track which expected items were found so we can warn about gaps clearly.
      const missing: string[] = [];
      const urlFailed: string[] = [];

      // (a) ZIP from the doctor to the designer — before the revision.
      if (c.scan_path) {
        const url = /^https?:\/\//i.test(c.scan_path) ? c.scan_path : await getSignedUrl(c.scan_path, 3600);
        const ext = /\.zip$/i.test(c.scan_name || "") ? "zip" : (c.scan_name?.split(".").pop() || "zip");
        if (url) documents.push({ url, filename: `${safe(c.patient_name)} - ملف الحالة (قبل التعديل).${ext}` });
        else urlFailed.push("ملف الحالة ZIP (قبل التعديل)");
      } else {
        missing.push("ملف الحالة ZIP من الطبيب (قبل التعديل)");
      }

      // Gather conversation messages once (files + designer→technician text revision).
      prog(25, "جلب المحادثات وملفات الحالة…");
      const { data: convs } = await supabase.from("chat_conversations")
        .select("id, participants").eq("doctor_slot", c.doctor_slot);
      const convList = ((convs ?? []) as any[]);
      const convIds = convList.map(cv => cv.id);
      const designerTechConvIds = convList
        .filter(cv => Array.isArray(cv.participants)
          && cv.participants.includes("designer") && cv.participants.includes("technician"))
        .map(cv => cv.id);

      let beforeRar: string | null = null;
      let afterRar: string | null = c.revision_design_file_path ?? null;
      let afterZip: string | null = null;
      let afterZipName: string | null = null;
      let designerTextRevision: string | null = null;

      if (convIds.length) {
        const { data: msgs } = await supabase.from("chat_messages")
          .select("attachment_path, attachment_name, content, message_type, sender, conversation_id, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: true }).limit(400);
        for (const m of (msgs ?? []) as any[]) {
          const content = m.content || "";
          if (!content.includes(c.case_code) && m.message_type !== "file") {
            // text messages might not embed the code; only filter file messages by code below
          }
          const isRev = /تعديل|revision/i.test(content);
          // --- file messages: rar (before/after) + zip after edit ---
          if (m.message_type === "file" && m.attachment_path && content.includes(c.case_code)) {
            if (/\.rar$/i.test(m.attachment_name || "")) {
              if (isRev) { if (!afterRar) afterRar = m.attachment_path; }
              else beforeRar = m.attachment_path;
            } else if (/\.zip$/i.test(m.attachment_name || "") && isRev) {
              afterZip = m.attachment_path;
              afterZipName = m.attachment_name;
            }
          }
          // --- designer → technician text revision ---
          if (
            m.message_type === "text" && m.sender === "designer"
            && designerTechConvIds.includes(m.conversation_id)
            && isRev && content.includes(c.case_code)
          ) {
            designerTextRevision = content;
          }
        }
      }

      if (afterZip) {
        const url = /^https?:\/\//i.test(afterZip) ? afterZip : await getSignedUrl(afterZip, 3600);
        const ext = /\.zip$/i.test(afterZipName || "") ? "zip" : (afterZipName?.split(".").pop() || "zip");
        if (url) documents.push({ url, filename: `${safe(c.patient_name)} - ملف الحالة (بعد التعديل).${ext}` });
        else urlFailed.push("ملف الحالة ZIP (بعد التعديل)");
      }
      if (beforeRar) {
        const url = /^https?:\/\//i.test(beforeRar) ? beforeRar : await getSignedUrl(beforeRar, 3600);
        if (url) documents.push({ url, filename: `${safe(c.patient_name)} - التصميم قبل التعديل.rar` });
        else urlFailed.push("ملف التصميم RAR (قبل التعديل)");
      } else {
        missing.push("ملف التصميم RAR من المصمم (قبل التعديل)");
      }
      if (afterRar) {
        const url = /^https?:\/\//i.test(afterRar) ? afterRar : await getSignedUrl(afterRar, 3600);
        if (url) documents.push({ url, filename: `${safe(c.patient_name)} - التصميم بعد التعديل.rar` });
        else urlFailed.push("ملف التصميم RAR (بعد التعديل)");
      }

      // Designer → technician text revision (sent as part of the case caption).
      prog(50, "تجهيز ملفات التصميم…");
      let finalCaption = caption;
      if (designerTextRevision) {
        finalCaption += `\n\n✏️ تعديل المصمم النصي للفني:\n${designerTextRevision}`;
      } else {
        missing.push("نص التعديل من المصمم للفني");
      }

      // (c) conversations PDF
      prog(65, "تجهيز ملف المحادثات (PDF)…");
      const pdfUrl = await buildAndUploadConversationsPdf(c, convIds);
      if (pdfUrl) documents.push({ url: pdfUrl, filename: `${safe(c.patient_name)} - المحادثات.pdf` });
      else urlFailed.push("ملف PDF للمحادثات");


      prog(82, `جارٍ الإرسال إلى تلجرام (${documents.length} ملف)…`);
      const { sendCaseToTelegram } = await import("@/lib/telegram.functions");
      const res: any = await sendCaseToTelegram({ data: { caption: finalCaption, documents } });
      const failed = (res?.sent || []).filter((s: any) => !s.ok);

      // Build a clear, non-silent summary of what happened (pure + tested).
      const { buildTelegramSendReport } = await import("@/lib/telegram-send-report");
      const reports = buildTelegramSendReport({
        missing,
        urlFailed,
        failed: failed.map((s: any) => ({ filename: s.filename, error: s.error })),
        documentCount: documents.length,
      });
      for (const r of reports) {
        if (r.kind === "info") toast.info(r.text, { duration: r.duration });
        else if (r.kind === "warning") toast.warning(r.text, { duration: r.duration });
        else if (r.kind === "error") toast.error(r.text, { duration: r.duration });
        else toast.success(r.text, { duration: r.duration });
      }
      prog(100, failed.length ? `اكتمل الإرسال مع فشل ${failed.length} ملف` : "اكتمل الإرسال بنجاح", failed.length > 0);
      window.setTimeout(() => setTgProgress((cur) => (cur && cur.id === c.id ? null : cur)), 4000);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "تعذر الإرسال إلى تلجرام");
      prog(100, "تعذّر الإرسال إلى تلجرام", true);
      window.setTimeout(() => setTgProgress((cur) => (cur && cur.id === c.id ? null : cur)), 5000);
    } finally { setBusyId(null); }
  }




  // delete removed from designer page per requirements


  if (loading) {
    return <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
      <Loader2 className="size-6 animate-spin mx-auto mb-2" /> جارِ تحميل الحالات…
    </div>;
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-5">
      {/* Doctor filter sidebar */}
      <aside className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury self-start">
        <div className="p-4 border-b border-border font-bold text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Stethoscope className="size-4 text-gold" /> فلترة حسب الطبيب
          </span>
          {actor === "designer" && unseenTotal > 0 && (
            <button
              onClick={markAllSeen}
              title="تحديد كل تحديثات الأطباء كمقروءة"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/20 transition">
              <CheckCheck className="size-3" /> مقروء
            </button>
          )}
        </div>
        {actor === "designer" && unseenTotal > 0 && (
          <div className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold text-gold-foreground gradient-gold ${alertPulse ? "animate-pulse" : ""}`}>
            <BellRing className="size-3.5" />
            {unseenTotal} تحديث جديد من الأطباء
          </div>
        )}
        <ul className="divide-y divide-border max-h-[600px] overflow-y-auto">
          <li>
            <button onClick={() => setFilterSlot("all")}
              className={`w-full text-start p-3 flex items-center justify-between transition ${filterSlot === "all" ? "bg-gold/10 border-r-4 border-gold" : "hover:bg-muted/40"}`}>
              <span className="font-bold text-sm">كل الأطباء</span>
              <span className="flex items-center gap-1.5">
                {actor === "designer" && unseenTotal > 0 && (
                  <span className="inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-extrabold text-destructive-foreground">{unseenTotal}</span>
                )}
                <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 font-bold">{activeCases.length}</span>
              </span>
            </button>
          </li>
          {doctors.map(d => {
            const count = grouped.get(d.slot) ?? 0;
            const on = filterSlot === d.slot;
            const unseen = actor === "designer" ? (unseenByDoctor.get(d.slot) ?? 0) : 0;
            return (
              <li key={d.slot}>
                <button
                  onClick={() => { setFilterSlot(d.slot); if (actor === "designer") markDoctorSeen(d.slot); }}
                  className={`w-full text-start p-3 flex items-center gap-2 transition ${on ? "bg-gold/10 border-r-4 border-gold" : "hover:bg-muted/40"} ${unseen > 0 ? "bg-gold/[0.06]" : ""}`}>
                  <span className="relative shrink-0">
                    <DoctorAvatar name={d.name} className="size-8" rounded="lg" />
                    {unseen > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-extrabold text-destructive-foreground ring-2 ring-card animate-pulse">{unseen}</span>
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs truncate flex items-center gap-1">
                      {d.name}
                      {unseen > 0 && <BellRing className="size-3 text-gold shrink-0" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{d.branch === "sanaa" ? "صنعاء" : d.branch === "ibb" ? "إب" : ""}</div>
                  </div>
                  {count > 0 && <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-bold">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>


      {/* Cases list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-muted-foreground">
            عرض <span className="font-bold text-foreground">{displayed.length}</span> حالة
            {stageFilter !== "all" && <span className="text-muted-foreground"> من {visibleForActor.length}</span>}
            {view === "archive" && <span className="text-gold font-bold"> (الأرشيف)</span>}
            {filterSlot !== "all" && doctorMap.get(filterSlot) && <> — {doctorMap.get(filterSlot)!.name}</>}
          </div>

          <div className="flex items-center gap-2">
            {actor === "designer" && (
              <DesignerNotifyCenter
                cases={cases}
                doctorName={(slot) => doctorMap.get(slot)?.name ?? `Slot ${slot}`}
                unseenMap={unseenMap}
                textRevisions={textRevisions}
                onMarkSeen={markSeen}
                onMarkAllSeen={markAllSeen}
                onOpenCase={focusCase}
              />
            )}
            <button onClick={manualRefresh} disabled={refreshing}
              title="تحديث القائمة"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition disabled:opacity-60">
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : "text-gold"}`} />
              {refreshing ? "جارٍ التحديث…" : "تحديث"}
            </button>
            {(actor === "technician" || actor === "admin") && (
              <div className="inline-flex rounded-xl border border-border bg-card p-1 shadow-luxury">
                <button onClick={() => setView("active")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${view === "active" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <ClipboardCheck className="size-3.5" /> النشطة
                </button>
                <button onClick={() => setView("archive")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${view === "archive" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
                  <Archive className="size-3.5" /> الأرشيف
                </button>
              </div>
            )}
            {fileManagerSupported() && (
              <div className="text-[11px] text-muted-foreground">
                تُحفظ التنزيلات في مجلد <span className="font-bold text-gold">{CENTER_FOLDER_NAME}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stage filter bar */}
        <div className="rounded-2xl bg-card border border-border p-3 shadow-luxury">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-muted-foreground">
            <ClipboardCheck className="size-3.5 text-gold" /> فلترة حسب مستوى الحالة
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStageFilter("all")}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${stageFilter === "all" ? "gradient-gold text-gold-foreground border-transparent shadow-gold" : "border-border bg-background hover:border-gold"}`}>
              الكل <span className="opacity-80">({visibleForActor.length})</span>
            </button>
            {STAGES.map(s => {
              const n = stageCounts.get(s.key) ?? 0;
              const on = stageFilter === s.key;
              return (
                <button key={s.key}
                  onClick={() => setStageFilter(on ? "all" : s.key)}
                  disabled={n === 0 && !on}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed ${on ? "gradient-gold text-gold-foreground border-transparent shadow-gold" : "border-border bg-background hover:border-gold"}`}>
                  {s.label} <span className="opacity-80">({n})</span>
                </button>
              );
            })}
            <button
              onClick={() => setStageFilter(stageFilter === "revision" ? "all" : "revision")}
              disabled={needsRevision.length === 0 && stageFilter !== "revision"}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition disabled:opacity-40 disabled:cursor-not-allowed ${stageFilter === "revision" ? "bg-destructive text-destructive-foreground border-transparent shadow-luxury" : "border-destructive/50 text-destructive bg-background hover:border-destructive"}`}>
              يلزم تعديل <span className="opacity-80">({needsRevision.length})</span>
            </button>
          </div>
        </div>

        {displayed.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
            <ClipboardList className="size-10 mx-auto mb-3 opacity-40" />
            لا توجد حالات لعرضها
          </div>
        ) : (
          <ul className="space-y-3">
            {displayed.map(c => {

              const doctor = doctorMap.get(c.doctor_slot);
              const busy = busyId === c.id;
              const unseenKind = actor === "designer" ? unseenMap.get(c.id) : undefined;
              return (
                <li key={c.id} id={`case-${c.id}`} className={`relative rounded-2xl bg-card border p-5 shadow-luxury hover:border-gold/60 transition ${unseenKind ? "border-gold ring-2 ring-gold/40" : c.pinned && view === "archive" ? "border-gold ring-1 ring-gold/40" : "border-border"}`}>
                  {unseenKind && (
                    <button
                      onClick={() => markSeen([c.id])}
                      title="تحديد كمقروء"
                      className={`absolute -top-2 -left-2 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-gold animate-pulse ${unseenKind === "new" ? "gradient-gold text-gold-foreground" : "bg-emerald-500 text-white"}`}>
                      {unseenKind === "new"
                        ? <><BellRing className="size-3" /> حالة جديدة</>
                        : <><RefreshCw className="size-3" /> تحديث من الطبيب</>}
                    </button>
                  )}
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs rounded-md bg-muted px-2 py-0.5 font-bold">{c.case_code}</span>
                        <span className="text-[11px] rounded-full gradient-gold text-gold-foreground px-2 py-0.5 font-bold">{getStage(deriveStageKey(c)).label}</span>

                        {(c.revision_design_done || c.revision_design_file_path) && (actor === "technician" || actor === "admin") && (
                          <span className="text-[10px] rounded-full bg-amber-500 text-white px-2 py-0.5 font-bold inline-flex items-center gap-1" title="ملف التصميم المعدّل من المصمم — أحدث نسخة">
                            <RefreshCw className="size-3" /> ملف معدّل · آخر تحديث
                          </span>
                        )}
                        {c.pinned && view === "archive" && (
                          <span className="text-[10px] rounded-full bg-gold/20 text-gold px-2 py-0.5 font-bold inline-flex items-center gap-1">
                            <Pin className="size-3" /> مثبتة
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" /> {new Date(c.created_at).toLocaleDateString("ar-EG")}
                        </span>
                      </div>
                      <div className="mt-2 font-extrabold text-lg flex items-center gap-2">
                        <User className="size-4 text-gold" /> {c.patient_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <DoctorAvatar name={doctor?.name} className="size-7" />
                        <span className="flex items-center gap-1">
                          {doctor?.name ?? `Slot ${c.doctor_slot}`}
                          {doctor?.branch && <> • {doctor.branch === "sanaa" ? "صنعاء" : "إب"}</>}
                        </span>
                      </div>

                      {/* Standalone confirmation status only for admin (read-only).
                          For designer/technician the interactive confirm widget is
                          rendered once inside CaseWorkflowControls below — avoid
                          showing it twice on the same card at the same time. */}
                      {c.shade && actor === "admin" && (
                        <div className="mt-3">
                          <CaseShadeConfirm
                            shade={c.shade}
                            caseId={c.id}
                            actor={actor}
                            doctorConfirmed={c.shade_confirmed_doctor}
                            designerConfirmed={c.shade_confirmed_designer}
                            technicianConfirmed={c.shade_confirmed_technician}
                          />
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {c.tooth_number && <Info icon={<Hash className="size-3" />} label="السن" value={c.tooth_number} />}
                        {c.case_type && <Info icon={<ClipboardList className="size-3" />} label="النوع" value={c.case_type} />}
                        {c.patient_phone && <Info icon={<Phone className="size-3" />} label="الهاتف" value={c.patient_phone} />}
                      </div>

                      {c.notes && (
                        <div className="mt-3 text-xs bg-muted/40 rounded-lg p-2.5 whitespace-pre-wrap">
                          {c.notes}
                        </div>
                      )}



                      {(actor === "technician" || actor === "admin") && textRevisions[c.case_code] && (
                        <div className="mt-3 text-xs bg-amber-500/10 border border-amber-500/40 rounded-lg p-2.5">
                          <div className="font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                            <RefreshCw className="size-3.5" /> تعديل المصمم النصي
                          </div>
                          <div className="whitespace-pre-wrap text-foreground/90">{textRevisions[c.case_code]}</div>
                        </div>
                      )}

                      {actor === "technician" && (
                        <TechRevisionPanel
                          caseId={c.id}
                          caseCode={c.case_code}
                          textRevision={textRevisions[c.case_code]}
                          revisionFilePath={c.revision_design_file_path}
                          revisionFileName={c.revision_design_file_name}
                          execNotes={c.tech_exec_notes}
                          hasRevision={!!(c.revision_design_file_path || c.revision_design_done || textRevisions[c.case_code])}
                        />
                      )}


                      {c.scan_path && (
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            onClick={() => downloadCloudFile(c.scan_path, c.scan_name || `${c.case_code}-scan`, c.scan_mime, locFor(c, "downloaded"))}
                            className="inline-flex items-center gap-2 text-xs bg-gold/10 border border-gold/30 rounded-lg px-3 py-1.5 hover:gradient-gold hover:text-gold-foreground transition cursor-pointer"
                            title="انقر لتنزيل ملف المسح من السحابة"
                          >
                            <ScanLine className="size-3.5 text-gold" />
                            <span className="font-bold">المسح ثلاثي الأبعاد:</span>
                            <span className="truncate max-w-[200px] underline underline-offset-2">{c.scan_name}</span>
                            {c.scan_size && <span className="text-muted-foreground">({(c.scan_size/1024/1024).toFixed(1)} MB)</span>}
                            <Download className="size-3.5" />
                          </button>
                          {(c.revision_design_file_path) && (actor === "technician" || actor === "admin") && (
                            <button
                              type="button"
                              onClick={() => downloadCloudFile(c.revision_design_file_path, c.revision_design_file_name || `${c.case_code}-معدّل.rar`, "application/vnd.rar", locFor(c, "downloaded"))}
                              className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-1.5 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                              title="تنزيل ملف التصميم المعدّل (آخر تحديث) من السحابة"
                            >
                              <RefreshCw className="size-3.5 text-amber-600" />
                              <span className="font-bold">ملف التصميم المعدّل (آخر تحديث):</span>
                              <span className="truncate max-w-[180px] underline underline-offset-2">{c.revision_design_file_name || "تعديل.rar"}</span>
                              <Download className="size-3.5" />
                            </button>
                          )}
                          {c.scan_mime?.startsWith("image/") && (
                            <div className="rounded-xl overflow-hidden border border-gold/30 bg-muted/30 max-w-md">
                              <img src={c.scan_path} alt={c.scan_name || "3D scan"} loading="lazy"
                                className="w-full max-h-80 object-contain bg-black/5" />
                            </div>
                          )}
                        </div>
                      )}

                      {c.extra_zip_path && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => downloadCloudFile(c.extra_zip_path, c.extra_zip_name || `${c.case_code}-extra.zip`, c.extra_zip_mime || "application/zip", locFor(c, "downloaded"))}
                            className="inline-flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-1.5 hover:bg-amber-500 hover:text-white transition cursor-pointer"
                            title="ملف ZIP إضافي مرفق من الطبيب"
                          >
                            <FileArchive className="size-3.5 text-amber-600" />
                            <span className="font-bold">ملف ZIP إضافي:</span>
                            <span className="truncate max-w-[200px] underline underline-offset-2">{c.extra_zip_name || "ملف.zip"}</span>
                            {c.extra_zip_size ? <span className="text-muted-foreground">({(c.extra_zip_size/1024/1024).toFixed(1)} MB)</span> : null}
                            <Download className="size-3.5" />
                          </button>
                        </div>
                      )}

                      {Array.isArray(c.notes_images) && c.notes_images.length > 0 && (
                        <div className="mt-3 rounded-xl border border-gold/30 bg-muted/20 p-2.5">
                          <div className="text-[11px] font-bold text-gold mb-2 flex items-center gap-1.5">
                            <ScanLine className="size-3.5" /> صور مرفقة من الطبيب (تحت المسح ثلاثي الأبعاد)
                          </div>
                          <div className="space-y-3">
                            {c.notes_images.map((img, idx) => (
                              <DoctorImageComment
                                key={img.url}
                                caseId={c.id}
                                caseCode={c.case_code}
                                doctorSlot={c.doctor_slot}
                                patientName={c.patient_name}
                                image={img}
                                comments={(c.notes_image_comments ?? []).filter(k => k.image_url === img.url)}
                                canComment={actor === "designer" || actor === "technician"}
                                actor={actor as RoleKey}
                                actorName={actorName ?? ROLE_LABEL[actor as RoleKey]}
                                onOpen={() => setLightbox({ images: c.notes_images as { url: string; name: string }[], index: idx })}
                                onAdded={refreshCases}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>


                    <div className="flex flex-col gap-2 shrink-0">
                      {actor !== "admin" && (
                        <CaseChatButton
                          doctorSlot={c.doctor_slot}
                          doctorName={doctor?.name ?? `Slot ${c.doctor_slot}`}
                          me={actor as RoleKey}
                          myName={actorName ?? ROLE_LABEL[actor]}
                          caseCode={c.case_code}
                          caseLabel={c.patient_name}
                        />
                      )}
                      {actor === "admin" && view === "archive" && (
                        <div className="flex flex-col gap-1.5 min-w-[200px]">
                          <button
                            onClick={() => sendToTelegram(c)}
                            disabled={busy}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold shadow-gold hover:opacity-90 transition disabled:opacity-60"
                            title="إرسال بيانات الحالة وملفاتها ومحادثاتها إلى جروب تلجرام"
                          >
                            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} إرسال إلى تلجرام
                          </button>
                          {tgProgress?.id === c.id && (
                            <div className="rounded-lg border border-gold/40 bg-card p-2 shadow-luxury">
                              <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                                <span className={tgProgress.error ? "text-destructive" : "text-foreground"}>
                                  {tgProgress.label}
                                </span>
                                <span className="text-gold">{tgProgress.pct}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    tgProgress.error ? "bg-destructive" : "gradient-gold"
                                  }`}
                                  style={{ width: `${tgProgress.pct}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {view === "active" && actor === "technician" ? (
                        <button
                          onClick={() => downloadDesignRar(c)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition disabled:opacity-60"
                          title="تنزيل ملف التصميم المرسل من المصمم بصيغة RAR"
                        >
                          <FileArchive className="size-3.5 text-gold" /> تنزيل RAR
                        </button>
                      ) : view === "active" && c.scan_path && (
                        downloadedZips[c.id] ? (
                          <button
                            onClick={() => openSavedZip(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gold bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-60"
                            title="فتح ملف ZIP المحفوظ من مدير ملفات الجهاز"
                          >
                            <FolderOpen className="size-3.5" /> فتح ZIP
                          </button>
                        ) : (
                          <button
                            onClick={() => downloadScanZip(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition disabled:opacity-60"
                            title="تنزيل ملف الحالة بصيغة ZIP"
                          >
                            <FileArchive className="size-3.5 text-gold" /> تنزيل ZIP
                          </button>
                        )
                      )}
                      {/* In-app ZIP preview — available to designer + admin before final archive */}
                      {(actor === "designer" || actor === "admin") && view === "active" && c.scan_path && !c.final_archived && (
                        <button
                          onClick={() => setZipPreview({ url: c.scan_path!, name: c.scan_name })}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-60"
                          title="عرض محتوى ملف ZIP داخل التطبيق"
                        >
                          <Eye className="size-3.5" /> عرض ZIP
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            disabled={busy}
                            className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 hover:border-gold transition disabled:opacity-60"
                            aria-label="إجراءات الحالة"
                          >
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          <DropdownMenuItem onClick={() => downloadPdf(c)}>
                            <FileText className="size-4 ml-2" /> تنزيل PDF
                          </DropdownMenuItem>
                          {c.scan_path && (
                            <DropdownMenuItem onClick={() => downloadScan(c)}>
                              <Download className="size-4 ml-2" /> تنزيل المسح
                            </DropdownMenuItem>
                          )}
                          {/* Share: technician + admin can share archived; everyone can share active */}
                          {(view === "active" || actor === "technician" || actor === "admin") && (
                            <DropdownMenuItem onClick={() => shareExternal(c)}>
                              <Share2 className="size-4 ml-2" /> مشاركة
                            </DropdownMenuItem>
                          )}
                          {/* Admin-only: pin/unpin + delete on archived cases */}
                          {view === "archive" && actor === "admin" && (
                            <>
                              <DropdownMenuItem onClick={() => togglePin(c)}>
                                {c.pinned
                                  ? <><PinOff className="size-4 ml-2" /> إلغاء التثبيت</>
                                  : <><Pin className="size-4 ml-2" /> تثبيت</>}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => deleteCase(c)} className="text-destructive focus:text-destructive">
                                <Trash2 className="size-4 ml-2" /> حذف نهائي
                              </DropdownMenuItem>
                            </>
                          )}
                          {/* Manual archive only in active view, for non-admin operators */}
                          {view === "active" && actor !== "admin" && (
                            <DropdownMenuItem onClick={() => archiveCase(c)}>
                              <Archive className="size-4 ml-2" /> أرشفة
                            </DropdownMenuItem>
                          )}
                          {/* حذف الحالة: مقصور على الإدارة فقط */}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Workflow controls: only in active view and for the operator actors */}
                  {view === "active" && actor !== "admin" && (() => {
                    let target: RoleKey | undefined = undefined;
                    if (actor === "designer") target = "technician";
                    else if (actor === "technician")
                      target = technicianTarget ?? (doctor?.branch === "ibb" ? "secretary_ibb" : "secretary_sanaa");
                    return (
                      <CaseWorkflowControls
                        c={c}
                        actor={actor as Exclude<typeof actor, "admin">}
                        actorName={actorName ?? ROLE_LABEL[actor]}
                        doctorName={doctor?.name ?? `Slot ${c.doctor_slot}`}
                        target={target}
                        blockedByPending={pendingCaseCode && pendingCaseCode !== c.case_code ? pendingCaseCode : null}
                      />
                    );
                  })()}

                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ZipViewerDialog
        open={!!zipPreview}
        url={zipPreview?.url ?? null}
        fileName={zipPreview?.name ?? null}
        onOpenChange={(v) => { if (!v) setZipPreview(null); }}
      />

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndexChange={(i) => setLightbox((lb) => (lb ? { ...lb, index: i } : lb))}
        />
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2 py-1.5">
      <span className="text-gold">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-bold truncate">{value}</span>
    </div>
  );
}

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 0;color:#777;width:130px;font-weight:600;">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

/** A doctor-attached image shown in the designer/technician case card, with an
 *  inline comment thread. Designer/technician replies are saved on the case and
 *  posted to the case chat so they reach the doctor as a comment on the image. */
function DoctorImageComment({
  caseId, caseCode, doctorSlot, patientName, image, comments, canComment,
  actor, actorName, onOpen, onAdded,
}: {
  caseId: string;
  caseCode: string;
  doctorSlot: number;
  patientName: string;
  image: { url: string; name: string };
  comments: NoteImageComment[];
  canComment: boolean;
  actor: RoleKey;
  actorName: string;
  onOpen: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<number | null>(null);

  // Auto-grow the textarea so the whole comment stays visible while typing.
  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }
  useEffect(() => { autoGrow(taRef.current); }, [text]);

  async function submit() {
    if (!text.trim()) { toast.error("اكتب تعليقك أولاً"); return; }
    setBusy(true);
    try {
      const entry: NoteImageComment = {
        image_url: image.url,
        author_role: actor,
        author_name: actorName,
        comment: text.trim(),
        created_at: new Date().toISOString(),
      };
      await addImageComment(caseId, entry);
      await postImageCommentToChat({
        doctorSlot, caseCode, patientName,
        authorRole: actor, authorName: actorName,
        imageName: image.name, comment: text.trim(),
      });
      setText("");
      toast.success("تم إرسال تعليقك للطبيب");
      await onAdded();
    } catch {
      toast.error("تعذر إرسال التعليق");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error("التسجيل غير مدعوم في هذا المتصفح"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const secs = recSec;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1024) { toast.error("التسجيل قصير جداً"); return; }
        setSendingVoice(true);
        try {
          await postImageVoiceToChat({
            doctorSlot, caseCode, patientName,
            authorRole: actor, authorName: actorName,
            imageName: image.name, blob, durationSec: secs,
          });
          toast.success("تم إرسال المقطع الصوتي للطبيب");
          await onAdded();
        } catch {
          toast.error("تعذر إرسال المقطع الصوتي");
        } finally {
          setSendingVoice(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true); setRecSec(0);
      recTimerRef.current = window.setInterval(() => setRecSec(s => s + 1), 1000);
    } catch { toast.error("تعذر الوصول للميكروفون"); }
  }

  function stopRecording(cancel = false) {
    const mr = recorderRef.current;
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    setRecording(false);
    if (!mr) return;
    if (cancel) {
      mr.ondataavailable = null as any;
      mr.onstop = () => mr.stream?.getTracks().forEach(t => t.stop());
    }
    try { mr.stop(); } catch {}
    recorderRef.current = null;
  }


  return (
    <div className="flex gap-2.5">
      <button type="button" onClick={onOpen}
        className="shrink-0 rounded-lg overflow-hidden border border-border hover:border-gold transition"
        title="انقر للتكبير">
        <img src={image.url} alt={image.name} loading="lazy" className="h-20 w-20 object-cover" />
      </button>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="truncate text-[10px] font-bold text-muted-foreground">{image.name}</div>
        {comments.map((k, ki) => (
          <div key={ki} className="rounded-lg bg-card border border-border/60 px-2 py-1">
            <div className="text-[10px] font-bold text-gold">
              {k.author_name || ROLE_LABEL[k.author_role as RoleKey] || k.author_role}
            </div>
            <div className="text-[11px] whitespace-pre-wrap text-foreground/90">{k.comment}</div>
          </div>
        ))}
        {canComment && (
          <div className="space-y-1.5">
            <textarea
              ref={taRef}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              placeholder="اكتب تعليقك للطبيب على هذه الصورة…"
              className="w-full min-h-[72px] resize-y overflow-y-auto rounded-lg border border-input bg-background px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:border-gold"
            />
            <div className="flex items-center gap-1.5">
              {!recording ? (
                <button type="button" onClick={startRecording} disabled={sendingVoice || busy}
                  title="تسجيل مقطع صوتي"
                  className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-[11px] font-bold hover:border-gold disabled:opacity-50">
                  {sendingVoice ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5 text-rose-500" />}
                  {sendingVoice ? "جارٍ الإرسال…" : "تسجيل صوتي"}
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 text-rose-600 px-2 py-1.5 text-[11px] font-bold">
                    <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                    {String(Math.floor(recSec / 60)).padStart(2, "0")}:{String(recSec % 60).padStart(2, "0")}
                  </span>
                  <button type="button" onClick={() => stopRecording(false)}
                    title="إيقاف وإرسال"
                    className="inline-flex items-center gap-1 rounded-lg gradient-gold text-gold-foreground px-2.5 py-1.5 text-[11px] font-bold shadow-gold">
                    <Square className="size-3.5" /> إرسال
                  </button>
                  <button type="button" onClick={() => stopRecording(true)}
                    title="إلغاء التسجيل"
                    className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5 text-[11px] font-bold hover:border-rose-400">
                    <TrashIcon className="size-3.5" />
                  </button>
                </div>
              )}
              <button type="button" onClick={submit} disabled={busy || recording}
                className="ms-auto inline-flex items-center gap-1 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-[11px] font-bold shadow-gold disabled:opacity-50">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquare className="size-3.5" />} تعليق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

