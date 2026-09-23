import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, STATUS_LABELS, STATUS_PROGRESS, BRANCH_LABELS } from "@/hooks/use-auth";
import { DashboardShell, ProgressBar } from "@/components/dashboard-shell";
import { Upload, Send, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { signPrivateUrl, uploadPrivateFile } from "@/lib/secure-storage";

export const Route = createFileRoute("/cases/$id")({
  component: CaseDetail,
});

const STATUSES = ["new","designing","design_ready","milling","ready","delivered","archived"];

interface Msg { id: string; sender_id: string; content: string; created_at: string }
interface FileRow { id: string; file_name: string; file_path: string; file_kind: string; created_at: string }

function CaseDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { session, role, loading } = useAuth();
  const [c, setC] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [text, setText] = useState("");
  const [profiles, setProfiles] = useState<Record<string,string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!loading && !session) nav({ to: "/login" }); }, [loading, session, nav]);

  useEffect(() => {
    if (!session) return;
    loadAll();
    const ch = supabase.channel(`case-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_messages", filter: `case_id=eq.${id}` }, loadMsgs)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cases", filter: `id=eq.${id}` }, () => loadCase())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [session, id]);

  async function loadAll() { await Promise.all([loadCase(), loadMsgs(), loadFiles()]); }
  async function loadCase() {
    const { data } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();
    setC(data);
  }
  async function loadMsgs() {
    const { data } = await supabase.from("case_messages").select("*").eq("case_id", id).order("created_at");
    setMsgs((data as Msg[]) ?? []);
    const ids = Array.from(new Set((data ?? []).map(m => m.sender_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      const map: Record<string,string> = {};
      profs?.forEach(p => { map[p.id] = p.full_name || "—"; });
      setProfiles(map);
    }
  }
  async function loadFiles() {
    const { data } = await supabase.from("case_files").select("*").eq("case_id", id).order("created_at", { ascending: false });
    setFiles((data as FileRow[]) ?? []);
  }

  async function send() {
    if (!text.trim() || !session) return;
    const { error } = await supabase.from("case_messages").insert({ case_id: id, sender_id: session.user.id, content: text.trim() });
    if (error) toast.error(error.message); else setText("");
  }

  async function changeStatus(s: string) {
    const updates: any = { status: s };
    if (s === "designing" && session) updates.designer_id = session.user.id;
    if (s === "milling" && session) updates.technician_id = session.user.id;
    const { error } = await supabase.from("cases").update(updates).eq("id", id);
    if (error) toast.error(error.message); else toast.success("تم تحديث الحالة");
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !session) return;
    const path = `${id}/${Date.now()}-${f.name}`;
    // Private bucket: the browser cannot write directly, so upload via a
    // server-issued one-time ticket.
    const up = await uploadPrivateFile("case-files", path, f);
    if (!up.ok) { toast.error(up.error ?? "تعذر رفع الملف"); return; }
    const kind = /\.(stl|obj|ply)$/i.test(f.name) ? "scan" : "image";
    const { error } = await supabase.from("case_files").insert({
      case_id: id, uploader_id: session.user.id, file_name: f.name, file_path: path, file_type: f.type, file_kind: kind, size_bytes: f.size,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("تم رفع الملف");
      loadFiles();
      // Mirror the case file to the clinic's Telegram group.
      const { queueTelegram } = await import("@/lib/telegram-outbox");
      void queueTelegram(
        `📎 إرسال تلقائي — ملف حالة\n──────────────\n👤 المريض: ${c?.patient_name ?? ""}\n🔖 رقم الحالة: ${c?.case_code ?? ""}\n📁 الملف: ${f.name}`,
        [{ bucket: "case-files", path, filename: f.name }],
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function downloadFile(p: string, n: string) {
    const url = await signPrivateUrl("case-files", p, 60);
    if (!url) { toast.error("تعذر تحميل الملف"); return; }
    const a = document.createElement("a"); a.href = url; a.download = n; a.click();
  }

  if (loading || !c) return <div className="min-h-screen grid place-items-center">جارِ التحميل...</div>;

  return (
    <DashboardShell title={`الحالة ${c.case_code}`}>
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl bg-card border border-border p-6 shadow-luxury">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs text-muted-foreground">المريض</div>
                <div className="text-2xl font-extrabold">{c.patient_name}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {c.tooth_number && <>السن {c.tooth_number} • </>}
                  اللون {c.shade ?? "—"} • {BRANCH_LABELS[c.branch as "sanaa"|"ibb"]}
                </div>
              </div>
              <span className="text-sm font-bold rounded-full bg-secondary px-4 py-1.5">
                {STATUS_LABELS[c.status]}
              </span>
            </div>
            <div className="mt-5">
              <ProgressBar value={STATUS_PROGRESS[c.status] ?? 0} />
              <div className="text-xs text-muted-foreground mt-2">تقدّم رحلة السن: {STATUS_PROGRESS[c.status] ?? 0}%</div>
            </div>
            {c.notes && <p className="mt-5 text-sm bg-muted p-4 rounded-xl">{c.notes}</p>}
          </div>

          {/* Status changer */}
          {role && role !== "doctor" && (
            <div className="rounded-2xl bg-card border border-border p-5">
              <div className="text-sm font-bold mb-3">تحديث المرحلة</div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => changeStatus(s)}
                    className={`text-xs font-bold rounded-full px-3 py-1.5 border transition ${c.status===s?"gradient-gold border-gold":"bg-background border-border hover:border-gold"}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold">الملفات (STL / OBJ / صور)</div>
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-lg gradient-brown px-3 py-1.5 text-xs font-bold">
                <Upload className="size-3.5" /> رفع ملف
                <input ref={fileInput} type="file" className="hidden" onChange={uploadFile} />
              </label>
            </div>
            {files.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">لا توجد ملفات بعد.</div>
            ) : (
              <ul className="divide-y divide-border">
                {files.map(f => (
                  <li key={f.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-lg bg-muted grid place-items-center"><FileText className="size-4 text-gold" /></div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{f.file_name}</div>
                        <div className="text-[11px] text-muted-foreground">{f.file_kind}</div>
                      </div>
                    </div>
                    <button onClick={() => downloadFile(f.file_path, f.file_name)} className="rounded-lg border border-border p-2 hover:bg-muted">
                      <Download className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="rounded-2xl bg-card border border-border flex flex-col h-[600px]">
          <div className="p-4 border-b border-border font-bold text-sm">المحادثة الداخلية</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">لا توجد رسائل.</div>}
            {msgs.map(m => {
              const mine = m.sender_id === session?.user.id;
              return (
                <div key={m.id} className={`flex ${mine?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine?"gradient-brown":"bg-muted"}`}>
                    {!mine && <div className="text-[10px] font-bold opacity-70 mb-0.5">{profiles[m.sender_id] ?? "—"}</div>}
                    <div>{m.content}</div>
                    <div className="text-[10px] opacity-60 mt-1">{new Date(m.created_at).toLocaleTimeString("ar")}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-border flex gap-2">
            <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
              className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold"
              placeholder="اكتب رسالة..." />
            <button onClick={send} className="rounded-xl gradient-gold p-2.5 shadow-gold"><Send className="size-4" /></button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
