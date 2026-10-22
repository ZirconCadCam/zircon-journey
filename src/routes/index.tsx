import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Stethoscope, Layers, Wrench, Users, Shield } from "lucide-react";
import { StalledAlertsBadge, useStalledCases } from "@/components/stalled-alerts";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const stalled = useStalledCases();
  return (

    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg">رحلة سن الزركون</div>
              <div className="text-xs text-muted-foreground">Zircon CAD CAM Center</div>
            </div>
          </div>
          <Link
            to="/login"
            className="rounded-lg gradient-brown px-5 py-2.5 text-sm font-semibold shadow-luxury hover:opacity-95 transition"
          >
            تسجيل الدخول
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold text-gold mb-6">
          <Sparkles className="size-3.5" /> نظام احترافي متكامل
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight max-w-3xl mx-auto">
          إدارة <span className="text-gold">رحلة سن الزركون</span> من الفحص حتى التسليم
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          منصة موحّدة لمركز Zircon CAD CAM تربط الطبيب بالمصمم بفنّي المختبر بالسكرتارية،
          مع تتبع لحظي ومراسلات داخلية وملفات ثلاثية الأبعاد.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/login"
            className="rounded-xl gradient-brown px-8 py-3.5 font-bold shadow-luxury"
          >
            ابدأ الآن
          </Link>
          <a href="#roles" className="rounded-xl border border-border bg-card px-8 py-3.5 font-bold">
            استكشف النظام
          </a>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="container mx-auto px-6 pb-24">
        <h2 className="text-3xl font-bold text-center mb-12">منصات مخصصة لكل دور</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
          {[
            { icon: Stethoscope, t: "بوابة الطبيب", d: "حالات خاصة وسجل المرضى", to: "/doctors" as const, alert: "doctor" },
            { icon: Layers, t: "مصمم CAD/CAM", d: "محادثات مع الأطباء واستلام الملفات", to: "/staff/$role" as const, params: { role: "designer" }, alert: "designer" },
            { icon: Wrench, t: "فني المختبر", d: "تنسيق النحت والتسليم", to: "/staff/$role" as const, params: { role: "technician" }, alert: "technician" },
            { icon: Shield, t: "إدارة المركز", d: "إشراف ومراقبة المحادثات", to: "/staff/$role" as const, params: { role: "admin" } },
          ].map((c: any) => (
            <div key={c.t} className="relative">
              {c.alert && (
                <div className="absolute top-3 left-3 z-10">
                  <StalledAlertsBadge role={c.alert} all={stalled} label={c.t} />
                </div>
              )}
              <Link
                to={c.to}
                params={c.params}
                className="rounded-2xl bg-card border border-border p-6 hover:shadow-luxury hover:-translate-y-1 transition block h-full"
              >
                <div className="size-12 rounded-xl gradient-gold grid place-items-center mb-4 shadow-gold">
                  <c.icon className="size-6" />
                </div>
                <div className="font-bold text-lg">{c.t}</div>
                <div className="text-sm text-muted-foreground mt-1">{c.d}</div>
              </Link>
            </div>
          ))}
        </div>
      </section>


      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Zircon CAD CAM Center. جميع الحقوق محفوظة.
      </footer>
    </div>
  );
}
