import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, BRANCH_LABELS, type Branch } from "@/hooks/use-auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { toast } from "sonner";

export const Route = createFileRoute("/cases/new")({
  component: NewCase,
});

function NewCase() {
  const nav = useNavigate();
  const { session, role, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    patient_name: "", patient_phone: "", patient_age: "",
    tooth_number: "", shade: "A2", branch: "sanaa" as Branch, notes: "",
  });

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login" });
    if (!loading && session && role && role !== "doctor") nav({ to: "/dashboard" });
  }, [loading, session, role, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("cases").insert({
        doctor_id: session.user.id,
        patient_name: form.patient_name,
        patient_phone: form.patient_phone || null,
        patient_age: form.patient_age ? Number(form.patient_age) : null,
        tooth_number: form.tooth_number || null,
        shade: form.shade || null,
        branch: form.branch,
        notes: form.notes || null,
      });
      if (error) throw error;
      toast.success("تم إنشاء الحالة بنجاح");
      nav({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSubmitting(false); }
  }

  return (
    <DashboardShell title="حالة جديدة">
      <form onSubmit={submit} className="max-w-2xl rounded-2xl bg-card border border-border p-6 shadow-luxury space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="اسم المريض" required>
            <input className="input" value={form.patient_name} onChange={e=>setForm({...form,patient_name:e.target.value})} required />
          </Field>
          <Field label="رقم الهاتف">
            <input className="input" dir="ltr" value={form.patient_phone} onChange={e=>setForm({...form,patient_phone:e.target.value})} />
          </Field>
          <Field label="العمر">
            <input type="number" className="input" value={form.patient_age} onChange={e=>setForm({...form,patient_age:e.target.value})} />
          </Field>
          <Field label="رقم السن">
            <input className="input" placeholder="مثال: 11" value={form.tooth_number} onChange={e=>setForm({...form,tooth_number:e.target.value})} />
          </Field>
          <Field label="اللون (Shade)">
            <input className="input" value={form.shade} onChange={e=>setForm({...form,shade:e.target.value})} />
          </Field>
          <Field label="الفرع">
            <select className="input" value={form.branch} onChange={e=>setForm({...form,branch:e.target.value as Branch})}>
              {(["sanaa","ibb"] as Branch[]).map(b => <option key={b} value={b}>{BRANCH_LABELS[b]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea rows={4} className="input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} />
        </Field>
        <button disabled={submitting} className="rounded-xl gradient-brown px-6 py-3 font-bold shadow-luxury disabled:opacity-60">
          {submitting ? "..." : "إنشاء الحالة"}
        </button>
      </form>
      <style>{`.input{width:100%;border:1px solid var(--input);background:var(--background);border-radius:0.75rem;padding:0.65rem 1rem;outline:none}.input:focus{border-color:var(--gold);box-shadow:0 0 0 3px oklch(0.78 0.14 80 / 0.2)}`}</style>
    </DashboardShell>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold mb-1.5">{label}{required && <span className="text-gold"> *</span>}</div>
      {children}
    </label>
  );
}
