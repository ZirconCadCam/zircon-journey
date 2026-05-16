import { useEffect, useRef, useState } from "react";

/**
 * Tooth Quadrant Picker — مخطط الفم بنظام FDI
 *
 * يعرض صليبًا من 4 أرباع قابلة للتحرير حسب نظام FDI:
 *   ┌──────────────┬──────────────┐
 *   │ Q1 (11–18)   │ Q2 (21–28)   │   ← الفك العلوي
 *   │ علوي يمين    │ علوي يسار    │
 *   ├──────────────┼──────────────┤
 *   │ Q4 (41–48)   │ Q3 (31–38)   │   ← الفك السفلي
 *   │ سفلي يمين    │ سفلي يسار    │
 *   └──────────────┴──────────────┘
 *
 * في RTL: الخلية الأولى في الشبكة تظهر على اليمين تلقائيًا.
 */

type Quads = { q1: string; q2: string; q3: string; q4: string };

const EMPTY: Quads = { q1: "", q2: "", q3: "", q4: "" };

function parseValue(value: string): Quads {
  // Accept either JSON ({q1,q2,q3,q4}) or comma list (e.g. "11, 24, 36")
  if (!value) return { ...EMPTY };
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        q1: String(parsed.q1 ?? ""),
        q2: String(parsed.q2 ?? ""),
        q3: String(parsed.q3 ?? ""),
        q4: String(parsed.q4 ?? ""),
      };
    } catch { /* fall through */ }
  }
  const out: Quads = { ...EMPTY };
  trimmed.split(/[,،\s]+/).filter(Boolean).forEach((t) => {
    if (/^[1-8][1-8]$/.test(t)) {
      const q = t[0] as "1" | "2" | "3" | "4";
      const key = (`q${q}` as keyof Quads);
      out[key] = out[key] ? `${out[key]}, ${t}` : t;
    }
  });
  return out;
}

function toFlatList(q: Quads): string {
  return [q.q1, q.q2, q.q3, q.q4]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("، ");
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

  // If parent value changes externally (e.g. reset), re-sync once.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    setQuads(parseValue(value));
  }, [value]);

  function update(key: keyof Quads, v: string) {
    const next = { ...quads, [key]: v };
    setQuads(next);
    const flat = toFlatList(next);
    lastEmitted.current = flat;
    onChange(flat);
  }

  const cells: Array<{
    key: keyof Quads;
    label: string;
    sub: string;
    placeholder: string;
    borders: string;
  }> = [
    // Row 1 — upper jaw
    {
      key: "q1",
      label: "Q1",
      sub: "علوي يمين • 11–18",
      placeholder: "مثال: 11، 13",
      // top-right cell: border on bottom + left (the cross)
      borders: "border-b-2 border-l-2",
    },
    {
      key: "q2",
      label: "Q2",
      sub: "علوي يسار • 21–28",
      placeholder: "مثال: 21، 24",
      borders: "border-b-2",
    },
    // Row 2 — lower jaw
    {
      key: "q4",
      label: "Q4",
      sub: "سفلي يمين • 41–48",
      placeholder: "مثال: 46",
      borders: "border-l-2",
    },
    {
      key: "q3",
      label: "Q3",
      sub: "سفلي يسار • 31–38",
      placeholder: "مثال: 36",
      borders: "",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-muted-foreground">
          مخطط الفم (FDI) — حدّد الجهة والرقم
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

      <div className="grid grid-cols-2 grid-rows-2 aspect-square w-full max-w-[260px] mx-auto bg-background rounded-lg overflow-hidden">
        {cells.map((c) => (
          <div
            key={c.key}
            className={`relative flex flex-col p-2 ${c.borders} border-border/70 transition-colors focus-within:bg-gold/5`}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-gold mb-1">
              <span>{c.label}</span>
              <span className="text-muted-foreground font-medium">{c.sub}</span>
            </div>
            <textarea
              value={quads[c.key]}
              onChange={(e) => update(c.key, e.target.value)}
              placeholder={c.placeholder}
              dir="ltr"
              rows={2}
              className="flex-1 w-full resize-none bg-transparent outline-none text-center text-sm font-bold tracking-wide placeholder:text-muted-foreground/50 placeholder:font-normal placeholder:text-[11px]"
            />
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-muted-foreground text-center">
        الناتج: <span className="font-bold text-foreground" dir="ltr">{toFlatList(quads) || "—"}</span>
      </div>
    </div>
  );
}
