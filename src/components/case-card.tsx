import { Link } from "@tanstack/react-router";
import { ProgressBar } from "./dashboard-shell";
import { STATUS_LABELS, STATUS_PROGRESS, BRANCH_LABELS } from "@/hooks/use-auth";
import { User, Hash, Calendar } from "lucide-react";

export interface CaseRow {
  id: string;
  case_code: string;
  patient_name: string;
  tooth_number: string | null;
  shade: string | null;
  status: string;
  branch: string;
  created_at: string;
}

export function CaseCard({ c }: { c: CaseRow }) {
  return (
    <Link to="/cases/$id" params={{ id: c.id }}
      className="block rounded-2xl bg-card border border-border p-5 hover:shadow-luxury hover:-translate-y-0.5 transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-gold flex items-center gap-1"><Hash className="size-3" />{c.case_code}</div>
          <div className="font-bold text-lg mt-1 flex items-center gap-2"><User className="size-4 text-muted-foreground" />{c.patient_name}</div>
        </div>
        <span className="text-[11px] font-bold rounded-full bg-secondary text-secondary-foreground px-3 py-1">
          {STATUS_LABELS[c.status] ?? c.status}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {c.tooth_number && <span>السن: <b className="text-foreground">{c.tooth_number}</b></span>}
        {c.shade && <span>اللون: <b className="text-foreground">{c.shade}</b></span>}
        <span>{BRANCH_LABELS[c.branch as "sanaa" | "ibb"] ?? c.branch}</span>
        <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(c.created_at).toLocaleDateString("ar")}</span>
      </div>
      <div className="mt-4">
        <ProgressBar value={STATUS_PROGRESS[c.status] ?? 0} />
      </div>
    </Link>
  );
}
