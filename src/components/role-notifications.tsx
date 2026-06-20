import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, BellOff, Phone, CheckCircle2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { getStage, deriveStageKey, systemMoment } from "@/lib/case-stages";
import {
  ensureNotifyPermission,
  incomingAlert,
  systemMomentAlert,
  notificationPermissionState,
  stopRing,
  unlockNotificationAudio,
} from "@/lib/notify";
import { enablePushForRole } from "@/lib/push";

/**
 * Professional, interactive notification center for a role portal.
 *
 * - Listens (Realtime) for any new chat message addressed to this role
 *   (which is how every case/data handoff in the app is delivered).
 * - On a real incoming item it fires a 5-second landline phone ring, a
 *   device notification-shade alert, and an in-app toast, and bumps a badge.
 * - A floating bell shows the unread count; tapping it enables permission
 *   (first time), unlocks audio, silences the ring, and clears the badge.
 *
 * `slot` restricts conversations to a single doctor (used on the doctor
 * portal); leave it undefined for staff portals (all of that role's chats).
 */
export function RoleNotifications({
  role,
  slot,
}: {
  role: RoleKey;
  slot?: number | null;
}) {
  const [count, setCount] = useState(0);
  const [sysCount, setSysCount] = useState(0);
  const [ringing, setRinging] = useState(false);
  const [perm, setPerm] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [showPrompt, setShowPrompt] = useState(false);
  const myConvIds = useRef<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const seenMoments = useRef<Set<string>>(new Set());

  useEffect(() => {
    setPerm(notificationPermissionState());
    setShowPrompt(notificationPermissionState() === "default");
    // If permission was already granted before, (re)register this device for
    // Web Push so closed-app notifications keep working.
    if (notificationPermissionState() === "granted") {
      void enablePushForRole(role, slot);
    }
  }, [role, slot]);

  useEffect(() => {
    let active = true;

    async function refreshConvs() {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id,doctor_slot,participants");
      if (!active) return;
      const mine = ((data ?? []) as any[]).filter(
        (c) =>
          Array.isArray(c.participants) &&
          c.participants.includes(role) &&
          (slot == null || c.doctor_slot === slot),
      );
      myConvIds.current = new Set(mine.map((c) => c.id as string));
    }

    // Chat-message alert: insistent landline ring + phone icon (gold).
    function fireAlert(senderRole: string, content: string) {
      const sender = ROLE_LABEL[senderRole as RoleKey] ?? senderRole;
      const snippet = (content || "بيانات جديدة").replace(/\s+/g, " ").slice(0, 90);
      const title = "📩 بيانات جديدة واردة";
      const body = `${sender}: ${snippet}`;
      incomingAlert({ title, body });
      setRinging(true);
      window.setTimeout(() => setRinging(false), 5000);
      setCount((c) => c + 1);
      toast(title, {
        description: body,
        icon: <Phone className="size-4 text-gold" />,
        duration: 6000,
      });
    }

    // SYSTEM moment alert: distinct chime + green/violet status icon — clearly
    // separated from chat-message alerts (no landline ring).
    function fireSystemMoment(
      kind: "ready" | "completed",
      caseCode: string,
      momentLabel: string,
    ) {
      const title = kind === "completed"
        ? `✅ اكتملت الحالة — ${caseCode}`
        : `🟢 تحديث حالة — ${caseCode}`;
      const body = momentLabel;
      systemMomentAlert({ title, body });
      setSysCount((c) => c + 1);
      toast(title, {
        description: body,
        icon: kind === "completed"
          ? <PartyPopper className="size-4 text-emerald-500" />
          : <CheckCircle2 className="size-4 text-emerald-500" />,
        duration: 6000,
        className: "border-emerald-500/40",
      });
    }

    void refreshConvs();

    const ch = supabase
      .channel(`role-notify-${role}-${slot ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (p: any) => {
          const m = p.new;
          if (!m || m.sender === role) return;
          if (seen.current.has(m.id)) return;
          if (!myConvIds.current.has(m.conversation_id)) return;
          seen.current.add(m.id);
          fireAlert(m.sender, m.content);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        () => void refreshConvs(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "slot_cases" },
        (p: any) => {
          const nu = p.new;
          const old = p.old ?? {};
          if (!nu) return;
          // Doctor portal: only this doctor's cases.
          if (slot != null && nu.doctor_slot !== slot) return;
          try {
            const oldKey = deriveStageKey(old);
            const newKey = deriveStageKey(nu);
            if (oldKey === newKey) return;
            const moment = systemMoment(newKey);
            if (!moment) return;
            const dedupe = `${nu.id ?? nu.case_code}:${newKey}`;
            if (seenMoments.current.has(dedupe)) return;
            seenMoments.current.add(dedupe);
            fireSystemMoment(moment.kind, nu.case_code ?? "—", `${moment.label} • ${getStage(newKey).label}`);
          } catch { /* noop */ }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [role, slot]);

  async function enable() {
    unlockNotificationAudio();
    const ok = await ensureNotifyPermission();
    setPerm(ok ? "granted" : notificationPermissionState());
    setShowPrompt(false);
    if (ok) {
      const pushed = await enablePushForRole(role, slot);
      toast.success(
        pushed
          ? "تم تفعيل الإشعارات الصوتية حتى عند إغلاق التطبيق"
          : "تم تفعيل الإشعارات الصوتية والمرئية لهذه الصفحة",
      );
    }
  }

  function onBellClick() {
    stopRing();
    setRinging(false);
    setCount(0);
    setSysCount(0);
    if (perm !== "granted") void enable();
  }

  const totalCount = count + sysCount;


  return (
    <>
      {/* First-run enable banner */}
      {showPrompt && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/10 p-4 shadow-luxury">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold shrink-0">
              <BellRing className="size-5 text-gold-foreground" />
            </div>
            <div className="text-sm">
              <div className="font-bold">فعّل إشعارات الوصول</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                نغمة تنبيه (رنة هاتف) ٥ ثوانٍ + إشعار يظهر في شاشة الجهاز عند ورود بيانات جديدة لصفحتك.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={enable}
              className="rounded-lg gradient-gold text-gold-foreground px-4 py-2 text-xs font-bold shadow-gold hover:opacity-90 transition"
            >
              تفعيل الإشعارات
            </button>
            <button
              onClick={() => setShowPrompt(false)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition"
            >
              لاحقاً
            </button>
          </div>
        </div>
      )}

      {/* Floating bell badge */}
      <button
        onClick={onBellClick}
        title={
          perm === "granted"
            ? "الإشعارات مفعّلة — اضغط لإيقاف الرنة ومسح العداد"
            : "اضغط لتفعيل الإشعارات الصوتية والمرئية"
        }
        className={`fixed bottom-5 left-5 z-50 inline-flex size-14 items-center justify-center rounded-full shadow-luxury transition ${
          ringing
            ? "gradient-gold text-gold-foreground animate-bounce shadow-gold"
            : "bg-card border border-border hover:border-gold"
        }`}
      >
        {perm === "denied" ? (
          <BellOff className="size-6 text-destructive" />
        ) : ringing ? (
          <BellRing className="size-6" />
        ) : (
          <Bell className="size-6 text-gold" />
        )}
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-extrabold text-destructive-foreground shadow">
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
        {sysCount > 0 && (
          <span className="absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow" title="تحديثات حالة (Ready / Completed)">
            <CheckCircle2 className="size-3" />
          </span>
        )}
      </button>
    </>
  );
}
