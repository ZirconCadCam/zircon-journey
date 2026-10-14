import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Gauge, Power, SlidersHorizontal, Trash2, ArrowRight, Activity } from "lucide-react";
import { hasValidStaffSession } from "@/lib/staff-session";
import {
  TOOLS, SECTION_LABELS, KIND_LABELS, IMPORTANCE_LABELS, KIND_WEIGHT,
  loadConfig, saveConfig, loadEvents, clearEvents, importanceOf, todayUnits, isToolEnabled,
  type Section, type Kind, type Importance, type UsageConfig, type UsageEvent,
} from "@/lib/usage-tracker";

export const Route = createFileRoute("/admin/usage")({
  head: () => ({
    meta: [
      { title: "تفاصيل الاستهلاك — مركز زركون" },
      { name: "description", content: "تفاصيل استهلاك الرصيد وضبطه وإيقاف الأدوات المستهلكة." },
      { property: "og:title", content: "تفاصيل الاستهلاك — مركز زركون" },
      { property: "og:description", content: "مراقبة وتقنين استهلاك الرصيد حسب القسم والنوع والمدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsagePage,
});

const PERIODS = [
  { id: "1h", label: "آخر ساعة", ms: 3600_000 },
  { id: "24h", label: "آخر 24 ساعة", ms: 24 * 3600_000 },
  { id: "7d", label: "آخر 7 أيام", ms: 7 * 24 * 3600_000 },
  { id: "30d", label: "آخر 30 يوماً", ms: 30 * 24 * 3600_000 },
] as const;

const IMP_STYLE: Record<Importance, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/40",
  high: "bg-gold/20 text-foreground border-gold/50",
  medium: "bg-primary/10 text-primary border-primary/30",
  low: "bg-muted text-muted-foreground border-border",
};

function UsagePage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [cfg, setCfg] = useState<UsageConfig>(loadConfig());
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("24h");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [section, setSection] = useState<Section | "all">("all");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [showControl, setShowControl] = useState(false);

  useEffect(() => {
    if (!hasValidStaffSession("admin")) { nav({ to: "/staff/$role", params: { role: "admin" } }); return; }
    setEvents(loadEvents()); setCfg(loadConfig()); setReady(true);
  }, [nav]);

  const update = (next: UsageConfig) => { setCfg(next); saveConfig(next); };

  const filtered = useMemo(() => {
    let start = Date.now() - PERIODS.find((p) => p.id === period)!.ms;
    let end = Date.now();
    if (from) start = new Date(from).getTime();
    if (to) end = new Date(to).getTime() + 86400_000;
    return events.filter((e) => {
      if (e.t < start || e.t > end) return false;
      const def = TOOLS.find((t) => t.id === e.tool);
      if (section !== "all" && def?.section !== section) return false;
      if (kind !== "all" && e.kind !== kind) return false;
      return true;
    });
  }, [events, period, from, to, section, kind]);

  const rows = useMemo(() => {
    const total = filtered.reduce((s, e) => s + KIND_WEIGHT[e.kind], 0) || 1;
    return TOOLS.map((t) => {
      const evs = filtered.filter((e) => e.tool === t.id);
      const units = evs.reduce((s, e) => s + KIND_WEIGHT[e.kind], 0);
      return { t, count: evs.length, units, fails: evs.filter((e) => !e.ok).length, pct: (units / total) * 100 };
    }).filter((r) => r.count > 0 || r.t.switchable).sort((a, b) => b.units - a.units);
  }, [filtered]);

  const totalUnits = filtered.reduce((s, e) => s + KIND_WEIGHT[e.kind], 0);
  const today = todayUnits(events);
  const byKind = (Object.keys(KIND_LABELS) as Kind[]).map((k) => ({
    k, n: filtered.filter((e) => e.kind === k).reduce((s, e) => s + KIND_WEIGHT[e.kind], 0),
  }));

  if (!ready) return null;
  const sel = "rounded-lg border border-border bg-card px-3 py-2 text-sm";

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <main className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-2xl gradient-gold grid place-items-center shadow-gold"><Gauge className="size-6 text-gold-foreground" /></div>
            <div>
              <h1 className="text-2xl font-extrabold">تفاصيل الاستهلاك</h1>
              <p className="text-xs text-muted-foreground">طلبات هذا الجهاز للخادم مصنّفة حسب الأداة (وحدات تقديرية)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowControl((v) => !v)}
              className={`rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2 border ${showControl ? "gradient-gold text-gold-foreground border-transparent" : "border-border bg-card hover:border-gold"}`}>
              <SlidersHorizontal className="size-4" /> ضبط وتقنين الاستهلاك
            </button>
            <Link to="/staff/$role" params={{ role: "admin" }} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold flex items-center gap-2 hover:border-gold">
              <ArrowRight className="size-4" /> رجوع
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="وحدات الفترة" value={totalUnits} />
          <Stat label="عدد الطلبات" value={filtered.length} />
          <Stat label="استهلاك اليوم" value={cfg.dailyBudget ? `${today} / ${cfg.dailyBudget}` : today} warn={cfg.dailyBudget > 0 && today > cfg.dailyBudget} />
          <Stat label="أدوات موقوفة" value={TOOLS.filter((t) => t.switchable && !isToolEnabled(t.id)).length} />
        </div>

        {showControl && (
          <section className="rounded-2xl border border-gold/50 bg-card p-5 space-y-4">
            <h2 className="font-extrabold flex items-center gap-2"><SlidersHorizontal className="size-5" /> ضبط وتقنين الاستهلاك</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm space-y-1 block">
                <span className="font-bold">الحد اليومي (وحدات، 0 = بلا حد)</span>
                <input type="number" min={0} value={cfg.dailyBudget} className={sel + " w-full"}
                  onChange={(e) => update({ ...cfg, dailyBudget: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label className="text-sm space-y-1 block">
                <span className="font-bold">عند تجاوز الحد أوقف الأدوات ذات الأهمية</span>
                <select value={cfg.throttleBelow} className={sel + " w-full"}
                  onChange={(e) => update({ ...cfg, throttleBelow: e.target.value as Importance })}>
                  <option value="low">منخفضة فقط</option>
                  <option value="medium">متوسطة فما دون</option>
                  <option value="high">عالية فما دون</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">الأدوات الحرجة لا تُوقف أبداً. الإعدادات تُطبَّق على هذا الجهاز.</p>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4 flex flex-wrap gap-2 items-end">
          <Field label="المدة">
            <select value={period} onChange={(e) => { setPeriod(e.target.value as any); setFrom(""); setTo(""); }} className={sel}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="من تاريخ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></Field>
          <Field label="القسم">
            <select value={section} onChange={(e) => setSection(e.target.value as any)} className={sel}>
              <option value="all">كل الأقسام</option>
              {(Object.keys(SECTION_LABELS) as Section[]).map((s) => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="النوع">
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={sel}>
              <option value="all">كل الأنواع</option>
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </Field>
          <button onClick={() => setEvents(loadEvents())} className="rounded-lg border border-border px-3 py-2 text-sm font-bold flex items-center gap-1 hover:border-gold"><Activity className="size-4" /> تحديث</button>
          <button onClick={() => { if (confirm("مسح سجل الاستهلاك؟")) { clearEvents(); setEvents([]); } }} className="rounded-lg border border-border px-3 py-2 text-sm font-bold flex items-center gap-1 hover:bg-destructive hover:text-destructive-foreground"><Trash2 className="size-4" /> مسح السجل</button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-extrabold mb-3">حسب النوع</h2>
          <div className="space-y-2">
            {byKind.map(({ k, n }) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0">{KIND_LABELS[k]}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full gradient-gold" style={{ width: `${totalUnits ? (n / totalUnits) * 100 : 0}%` }} /></div>
                <span className="w-12 text-left font-bold">{n}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-extrabold mb-3 flex items-center gap-2"><Power className="size-5" /> الأدوات المستهلكة — إيقاف/تشغيل ومستوى الأهمية</h2>
          <div className="space-y-2">
            {rows.map(({ t, count, units, fails, pct }) => {
              const imp = importanceOf(t.id, cfg);
              const manualOff = !!cfg.disabled[t.id];
              const active = isToolEnabled(t.id);
              return (
                <div key={t.id} className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${active ? "border-border" : "border-destructive/40 bg-destructive/5"}`}>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-bold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{SECTION_LABELS[t.section]} · {KIND_LABELS[t.kind]} · {count} طلب{fails ? ` · ${fails} فاشل` : ""}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full gradient-gold" style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div className="text-sm font-extrabold w-16 text-center">{units}<div className="text-[10px] text-muted-foreground font-normal">{pct.toFixed(0)}%</div></div>
                  <select value={imp} onChange={(e) => update({ ...cfg, importance: { ...cfg.importance, [t.id]: e.target.value as Importance } })}
                    className={`rounded-lg border px-2 py-1 text-xs font-bold ${IMP_STYLE[imp]}`}>
                    {(Object.keys(IMPORTANCE_LABELS) as Importance[]).map((i) => <option key={i} value={i}>أهمية {IMPORTANCE_LABELS[i]}</option>)}
                  </select>
                  {t.switchable ? (
                    <button role="switch" aria-checked={!manualOff} aria-label={`تشغيل ${t.name}`}
                      onClick={() => update({ ...cfg, disabled: { ...cfg.disabled, [t.id]: !manualOff } })}
                      className={`relative h-7 w-14 rounded-full transition ${!manualOff ? "gradient-gold" : "bg-muted"}`}>
                      <span className={`absolute top-1 size-5 rounded-full bg-card shadow transition-all ${!manualOff ? "right-1" : "right-8"}`} />
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground w-14 text-center">أساسية</span>
                  )}
                  {!active && !manualOff && <span className="text-[11px] text-destructive font-bold w-full">موقوفة تلقائياً لتجاوز الحد اليومي</span>}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 bg-card ${warn ? "border-destructive" : "border-border"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold ${warn ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs space-y-1 block"><span className="font-bold text-muted-foreground">{label}</span>{children}</label>;
}
