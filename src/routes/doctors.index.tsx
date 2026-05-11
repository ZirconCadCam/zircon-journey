import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ArrowRight, Stethoscope, Plus, Pencil, Search } from "lucide-react";
import { useAuth, BRANCH_LABELS } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/doctors/")({
  component: DoctorsGrid,
});

interface Doctor {
  slot: number;
  name: string;
  branch: "sanaa" | "ibb" | null;
  password: string;
  active: boolean;
}

function DoctorsGrid() {
  const nav = useNavigate();
  const { role } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filter, setFilter] = useState<"all" | "sanaa" | "ibb">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Doctor | null>(null);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("doctor-profiles-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_profiles" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const { data } = await supabase.from("doctor_profiles").select("*").order("slot");
    setDoctors((data as Doctor[]) ?? []);
  }

  const visible = doctors.filter(d =>
    (filter === "all" || d.branch === filter) &&
    (!q || d.name.includes(q))
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">بوابة الطبيب</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">اختر الطبيب للدخول إلى صفحته</div>
            </div>
          </Link>
          <button onClick={() => nav({ to: "/" })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
            <ArrowRight className="size-4" /> الرجوع
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-2">
            {(["all","sanaa","ibb"] as const).map(b => (
              <button key={b} onClick={() => setFilter(b)}
                className={`text-xs font-bold rounded-full px-4 py-2 border transition ${filter===b?"gradient-gold border-gold shadow-gold":"bg-card border-border hover:border-gold"}`}>
                {b === "all" ? "الكل" : BRANCH_LABELS[b]}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="size-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن طبيب..."
              className="rounded-xl border border-input bg-card pr-9 pl-4 py-2 text-sm outline-none focus:border-gold w-64" />
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3">
          <Stethoscope className="size-7 text-gold" /> أطباء المركز
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {visible.map(d => <DoctorTile key={d.slot} d={d} isAdmin={role === "admin"} onEdit={() => setEditing(d)} />)}
        </div>
      </main>

      {editing && role === "admin" && (
        <EditDialog d={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function DoctorTile({ d, isAdmin, onEdit }: { d: Doctor; isAdmin: boolean; onEdit: () => void }) {
  const initial = d.name.replace(/^د\.\s*/, "").charAt(0);
  return (
    <div className="relative group">
      <Link
        to="/doctors/$slot"
        params={{ slot: String(d.slot) }}
        className={`block rounded-3xl border-2 p-5 text-center transition hover:-translate-y-1 ${
          d.active
            ? "border-gold/40 bg-card hover:border-gold hover:shadow-luxury"
            : "border-dashed border-border bg-muted/30 opacity-60"
        }`}
      >
        <div className="mx-auto size-20 rounded-full gradient-gold grid place-items-center shadow-gold mb-3">
          {d.active ? (
            <span className="text-3xl font-extrabold text-gold-foreground font-display">{initial}</span>
          ) : (
            <Plus className="size-8 text-gold-foreground" />
          )}
        </div>
        <div className="font-bold text-sm leading-tight min-h-[2.5rem]">{d.name}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {d.branch ? BRANCH_LABELS[d.branch] : "—"} • خانة #{d.slot}
        </div>
      </Link>
      {isAdmin && (
        <button onClick={onEdit}
          className="absolute top-2 left-2 size-8 rounded-full bg-background border border-border grid place-items-center opacity-0 group-hover:opacity-100 transition hover:border-gold">
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function EditDialog({ d, onClose, onSaved }: { d: Doctor; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(d.name);
  const [branch, setBranch] = useState<string>(d.branch ?? "");
  const [password, setPassword] = useState(d.password);
  const [active, setActive] = useState(d.active);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("doctor_profiles")
      .update({ name, branch: branch || null, password, active }).eq("slot", d.slot);
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("تم الحفظ"); onSaved(); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border shadow-luxury max-w-md w-full p-6" onClick={e=>e.stopPropagation()}>
        <div className="font-bold text-lg mb-4">تعديل الخانة #{d.slot}</div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold mb-1 block">الاسم</label>
            <input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">الفرع</label>
            <select value={branch} onChange={e=>setBranch(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="">— لا يوجد —</option>
              <option value="sanaa">فرع صنعاء</option>
              <option value="ibb">فرع إب</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">كلمة المرور</label>
            <input value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> الخانة مفعّلة
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">إلغاء</button>
          <button onClick={save} disabled={saving} className="rounded-lg gradient-brown px-4 py-2 text-sm font-bold">
            {saving ? "..." : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}
