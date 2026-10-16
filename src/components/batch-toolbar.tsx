import { useMemo, useState } from "react";
import { CheckSquare, Square, X, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Reusable multi-select state for list pages.
 * const sel = useBatchSelection(items.map(i => i.id));
 */
export function useBatchSelection(allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(false);

  const visible = useMemo(() => new Set(allIds), [allIds]);
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visible.has(id)),
    [selected, visible],
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectAll = () => setSelected(new Set(allIds));
  const clear = () => { setSelected(new Set()); setActive(false); };

  return {
    active,
    setActive,
    selected,
    selectedVisible,
    count: selectedVisible.length,
    allSelected: allIds.length > 0 && selectedVisible.length === allIds.length,
    toggle,
    selectAll,
    clear,
    isSelected: (id: string) => selected.has(id),
  };
}

export type BatchAction = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: (ids: string[]) => void | Promise<void>;
};

/** Top bar shown when selection mode is active; renders the toggle button otherwise. */
export function BatchToolbar({
  sel,
  actions,
  busy,
}: {
  sel: ReturnType<typeof useBatchSelection>;
  actions: BatchAction[];
  busy?: boolean;
}) {
  if (!sel.active) {
    return (
      <button
        onClick={() => sel.setActive(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted/40 transition"
      >
        <CheckSquare className="size-3.5" /> تحديد
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/50 bg-gold/5 px-3 py-2">
      <button
        onClick={sel.allSelected ? sel.clear : sel.selectAll}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold hover:bg-muted/40 transition"
      >
        {sel.allSelected ? <X className="size-3.5" /> : <CheckSquare className="size-3.5" />}
        {sel.allSelected ? "إلغاء التحديد" : "تحديد الكل"}
      </button>
      <span className="text-xs font-bold text-muted-foreground">{sel.count} محدد</span>
      {actions.map((a) => (
        <button
          key={a.key}
          disabled={busy || sel.count === 0}
          onClick={() => a.onClick(sel.selectedVisible)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
            a.danger
              ? "border border-destructive/50 text-destructive hover:bg-destructive/10"
              : "border border-gold/60 bg-gold/10 hover:gradient-gold hover:text-gold-foreground"
          }`}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
      <button
        onClick={sel.clear}
        className="mr-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
      >
        <X className="size-3.5" /> إغلاق
      </button>
    </div>
  );
}

/** Small checkbox for each row when selection mode is active. */
export function RowCheck({
  sel,
  id,
}: {
  sel: ReturnType<typeof useBatchSelection>;
  id: string;
}) {
  if (!sel.active) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); sel.toggle(id); }}
      className="shrink-0 p-1 text-gold"
      aria-label="تحديد"
    >
      {sel.isSelected(id) ? <CheckSquare className="size-4" /> : <Square className="size-4 opacity-50" />}
    </button>
  );
}
