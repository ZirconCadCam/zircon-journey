import { useEffect, useRef, useState } from "react";

/**
 * Tooth Quadrant Picker — مخطط الفم بنظام FDI
 *
 * يعرض صليبًا من 4 أرباع، وداخل كل ربع تظهر أرقام الأسنان كأزرار صغيرة
 * باهتة قابلة للنقر؛ عند اختيار رقم يصبح لونه بنياً ساطعاً ويُضاف إلى الناتج.
 *
 *   ┌──────────────┬──────────────┐
 *   │ Q1 (11–18)   │ Q2 (21–28)   │   ← الفك العلوي
 *   ├──────────────┼──────────────┤
 *   │ Q4 (41–48)   │ Q3 (31–38)   │   ← الفك السفلي
 *   └──────────────┴──────────────┘
 */

type QKey = "q1" | "q2" | "q3" | "q4";
type Quads = Record<QKey, string[]>;

const EMPTY: Quads = { q1: [], q2: [], q3: [], q4: [] };
const NUMS: Record<QKey, string[]> = {
  q1: ["11", "12", "13", "14", "15", "16", "17", "18"],
  q2: ["21", "22", "23", "24", "25", "26", "27", "28"],
  q3: ["31", "32", "33", "34", "35", "36", "37", "38"],
  q4: ["41", "42", "43", "44", "45", "46", "47", "48"],
};

function parseValue(value: string): Quads {
  const out: Quads = { q1: [], q2: [], q3: [], q4: [] };
  if (!value) return out;
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      (Object.keys(out) as QKey[]).forEach((k) => {
        const raw = String(parsed[k] ?? "");
        out[k] = raw.split(/[,،\s]+/).filter((t) => /^[1-8][1-8]$/.test(t));
      });
      return out;
    } catch { /* fall through */ }
  }
  trimmed.split(/[,،\s]+/).filter(Boolean).forEach((t) => {
    if (/^[1-8][1-8]$/.test(t)) {
      const key = (`q${t[0]}` as QKey);
      if (!out[key].includes(t)) out[key].push(t);
    }
  });
  return out;
}

function toFlatList(q: Quads): string {
  return [...q.q1, ...q.q2, ...q.q3, ...q.q4].join("، ");
}

export function ToothQuadrantPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (flat: string) => void;
}) {
  const [quads, setQuads] = useState<Quads>(() => parseValue(value));
  const lastEmitted = useRef<string>("");

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setQuads(parseValue(value));
  }, [value]);

  function toggle(key: QKey, num: string) {
    const set = new Set(quads[key]);
    if (set.has(num)) set.delete(num); else set.add(num);
    const sorted = NUMS[key].filter((n) => set.has(n));
    const next = { ...quads, [key]: sorted };
    setQuads(next);
    const flat = toFlatList(next);
    lastEmitted.current = flat;
    onChange(flat);
  }

  const cells: Array<{ key: QKey; label: string; sub: string; borders: string }> = [
    { key: "q1", label: "Q1", sub: "علوي يمين", borders: "border-b-2 border-l-2" },
    { key: "q2", label: "Q2", sub: "علوي يسار", borders: "border-b-2" },
    { key: "q4", label: "Q4", sub: "سفلي يمين", borders: "border-l-2" },
    { key: "q3", label: "Q3", sub: "سفلي يسار", borders: "" },
  ];

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-muted-foreground">
          مخطط الفم (FDI) — انقر الرقم لاختيار السن
        </div>
        {toFlatList(quads) && (
          <button
            type="button"
            onClick={() => {
              setQuads({ ...EMPTY });
              lastEmitted.current = "";
              onChange("");
            }}
            className="text-[10px] text-muted-foreground hover:text-destructive font-bold"
          >
            مسح الكل
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 grid-rows-2 w-full max-w-[340px] mx-auto bg-background rounded-lg overflow-hidden">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`flex flex-col p-2 ${c.borders} border-border/70`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold mb-1.5">
              <span className="text-gold">{c.label}</span>
              <span className="text-muted-foreground font-medium">{c.sub}</span>
            </div>
            <div className="grid grid-cols-4 gap-1" dir="ltr">
              {NUMS[c.key].map((n) => {
                const selected = quads[c.key].includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggle(c.key, n)}
                    aria-pressed={selected}
                    className={`rounded-md py-1 text-xs font-bold tabular-nums transition border ${
                      selected
                        ? "bg-[oklch(0.38_0.08_55)] text-white border-[oklch(0.38_0.08_55)] shadow-sm"
                        : "bg-transparent text-muted-foreground/45 border-border/40 hover:text-foreground hover:border-border"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground text-center">
        الناتج: <span className="font-bold text-foreground" dir="ltr">{toFlatList(quads) || "—"}</span>
      </div>
    </div>
  );
}
