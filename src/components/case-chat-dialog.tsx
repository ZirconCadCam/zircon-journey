import { useEffect, useState } from "react";
import { MessageSquare, X, FileArchive, Download, Loader2, User, Phone, Hash, Palette } from "lucide-react";
import { ChatModule } from "@/components/chat-module";
import type { RoleKey } from "@/lib/chat";
import { Z } from "@/lib/z-index";
import { supabase } from "@/integrations/supabase/client";
import { downloadUrlToCenter } from "@/lib/file-manager";
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
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_conversations", filter: `doctor_slot=eq.${doctorSlot}` }, refresh)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [doctorSlot, caseCode, me, open]);

  return (
    <>
      <button onClick={() => setOpen(true)}
        className={className ?? "relative inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition"}>
        <MessageSquare className="size-3.5 text-gold" />
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
            <div className="p-4">
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
