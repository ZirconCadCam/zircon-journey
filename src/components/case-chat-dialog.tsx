import { useEffect, useRef, useState } from "react";
import { MessageSquare, X, FileArchive, FileCode, Download, Loader2, User, Phone, Hash, Palette } from "lucide-react";
import { ChatModule } from "@/components/chat-module";
import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { Z } from "@/lib/z-index";
import { supabase } from "@/integrations/supabase/client";
import { autoCacheFile, saveToCenter } from "@/lib/file-manager";
import { isNativeApp, openNativeUri } from "@/lib/native-fs";
import { InAppFileViewer } from "@/components/in-app-file-viewer";
import { incomingAlert, stopRing } from "@/lib/notify";
import { toast } from "sonner";

/**
 * Per-case chat trigger. Opens a modal hosting the standard ChatModule
 * scoped to a single case (filtered by title prefix `[case_code]`).
 *
 * The trigger also surfaces an unread badge counting messages addressed to
 * `me` inside conversations belonging to this case.
 */
export function CaseChatButton(props: {
  doctorSlot: number;
  doctorName: string;
  me: RoleKey;
  myName: string;
  caseCode: string;
  caseLabel: string;
  className?: string;
}) {
  const { doctorSlot, doctorName, me, myName, caseCode, caseLabel, className } = props;
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [ringing, setRinging] = useState(false);
  const myConvIds = useRef<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    let cancelled = false;
    const prefix = `[${caseCode}]`;
    const refresh = async () => {
      const { data: convs } = await supabase
        .from("chat_conversations").select("id,participants,title")
        .eq("doctor_slot", doctorSlot);
      const mine = ((convs ?? []) as any[]).filter(c =>
        Array.isArray(c.participants) && c.participants.includes(me)
        && typeof c.title === "string" && c.title.startsWith(prefix)
      );
      myConvIds.current = new Set(mine.map(c => c.id as string));
      if (mine.length === 0) { if (!cancelled) setUnread(0); return; }
      const ids = mine.map(c => c.id);
      const { count } = await supabase.from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .neq("sender", me)
        .not("read_by", "cs", `{${me}}`);
      if (!cancelled) setUnread(count ?? 0);
    };
    refresh();
    const ch = supabase.channel(`case-chat-${doctorSlot}-${caseCode}-${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        const m = payload.new;
        if (!m || m.sender === me) return;
        if (seen.current.has(m.id)) return;
        if (!myConvIds.current.has(m.conversation_id)) return;
        seen.current.add(m.id);
        refresh();
        // Fire the full alert (ring + device notification + toast) only when
        // the chat dialog is closed — an open dialog is already being read.
        if (!openRef.current) {
          const sender = ROLE_LABEL[m.sender as RoleKey] ?? m.sender;
          const snippet = (m.content || "بيانات جديدة").replace(/\s+/g, " ").slice(0, 90);
          const title = `📩 رسالة جديدة — ${caseLabel}`;
          const body = `${sender}: ${snippet}`;
          incomingAlert({ title, body });
          setRinging(true);
          window.setTimeout(() => setRinging(false), 5000);
          toast(title, {
            description: body,
            icon: <Phone className="size-4 text-gold" />,
            duration: 6000,
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `doctor_slot=eq.${doctorSlot}` }, refresh)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [doctorSlot, caseCode, caseLabel, me]);

  function openChat() {
    stopRing();
    setRinging(false);
    setOpen(true);
  }

  return (
    <>
      <button onClick={openChat}
        className={className ?? `relative inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${ringing ? "border-gold gradient-gold text-gold-foreground animate-pulse shadow-gold" : "border-border bg-card hover:border-gold"}`}>
        <MessageSquare className={`size-3.5 ${ringing ? "" : "text-gold"}`} />
        محادثة الحالة
        {unread > 0 && (
          <span className="absolute -top-1.5 -end-1.5 rounded-full gradient-gold text-gold-foreground text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] grid place-items-center shadow-gold">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className={`fixed inset-0 ${Z.overlay} grid place-items-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm`} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-background border border-border shadow-luxury">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-border bg-background/95 backdrop-blur">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground font-mono">{caseCode}</div>
                <div className="font-bold text-sm truncate">محادثة الحالة — {caseLabel}</div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg border border-border p-2 hover:border-gold">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <CaseHeaderPanel doctorSlot={doctorSlot} doctorName={doctorName} caseCode={caseCode} />
              <ChatModule
                doctorSlot={doctorSlot}
                doctorName={doctorName}
                me={me}
                myName={myName}
                caseCode={caseCode}
                caseLabel={caseLabel}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Case header: patient data + all sent files (zip/rar) ---------- */

interface CaseAttachment {
  url: string;
  name: string;
  source: "doctor-zip" | "designer-rar" | "designer-revision-rar" | "designer-html" | "chat";
  created_at?: string | null;
}

type DlPhase = "download" | "save" | "done";
interface DlState {
  pct: number;
  loaded: number;
  total: number;
  phase: DlPhase;
}

function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

/** Best-effort MIME type from a filename, used when opening with device apps. */
function mimeForName(name: string): string {
  const n = name.toLowerCase();
  if (/\.html?$/.test(n)) return "text/html";
  if (/\.pdf$/.test(n)) return "application/pdf";
  if (/\.rar$/.test(n)) return "application/vnd.rar";
  if (/\.zip$/.test(n)) return "application/zip";
  if (/\.png$/.test(n)) return "image/png";
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (/\.webp$/.test(n)) return "image/webp";
  return "application/octet-stream";
}

function phaseLabel(p: DlPhase): string {
  switch (p) {
    case "download": return "جارٍ التنزيل…";
    case "save": return "جارٍ الحفظ…";
    case "done": return "اكتمل التنزيل";
  }
}

function CaseHeaderPanel({ doctorSlot, doctorName, caseCode }: {
  doctorSlot: number; doctorName: string; caseCode: string;
}) {
  const [c, setC] = useState<any>(null);
  const [files, setFiles] = useState<CaseAttachment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, DlState>>({});
  const [viewer, setViewer] = useState<CaseAttachment | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: row } = await supabase.from("slot_cases").select(
        "id, case_code, patient_name, patient_phone, patient_age, patient_gender, tooth_number, shade, case_type, notes, scan_path, scan_name, revision_design_file_path, revision_design_file_name, design_html_sent, design_html_path, design_html_name, doctor_decision, final_archived, created_at"
      ).eq("doctor_slot", doctorSlot).eq("case_code", caseCode).maybeSingle();
      if (cancelled) return;
      setC(row);

      const list: CaseAttachment[] = [];
      if (row?.scan_path) list.push({
        url: row.scan_path, name: row.scan_name || `${caseCode}.zip`,
        source: "doctor-zip", created_at: row.created_at,
      });
      if (row?.revision_design_file_path) list.push({
        url: row.revision_design_file_path,
        name: row.revision_design_file_name || `${caseCode}-revision.rar`,
        source: "designer-revision-rar",
      });
      if (row?.design_html_sent && row?.design_html_path) list.push({
        url: row.design_html_path,
        name: row.design_html_name || `${caseCode}.html`,
        source: "designer-html",
      });

      // Pull any .rar/.zip attachments referencing this case from chat messages.
      const { data: convs } = await supabase.from("chat_conversations")
        .select("id").eq("doctor_slot", doctorSlot);
      const ids = ((convs ?? []) as any[]).map(x => x.id);
      if (ids.length) {
        const { data: msgs } = await supabase.from("chat_messages")
          .select("attachment_path, attachment_name, content, created_at, sender, message_type")
          .in("conversation_id", ids).eq("message_type", "file")
          .order("created_at", { ascending: false }).limit(200);
        for (const m of (msgs ?? []) as any[]) {
          const nm = m.attachment_name || "";
          if (!/\.(rar|zip)$/i.test(nm)) continue;
          if (!(m.content || "").includes(caseCode)) continue;
          if (list.some(x => x.url === m.attachment_path)) continue;
          list.push({
            url: m.attachment_path, name: nm,
            source: m.sender === "designer" ? "designer-rar" : "chat",
            created_at: m.created_at,
          });
        }
      }
      if (!cancelled) setFiles(list);

      // Task 3: auto-store received files into the device center folder, but
      // only for active cases and revision-notes cases (not finally archived).
      // Silent: runs only when the device folder is linked + permitted.
      const isActiveOrRevision = !row?.final_archived;
      if (isActiveOrRevision && list.length) {
        for (const f of list) {
          try { await autoCacheFile(f.url, f.name, caseCode); } catch { /* silent */ }
          if (cancelled) break;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [doctorSlot, caseCode]);

  async function downloadOne(att: CaseAttachment) {
    setBusy(att.url);
    setProgress(p => ({ ...p, [att.url]: { pct: 0, loaded: 0, total: 0, phase: "download" } }));
    try {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const total = Number(res.headers.get("content-length")) || 0;
      let blob: Blob;
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            setProgress(p => ({
              ...p,
              [att.url]: {
                pct: total > 0 ? Math.round((received / total) * 100) : 0,
                loaded: received,
                total,
                phase: "download",
              },
            }));
          }
        }
        blob = new Blob(chunks);
      } else {
        blob = await res.blob();
      }
      setProgress(p => ({ ...p, [att.url]: { pct: 100, loaded: blob.size, total: blob.size, phase: "save" } }));
      const r = await saveToCenter(blob, att.name, caseCode);
      setProgress(p => ({ ...p, [att.url]: { pct: 100, loaded: blob.size, total: blob.size, phase: "done" } }));
      toast.success(r.fallback ? "تم تنزيل الملف" : `تم الحفظ في ${r.path}`);
      // Right after the download completes, open the file: on the native app
      // this shows the device's app chooser (open & view inside «رحلة الزركون»);
      // on the web it opens the in-app viewer.
      const mime = mimeForName(att.name);
      if ((await isNativeApp()) && r.uri) {
        const opened = await openNativeUri(r.uri, mime);
        if (!opened) setViewer(att);
      } else {
        setViewer(att);
      }
    } catch (e: any) {
      toast.error(e?.message || "تعذر تنزيل الملف");
    } finally {
      setBusy(null);
      setTimeout(() => setProgress(p => {
        const n = { ...p }; delete n[att.url]; return n;
      }), 1600);
    }
  }

  if (!c) {
    return <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      جارٍ تحميل بيانات الحالة…
    </div>;
  }

  return (
    <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-card to-muted/30 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground font-mono">{c.case_code}</div>
          <div className="font-extrabold text-base">{c.patient_name}</div>
          <div className="text-[11px] text-muted-foreground">د/ {doctorName}</div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {new Date(c.created_at).toLocaleDateString("ar")}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        {c.patient_phone && <Info icon={<Phone className="size-3" />} label="الهاتف" value={c.patient_phone} />}
        {c.patient_age != null && <Info icon={<User className="size-3" />} label="العمر" value={String(c.patient_age)} />}
        {c.tooth_number && <Info icon={<Hash className="size-3" />} label="السن" value={c.tooth_number} />}
        {c.shade && <Info icon={<Palette className="size-3" />} label="اللون" value={c.shade} />}
      </div>
      {c.notes && (
        <div className="text-[11px] rounded-lg border border-border bg-background/60 p-2 whitespace-pre-wrap">
          {c.notes}
        </div>
      )}

      <div>
        <div className="text-[11px] font-bold mb-1.5 text-muted-foreground">
          ملفات الحالة (ZIP / RAR / HTML)
        </div>
        {files.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">لا توجد ملفات مرسلة بعد.</div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-background/60">
            {files.map(f => {
              const isRar = /\.rar$/i.test(f.name);
              const isHtml = /\.html?$/i.test(f.name);
              return (
                <li key={f.url} className="flex flex-col gap-1.5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => downloadOne(f)}
                      className="flex items-center gap-2 min-w-0 text-start hover:text-gold transition"
                      title="حفظ في مدير ملفات الجهاز ثم فتحه"
                    >
                      {isHtml
                        ? <FileCode className="size-4 shrink-0 text-sky-600" />
                        : <FileArchive className={`size-4 shrink-0 ${isRar ? "text-amber-700" : "text-gold"}`} />}
                      <span className="text-xs font-bold truncate">{f.name}</span>
                      <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 font-bold shrink-0">
                        {sourceLabel(f.source)}
                      </span>
                    </button>
                    <button onClick={() => downloadOne(f)} disabled={busy === f.url}
                      className="rounded-lg border border-border p-1.5 hover:border-gold transition disabled:opacity-60 shrink-0"
                      aria-label="تنزيل" title="تنزيل الملف">
                      {busy === f.url ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    </button>
                  </div>
                  {progress[f.url] != null && (() => {
                    const st = progress[f.url];
                    const indeterminate = st.phase === "download" && st.total <= 0;
                    const done = st.phase === "done";
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            {indeterminate ? (
                              <div className="h-full w-1/3 rounded-full gradient-gold animate-[indeterminate-slide_1.1s_ease-in-out_infinite]" />
                            ) : (
                              <div
                                className={`h-full rounded-full transition-all duration-200 ${done ? "bg-emerald-500" : "gradient-gold"}`}
                                style={{ width: `${st.pct}%` }}
                              />
                            )}
                          </div>
                          {!indeterminate && (
                            <span className="text-[10px] font-bold text-muted-foreground tabular-nums shrink-0">
                              {st.pct}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-bold ${done ? "text-emerald-600" : "text-gold"}`}>
                            {phaseLabel(st.phase)}
                          </span>
                          {st.loaded > 0 && (
                            <span className="text-muted-foreground tabular-nums">
                              {fmtBytes(st.loaded)}{st.total > 0 ? ` / ${fmtBytes(st.total)}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        )}
        <div className="text-[10px] text-muted-foreground mt-1">
          الملفات تُعرض داخل التطبيق مباشرةً، ويتم تخزينها مؤقتاً في مجلد <span className="font-bold">مركز زركون CAD/CAM</span> على جهازك ليتم فتحها لاحقاً بسرعة من ذاكرة الجهاز.
        </div>
      </div>
      <InAppFileViewer
        open={!!viewer}
        onOpenChange={(v) => { if (!v) setViewer(null); }}
        url={viewer?.url ?? null}
        name={viewer?.name ?? ""}
        subfolder={caseCode}
      />
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2 flex items-start gap-1.5">
      <span className="text-gold mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="font-bold truncate">{value}</div>
      </div>
    </div>
  );
}

function sourceLabel(s: CaseAttachment["source"]): string {
  switch (s) {
    case "doctor-zip": return "من الطبيب";
    case "designer-rar": return "من المصمم";
    case "designer-revision-rar": return "تعديل المصمم";
    case "designer-html": return "تصميم HTML";
    default: return "مرفق";
  }
}
