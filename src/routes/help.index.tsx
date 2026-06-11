import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Stethoscope, Palette, Wrench } from "lucide-react";

export const Route = createFileRoute("/help/")({
  head: () => ({
    meta: [
      { title: "دليل الاستخدام — Zircon CAD CAM" },
      { name: "description", content: "أدلة تعليمية مفصّلة لكل دور: الطبيب، المصمم، والفني." },
    ],
  }),
  component: HelpIndex,
});

const CARDS = [
  { role: "doctor", title: "دليل الطبيب", desc: "إنشاء الحالات، المتابعة، واتخاذ القرار", icon: Stethoscope },
  { role: "designer", title: "دليل المصمم", desc: "استلام الحالات وتصميمها وإرسال الملف", icon: Palette },
  { role: "technician", title: "دليل الفني", desc: "نحت المؤقت والدائم وإرسال البيانات", icon: Wrench },
] as const;

function HelpIndex() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">دليل الاستخدام</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zircon CAD CAM</div>
            </div>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
            <ArrowRight className="size-4" /> الرجوع
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury mb-8">
          <div className="text-xs opacity-80">مركز المساعدة</div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">الأدلة التعليمية</h1>
          <p className="text-sm opacity-80 mt-2 max-w-2xl">
            اختر دليلك حسب دورك. كل دليل يشرح خطوات الصفحة الخاصة بك بالتفصيل.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.role} to="/help/$role" params={{ role: c.role }}
                className="group rounded-2xl bg-card border border-border p-6 shadow-luxury hover:border-gold transition">
                <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold mb-4">
                  <Icon className="size-7 text-gold-foreground" />
                </div>
                <div className="text-lg font-bold">{c.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{c.desc}</div>
                <div className="mt-4 text-sm font-bold text-gold inline-flex items-center gap-1">
                  افتح الدليل <ArrowRight className="size-4 rotate-180" />
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
