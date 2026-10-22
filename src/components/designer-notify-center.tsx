import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, BellRing, X, Sparkles, RefreshCw, MessageSquare, AlertTriangle,
  CheckCheck, Stethoscope, ChevronLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Z } from "@/lib/z-index";

/**
 * Designer notification center.
 *
 * A single professional bell icon that aggregates everything the DOCTOR did and
 * the designer still has to act on, split into four live groups:
 *
 *  1. حالات جديدة       → clears once the designer sends the .rar design file.
 *  2. طلبات تعديل        → clears once a revision file or revision text is sent.
 *  3. تحديثات/ملاحظات    → clears once the designer reads (marks seen) the case.
 *  4. رسائل محادثة الحالة → clears once the case chat messages are read.
 */

export interface NotifyCase {
  id: string;
  case_code: string;
  doctor_slot: number;
  patient_name: string;
  created_at: string;
  design_done?: boolean | null;
  design_file_sent?: boolean | null;
  doctor_decision?: string | null;
  revision_design_done?: boolean | null;
  revision_design_file_path?: string | null;
  archived?: boolean | null;
  final_archived?: boolean | null;
}

type GroupKey = "new" | "revision" | "updates" | "chat";

const GROUP_META: Record<GroupKey, { label: string; icon: typeof Bell; tone: string }> = {
  new:      { label: "حالات جديدة من الطبيب", icon: Sparkles,      tone: "gold" },
  revision: { label: "طلبات تعديل من الطبيب", icon: AlertTriangle, tone: "destructive" },
  updates:  { label: "تحديثات وملاحظات الطبيب", icon: RefreshCw,   tone: "emerald" },
  chat:     { label: "رسائل واردة (محادثة الحالة)", icon: MessageSquare, tone: "blue" },
};

function toneClasses(tone: string, on: boolean) {
  if (on) {
    if (tone === "destructive") return "bg-destructive text-destructive-foreground border-transparent";
    if (tone === "emerald") return "bg-emerald-500 text-white border-transparent";
    if (tone === "blue") return "bg-blue-600 text-white border-transparent";
    return "gradient-gold text-gold-foreground border-transparent shadow-gold";
  }
  return "border-border bg-background hover:border-gold";
}

export function DesignerNotifyCenter({
  cases,
  doctorName,
  unseenMap,
  textRevisions,
  onMarkSeen,
  onMarkAllSeen,
  onOpenCase,
}: {
  cases: NotifyCase[];
  doctorName: (slot: number) => string;
  /** caseId → "new" | "updated" (doctor-edit tracking owned by the parent). */
  unseenMap: Map<string, "new" | "updated">;
  /** case_code → designer's text revision (counts as answering a revision request). */
  textRevisions: Record<string, string>;
  onMarkSeen: (ids: string[]) => void;
  onMarkAllSeen: () => void;
  /** Focus a case in the list, optionally switching the stage filter tab. */
  onOpenCase: (caseId: string, tab: "new" | "revision" | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<GroupKey>("new");
  /** case_code → unread chat messages addressed to the designer. */
  const [chatUnread, setChatUnread] = useState<Record<string, number>>({});

  const active = useMemo(
    () => cases.filter(c => !c.archived && !c.final_archived),
    [cases],
  );

  /* ---- live chat unread, grouped by case code (conversation title "[CODE] …") ---- */
  const refreshChat = useCallback(async () => {
    const { data: convs } = await supabase
      .from("chat_conversations").select("id,title,participants");
    const mine = ((convs ?? []) as any[]).filter(cv =>
      Array.isArray(cv.participants) && cv.participants.includes("designer")
      && typeof cv.title === "string" && cv.title.startsWith("["),
    );
    if (mine.length === 0) { setChatUnread({}); return; }
    const codeByConv = new Map<string, string>();
    for (const cv of mine) {
      const m = /^\[([^\]]+)\]/.exec(cv.title as string);
      if (m) codeByConv.set(cv.id as string, m[1]);
    }
    const { data: msgs } = await supabase.from("chat_messages")
      .select("id,conversation_id")
      .in("conversation_id", Array.from(codeByConv.keys()))
      .neq("sender", "designer")
      .not("read_by", "cs", "{designer}");
    const counts: Record<string, number> = {};
    for (const m of ((msgs ?? []) as any[])) {
      const code = codeByConv.get(m.conversation_id);
      if (!code) continue;
      counts[code] = (counts[code] ?? 0) + 1;
    }
    setChatUnread(counts);
  }, []);

  useEffect(() => {
    void refreshChat();
    const ch = supabase.channel("designer-notify-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => void refreshChat())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations" }, () => void refreshChat())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refreshChat]);

  /* ------------------------------ groups ------------------------------ */
  const groups = useMemo(() => {
    const isAnswered = (c: NotifyCase) =>
      !!(c.revision_design_done || c.revision_design_file_path || (textRevisions[c.case_code] ?? "").trim());

    const newOnes = active.filter(c => !c.design_file_sent && !c.design_done);
    const revisions = active.filter(c => c.doctor_decision === "revision" && !isAnswered(c));
    const updates = active.filter(c => unseenMap.get(c.id) === "updated");
    const chats = active.filter(c => (chatUnread[c.case_code] ?? 0) > 0);
    return { new: newOnes, revision: revisions, updates, chat: chats };
  }, [active, unseenMap, textRevisions, chatUnread]);

  const counts: Record<GroupKey, number> = {
    new: groups.new.length,
    revision: groups.revision.length,
    updates: groups.updates.length,
    chat: groups.chat.length,
  };
  const total = counts.new + counts.revision + counts.updates + counts.chat;

  const list = groups[group] as NotifyCase[];

  function pick(c: NotifyCase) {
    const tab = group === "new" ? "new" : group === "revision" ? "revision" : "all";
    if (group === "updates") onMarkSeen([c.id]);
    setOpen(false);
    onOpenCase(c.id, tab);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="إشعارات تحديثات الأطباء"
        className={`relative inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
          total > 0
            ? "gradient-gold text-gold-foreground border-transparent shadow-gold animate-pulse"
            : "border-border bg-card hover:border-gold"
        }`}>
        {total > 0 ? <BellRing className="size-3.5" /> : <Bell className="size-3.5 text-gold" />}
        الإشعارات
        {total > 0 && (
          <span className="absolute -top-2 -end-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-extrabold text-destructive-foreground ring-2 ring-card">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className={`fixed inset-0 ${Z.overlay} grid place-items-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm`}
          onClick={() => setOpen(false)}>
          <div dir="rtl" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[88dvh] overflow-hidden flex flex-col rounded-2xl bg-card border border-border shadow-luxury">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
              <div className="flex items-center gap-2 font-extrabold">
                <span className="size-9 rounded-xl gradient-gold grid place-items-center shadow-gold">
                  <BellRing className="size-4 text-gold-foreground" />
                </span>
                مركز إشعارات المصمم
                <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 font-bold">{total}</span>
              </div>
              <div className="flex items-center gap-2">
                {counts.updates > 0 && (
                  <button onClick={onMarkAllSeen}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/20 transition">
                    <CheckCheck className="size-3" /> تحديد الملاحظات كمقروءة
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="size-8 grid place-items-center rounded-lg border border-border hover:border-gold transition">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
              {(Object.keys(GROUP_META) as GroupKey[]).map(k => {
                const meta = GROUP_META[k];
                const Icon = meta.icon;
                const on = group === k;
                return (
                  <button key={k} onClick={() => setGroup(k)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${toneClasses(meta.tone, on)}`}>
                    <Icon className="size-3.5" /> {meta.label}
                    <span className="opacity-85">({counts[k]})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {list.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground text-sm">
                  <Bell className="size-9 mx-auto mb-3 opacity-40" />
                  لا توجد إشعارات في هذه الفئة
                </div>
              ) : (
                <ul className="space-y-2">
                  {list.map(c => (
                    <li key={c.id}>
                      <button onClick={() => pick(c)}
                        className="w-full text-start rounded-xl border border-border bg-background p-3 hover:border-gold transition flex items-center gap-3">
                        <span className="size-9 rounded-xl bg-muted grid place-items-center shrink-0">
                          <Stethoscope className="size-4 text-gold" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] rounded-md bg-muted px-2 py-0.5 font-bold">{c.case_code}</span>
                            <span className="font-bold text-sm truncate">{c.patient_name}</span>
                            {group === "chat" && (
                              <span className="text-[10px] rounded-full bg-blue-600 text-white px-2 py-0.5 font-bold">
                                {chatUnread[c.case_code]} رسالة
                              </span>
                            )}
                          </span>
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {doctorName(c.doctor_slot)} • {new Date(c.created_at).toLocaleDateString("ar-EG")}
                          </span>
                        </span>
                        <ChevronLeft className="size-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
