/**
 * Expenses: upload an invoice/receipt, have Lovable AI read and categorize it,
 * and store the result. The table and bucket are locked; all access is here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "مواد ومستلزمات", "معدات وأجهزة", "صيانة", "إيجار", "كهرباء وماء", "اتصالات وإنترنت",
  "رواتب", "شحن ومواصلات", "برمجيات واشتراكات", "تسويق", "ضيافة", "أخرى",
] as const;

const BUCKET = "expense-receipts";
const MODEL = "openai/gpt-6-astra";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const resultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "date", "amount", "currency", "category", "description", "invoice_number"],
  properties: {
    vendor: { type: ["string", "null"] },
    date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    amount: { type: ["number", "null"], description: "Grand total paid" },
    currency: { type: ["string", "null"], description: "ISO code e.g. YER, SAR, USD" },
    category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
    description: { type: ["string", "null"], description: "Short Arabic summary of items" },
    invoice_number: { type: ["string", "null"] },
  },
};

async function readWithAI(base64: string, mime: string, fileName: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ");
  const filePart = mime === "application/pdf"
    ? { type: "input_file", filename: fileName, file_data: `data:application/pdf;base64,${base64}` }
    : { type: "input_image", image_url: `data:${mime};base64,${base64}` };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "expense", strict: true, schema: resultSchema } },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "اقرأ هذه الفاتورة أو الإيصال واستخرج: اسم المورد، التاريخ، الإجمالي المدفوع، العملة، رقم الفاتورة، وصفاً مختصراً بالعربية، واختر التصنيف الأنسب من القائمة. استخدم null لأي حقل غير واضح." },
          filePart,
        ],
      }],
    }),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    let msg = `خطأ ${res.status}`;
    try { msg = JSON.parse(txt)?.error?.message ?? JSON.parse(txt)?.message ?? msg; } catch { /* ignore */ }
    if (res.status === 402) msg = "نفد رصيد الذكاء الاصطناعي. أضف رصيداً من الإعدادات.";
    if (res.status === 429) msg = "طلبات كثيرة، حاول بعد قليل.";
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.response?.error?.message ?? ev.message ?? "فشل التحليل");
      } catch (e) { if (e instanceof Error && e.message !== "Unexpected end of JSON input" && !(e instanceof SyntaxError)) throw e; }
    }
  }
  if (!out.trim()) throw new Error("لم يتمكن الذكاء الاصطناعي من قراءة الملف");
  return JSON.parse(out) as {
    vendor: string | null; date: string | null; amount: number | null; currency: string | null;
    category: string; description: string | null; invoice_number: string | null;
  };
}

const COLS = "id,vendor,expense_date,amount,currency,category,description,invoice_number,file_name,file_mime,status,error,created_at";

export const uploadExpense = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      fileName: z.string().min(1).max(200),
      mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      base64: z.string().min(10).max(14_000_000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const safe = data.fileName.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safe}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: data.mime });
    if (upErr) return { ok: false, error: upErr.message };

    let row: Record<string, unknown> = { file_path: path, file_name: data.fileName, file_mime: data.mime };
    try {
      const r = await readWithAI(data.base64, data.mime, data.fileName);
      const date = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
      row = {
        ...row, vendor: r.vendor, expense_date: date, amount: r.amount, currency: r.currency,
        category: (EXPENSE_CATEGORIES as readonly string[]).includes(r.category) ? r.category : "أخرى",
        description: r.description, invoice_number: r.invoice_number, status: "done",
      };
    } catch (e) {
      row = { ...row, status: "failed", error: e instanceof Error ? e.message : "فشل التحليل" };
    }
    const { error } = await db.from("expenses").insert(row as never);
    if (error) return { ok: false, error: error.message };
    return { ok: row.status === "done", error: (row.error as string) ?? null };
  });

export const listExpenses = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("expenses").select(COLS).order("created_at", { ascending: false }).limit(1000);
  return (data ?? []) as Array<{
    id: string; vendor: string | null; expense_date: string | null; amount: number | null;
    currency: string | null; category: string; description: string | null; invoice_number: string | null;
    file_name: string; file_mime: string | null; status: string; error: string | null; created_at: string;
  }>;
});

export const updateExpense = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      patch: z.object({
        vendor: z.string().max(200).nullable().optional(),
        expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        amount: z.number().nullable().optional(),
        currency: z.string().max(10).nullable().optional(),
        category: z.enum(EXPENSE_CATEGORIES).optional(),
        description: z.string().max(1000).nullable().optional(),
      }).strict(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("expenses").update(data.patch as never).eq("id", data.id);
    return { ok: !error, error: error?.message ?? null };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db.from("expenses").select("file_path").eq("id", data.id).maybeSingle();
    if (row?.file_path) await db.storage.from(BUCKET).remove([row.file_path]);
    const { error } = await db.from("expenses").delete().eq("id", data.id);
    return { ok: !error, error: error?.message ?? null };
  });

export const expenseFileUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db.from("expenses").select("file_path").eq("id", data.id).maybeSingle();
    if (!row) return { url: null as string | null };
    const { data: s } = await db.storage.from(BUCKET).createSignedUrl(row.file_path, 300);
    return { url: s?.signedUrl ?? null };
  });

function bytesToBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Re-run AI extraction for a stored receipt (e.g. one that failed before). */
export const retryExpense = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db.from("expenses").select("file_path,file_name,file_mime").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false, error: "المصروف غير موجود" };
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(row.file_path);
    if (dlErr || !blob) return { ok: false, error: "تعذر تحميل الملف الأصلي" };
    const mime = row.file_mime ?? blob.type ?? "image/jpeg";
    try {
      const r = await readWithAI(bytesToBase64(new Uint8Array(await blob.arrayBuffer())), mime, row.file_name);
      const date = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
      const { error } = await db.from("expenses").update({
        vendor: r.vendor, expense_date: date, amount: r.amount, currency: r.currency,
        category: (EXPENSE_CATEGORIES as readonly string[]).includes(r.category) ? r.category : "أخرى",
        description: r.description, invoice_number: r.invoice_number, status: "done", error: null,
      } as never).eq("id", data.id);
      return { ok: !error, error: error?.message ?? null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التحليل";
      await db.from("expenses").update({ status: "failed", error: msg } as never).eq("id", data.id);
      return { ok: false, error: msg };
    }
  });
