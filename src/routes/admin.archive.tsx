import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatModule } from "@/components/chat-module";
import { DoctorAvatar } from "@/components/doctor-avatar";
import {
  ROLE_COLOR, ROLE_LABEL, STAFF_PASSWORDS, summarizeParticipants,
  type ChatConversation, type RoleKey,
} from "@/lib/chat";
import {
  Sparkles, ArrowRight, Lock, Archive, Eye, UserPlus, Search,
  MessageSquare, Calendar, Filter,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/archive")({
  component: AdminArchivePage,
});

interface DoctorMini { slot: number; name: string; branch: string | null }

type Mode = "all" | "monitoring" | "joined";
type TimeRange = "all" | "today" | "week" | "month" | "quarter";

function AdminArchivePage() {
  const nav = useNavigate();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("zircon_admin_all") === "1" || localStorage.getItem("zircon_staff_admin") === "1") setAuthed(true);
  }, []);

  if (!authed) return <Gate onOk={() => { localStorage.setItem("zircon_staff_admin", "1"); setAuthed(true); }} />;
  return <Inner onLogout={() => { localStorage.removeItem("zircon_staff_admin"); nav({ to: "/" }); }} />;
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">أرشيف الإدارة</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zircon CAD CAM</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {right}
            <Link to="/staff/$role" params={{ role: "admin" }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition">
              لوحة الإدارة
            </Link>
            <Link to="/" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
              <ArrowRight className="size-4" /> الرجوع
            </Link>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function Gate({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === STAFF_PASSWORDS.admin) onOk();
    else setErr("كلمة المرور غير صحيحة");
  }
  return (
    <Shell>
      <main className="container mx-auto px-6 py-16 grid place-items-center">
        <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-card border border-border p-8 shadow-luxury">
          <div className="size-16 rounded-full gradient-gold grid place-items-center mx-auto shadow-gold">
            <Lock className="size-7 text-gold-foreground" />
          </div>
          <div className="text-center mt-4">
            <div className="text-xl font-bold">أرشيف الإدارة</div>
            <div className="text-xs text-muted-foreground mt-1">أدخل كلمة مرور الإدارة للدخول</div>
          </div>
          <input type="password" autoFocus value={pw} onChange={e=>{setPw(e.target.value); setErr("");}}
            placeholder="كلمة المرور" className="mt-6 w-full rounded-xl border border-input bg-background px-4 py-3 text-center font-mono text-lg outline-none focus:border-gold" />
          {err && <div className="text-xs text-destructive mt-2 text-center">{err}</div>}
          <button type="submit" className="mt-4 w-full rounded-xl gradient-brown py-3 font-bold shadow-luxury">دخول</button>
        </form>
      </main>
    </Shell>
  );
}

function withinRange(iso: string, range: TimeRange): boolean {
  if (range === "all") return true;
  const d = new Date(iso).getTime();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const limit = range === "today" ? day : range === "week" ? 7 * day : range === "month" ? 30 * day : 90 * day;
  return now - d <= limit;
}

function Inner({ onLogout }: { onLogout: () => void }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [doctors, setDoctors] = useState<Record<number, DoctorMini>>({});
  const [mode, setMode] = useState<Mode>("all");
  const [range, setRange] = useState<TimeRange>("all");
  const [participantFilter, setParticipantFilter] = useState<RoleKey | "all">("all");
  const [doctorFilter, setDoctorFilter] = useState<number | "all">("all");
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [openConv, setOpenConv] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: convs }, { data: docs }] = await Promise.all([
      supabase.from("chat_conversations").select("*").order("last_message_at", { ascending: false }),
      supabase.from("doctor_profiles").select("slot,name,branch").order("slot"),
    ]);
    setConversations(((convs ?? []) as ChatConversation[]));
    const map: Record<number, DoctorMini> = {};
    for (const d of (docs ?? []) as DoctorMini[]) map[d.slot] = d;
    setDoctors(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Live updates removed to save database usage — data loads on open.
  }, []);

  const filtered = useMemo(() => conversations.filter(c => {
    const adminIn = c.participants.includes("admin");
    if (mode === "monitoring" && adminIn) return false;
    if (mode === "joined" && !adminIn) return false;
    if (!withinRange(c.last_message_at, range)) return false;
    if (participantFilter !== "all" && !c.participants.includes(participantFilter)) return false;
    if (doctorFilter !== "all" && c.doctor_slot !== doctorFilter) return false;
    if (archivedOnly && !c.archived) return false;
    if (search) {
      const q = search.toLowerCase();
      const inText = (c.title ?? "").toLowerCase().includes(q)
        || summarizeParticipants(c.participants).toLowerCase().includes(q)
        || (doctors[c.doctor_slot]?.name ?? "").toLowerCase().includes(q);
      if (!inText) return false;
    }
    return true;
  }), [conversations, mode, range, participantFilter, doctorFilter, archivedOnly, search, doctors]);

  const counts = useMemo(() => ({
    all: conversations.length,
    monitoring: conversations.filter(c => !c.participants.includes("admin")).length,
    joined: conversations.filter(c => c.participants.includes("admin")).length,
  }), [conversations]);

  if (openConv) {
    const doctor = doctors[openConv.doctor_slot];
    return (
      <Shell right={<button onClick={onLogout} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition">خروج</button>}>
        <main className="container mx-auto px-4 sm:px-6 py-6 space-y-4">
          <button onClick={()=>{ setOpenConv(null); load(); }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold hover:border-gold">
            <ArrowRight className="size-4" /> رجوع للأرشيف
          </button>
          <div className="rounded-2xl gradient-brown text-primary-foreground p-5 shadow-luxury flex items-center gap-3">
            <DoctorAvatar name={doctor?.name} className="size-12 ring-white/40" />
            <div>
              <div className="text-xs opacity-80">محادثة الطبيب</div>
              <div className="text-xl font-extrabold mt-1">{doctor?.name ?? `Slot #${openConv.doctor_slot}`}</div>
            </div>
          </div>
          <ChatModule
            doctorSlot={openConv.doctor_slot}
            doctorName={doctor?.name ?? ""}
            me="admin"
            myName="الإدارة"
          />
        </main>
      </Shell>
    );
  }

  return (
    <Shell right={<button onClick={onLogout} className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition">خروج</button>}>
      <main className="container mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-2xl gradient-gold grid place-items-center shadow-gold">
              <Archive className="size-7 text-gold-foreground" />
            </div>
            <div>
              <div className="text-xs opacity-80">صلاحيات إشرافية كاملة</div>
              <div className="text-2xl font-extrabold">أرشيف المحادثات للإدارة</div>
              <div className="text-xs opacity-80 mt-1">تصفية حسب: المراقبة، الانضمام كطرف ثالث، والزمن</div>
            </div>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="grid sm:grid-cols-3 gap-3">
          <ModeCard active={mode==="all"} onClick={()=>setMode("all")} icon={<MessageSquare className="size-5" />}
            label="كل المحادثات" count={counts.all} tone="bg-card" />
          <ModeCard active={mode==="monitoring"} onClick={()=>setMode("monitoring")} icon={<Eye className="size-5" />}
            label="مراقبة (دون انضمام)" count={counts.monitoring} tone="bg-amber-50 dark:bg-amber-950/20" />
          <ModeCard active={mode==="joined"} onClick={()=>setMode("joined")} icon={<UserPlus className="size-5" />}
            label="منضم كطرف ثالث" count={counts.joined} tone="bg-rose-50 dark:bg-rose-950/20" />
        </div>

        {/* Filters */}
        <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury">
          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-3">
            <Filter className="size-4 text-gold" /> الفلاتر
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-input bg-background px-3 py-2">
              <Calendar className="size-4 text-gold" />
              <select value={range} onChange={e=>setRange(e.target.value as TimeRange)} className="bg-transparent text-xs font-bold outline-none">
                <option value="all">كل الأوقات</option>
                <option value="today">آخر 24 ساعة</option>
                <option value="week">آخر 7 أيام</option>
                <option value="month">آخر 30 يوم</option>
                <option value="quarter">آخر 90 يوم</option>
              </select>
            </div>

            <select value={participantFilter} onChange={e=>setParticipantFilter(e.target.value as any)}
              className="rounded-xl border border-input bg-background px-3 py-2 text-xs font-bold outline-none focus:border-gold">
              <option value="all">كل المسؤولين</option>
              {(["doctor","designer","technician","secretary_sanaa","secretary_ibb","admin"] as RoleKey[]).map(r =>
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              )}
            </select>

            <select value={doctorFilter === "all" ? "all" : String(doctorFilter)}
              onChange={e=>setDoctorFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="rounded-xl border border-input bg-background px-3 py-2 text-xs font-bold outline-none focus:border-gold">
              <option value="all">كل الأطباء</option>
              {Object.values(doctors).map(d => <option key={d.slot} value={d.slot}>{d.name}</option>)}
            </select>

            <label className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 text-xs font-bold cursor-pointer">
              <input type="checkbox" checked={archivedOnly} onChange={e=>setArchivedOnly(e.target.checked)} className="accent-[hsl(var(--gold))]" />
              المؤرشفة فقط
            </label>

            <div className="relative grow min-w-[200px]">
              <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في العنوان أو الأطراف أو الطبيب..."
                className="w-full rounded-xl border border-input bg-background pr-9 pl-3 py-2 text-xs outline-none focus:border-gold" />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
          <div className="p-3 border-b border-border bg-muted/40 text-xs font-bold flex items-center justify-between">
            <span>النتائج: {filtered.length}</span>
          </div>
          {loading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <Archive className="size-10 mx-auto mb-3 opacity-40" />
              لا توجد محادثات مطابقة للفلاتر.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map(c => {
                const doctor = doctors[c.doctor_slot];
                const adminIn = c.participants.includes("admin");
                return (
                  <li key={c.id} onClick={()=>setOpenConv(c)}
                    className="p-4 hover:bg-muted/40 transition cursor-pointer flex items-start gap-3">
                    <div className={`size-11 rounded-xl grid place-items-center shadow-gold shrink-0 ${adminIn?"bg-rose-700 text-white":"gradient-gold text-gold-foreground"}`}>
                      {adminIn ? <UserPlus className="size-5" /> : <Eye className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold text-sm truncate">
                          {c.title || summarizeParticipants(c.participants)}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${adminIn?"bg-rose-700 text-white":"bg-amber-200 text-amber-900"}`}>
                          {adminIn ? "منضم كطرف ثالث" : "مراقبة"}
                        </span>
                        {c.archived && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">مؤرشفة</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-1">
                        <DoctorAvatar name={doctor?.name} className="size-6" />
                        <span className="font-bold text-foreground">{doctor?.name ?? `Slot #${c.doctor_slot}`}</span>
                        <span>•</span>
                        {c.participants.map(p => (
                          <span key={p} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ROLE_COLOR[p]}`}>{ROLE_LABEL[p]}</span>
                        ))}
                        <span className="ms-1">• آخر نشاط: {new Date(c.last_message_at).toLocaleString("ar")}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </Shell>
  );
}

function ModeCard({ active, onClick, icon, label, count, tone }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; tone: string;
}) {
  return (
    <button onClick={onClick}
      className={`text-start rounded-2xl border-2 p-4 transition shadow-luxury ${active?"border-gold gradient-gold text-gold-foreground":"border-border "+tone+" hover:border-gold"}`}>
      <div className="flex items-center gap-2">
        <div className={`size-10 rounded-xl grid place-items-center ${active?"bg-white/30":"gradient-gold text-gold-foreground shadow-gold"}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-xs font-bold opacity-80">{label}</div>
          <div className="text-2xl font-extrabold">{count}</div>
        </div>
      </div>
    </button>
  );
}
