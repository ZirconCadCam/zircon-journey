import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Sparkles, ArrowRight, CheckCircle2, Lightbulb, ListChecks } from "lucide-react";
import { ROLE_GUIDES, TICKS_LEGEND, type GuideRole } from "@/lib/role-guides";

export const Route = createFileRoute("/help/$role")({
  head: ({ params }) => {
    const g = ROLE_GUIDES[(params.role as GuideRole)] ?? ROLE_GUIDES.doctor;
    return {
      meta: [
        { title: `${g.title} — Zircon CAD CAM` },
        { name: "description", content: g.overview.slice(0, 155) },
      ],
    };
  },
  component: HelpRole,
});

function HelpRole() {
  const { role } = useParams({ from: "/help/$role" });
  const guide = ROLE_GUIDES[role as GuideRole];

  if (!guide) {
    return (
      <div className="min-h-screen grid place-items-center text-center px-6">
        <div>
          <div className="text-xl font-bold mb-2">دليل غير معروف</div>
          <Link to="/help" className="text-gold underline text-sm">العودة لمركز المساعدة</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/help" className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">{guide.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Zircon CAD CAM</div>
            </div>
          </Link>
          <Link to="/help" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
            <ArrowRight className="size-4" /> الأدلة
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 max-w-3xl">
        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold">{guide.title}</h1>
          <div className="text-sm opacity-80 mt-1">{guide.subtitle}</div>
          <p className="text-sm opacity-90 mt-3 leading-relaxed">{guide.overview}</p>
        </div>

        {/* Sections */}
        <div className="space-y-5">
          {guide.sections.map((section, si) => (
            <section key={si} className="rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-luxury">
              <h2 className="text-lg font-bold text-gold mb-2">{section.heading}</h2>
              {section.intro && (
                <p className="text-sm text-muted-foreground mb-4">{section.intro}</p>
              )}
              <div className="space-y-4">
                {section.steps.map((step, sti) => (
                  <div key={sti} className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="font-bold text-sm mb-2 flex items-center gap-2">
                      <span className="size-6 rounded-lg gradient-gold text-gold-foreground grid place-items-center text-xs font-extrabold shrink-0">
                        {sti + 1}
                      </span>
                      {step.title}
                    </div>
                    <ul className="space-y-1.5 ps-1">
                      {step.details.map((d, di) => (
                        <li key={di} className="text-sm text-foreground/90 flex items-start gap-2">
                          <CheckCircle2 className="size-4 text-gold mt-0.5 shrink-0" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Stages reference */}
        <section className="rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-luxury mt-5">
          <h2 className="text-lg font-bold text-gold mb-3 flex items-center gap-2">
            <ListChecks className="size-5" /> المراحل التي تخصّك
          </h2>
          <div className="divide-y divide-border">
            {guide.stages.map((s, i) => (
              <div key={i} className="py-2.5 flex items-start gap-3">
                <span className="rounded-full bg-gold/15 text-gold text-[11px] font-bold px-2.5 py-0.5 shrink-0 whitespace-nowrap">
                  {s.label}
                </span>
                <span className="text-sm text-muted-foreground">{s.meaning}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Ticks legend */}
        <section className="rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-luxury mt-5">
          <h2 className="text-lg font-bold text-gold mb-3">دلالة علامات الصح</h2>
          <div className="space-y-2">
            {TICKS_LEGEND.map((t, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="font-bold whitespace-nowrap">{t.mark}</span>
                <span className="text-muted-foreground">{t.meaning}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Tips */}
        <section className="rounded-2xl border border-gold/40 bg-gold/5 p-5 sm:p-6 shadow-luxury mt-5">
          <h2 className="text-lg font-bold text-gold mb-3 flex items-center gap-2">
            <Lightbulb className="size-5" /> نصائح مهمة
          </h2>
          <ul className="space-y-2">
            {guide.tips.map((t, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="text-gold font-bold shrink-0">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
