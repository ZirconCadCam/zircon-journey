import { createFileRoute } from "@tanstack/react-router";
import {
  buildMonthlyReportHtml,
  matchesReportRow,
  sumTeeth,
  arabicMonth,
  REPORT_LABELS,
  buildStaffReportHtml,
  matchesStaffRow,
  STAFF_REPORT_LABELS,
  DESIGNER_KEYS,
  TECHNICIAN_KEYS,
  type StaffReportKey,
  type ReportKey,
  type ReportRow,
} from "@/lib/report-build";

/**
 * Monthly doctor statements → Telegram group.
 *
 * Called by pg_cron on the last day of every month at 23:59 Aden time
 * (20:59 UTC). Sends, per doctor: a formatted summary message (cases +
 * teeth totals per statement) plus the full statement as an HTML file,
 * exactly like case files are sent.
 *
 * Security: requires the shared `x-cron-key` header (REPORTS_CRON_KEY).
 */

const ADEN_OFFSET_HOURS = 3;

function adenNow(): { y: number; m: number; d: number } {
  const t = new Date(Date.now() + ADEN_OFFSET_HOURS * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthRangeUtc(y: number, m: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = daysInMonth(y, m);
  return {
    start: new Date(`${y}-${pad(m)}-01T00:00:00+03:00`).toISOString(),
    end: new Date(`${y}-${pad(m)}-${pad(last)}T23:59:59+03:00`).toISOString(),
  };
}

function resolveChatId(): string {
  const DEFAULT_CHAT_ID = "-1003242061826";
  const envChat = (process.env["TELEGRAM_CHAT_ID"] || "").trim();
  const valid = /^-\d{6,}$/.test(envChat) || /^@[A-Za-z0-9_]{4,}$/.test(envChat);
  return valid ? envChat : DEFAULT_CHAT_ID;
}

async function sendMessage(api: string, chatId: string, text: string) {
  const res = await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) throw new Error(j?.description ?? `HTTP ${res.status}`);
}

async function sendHtmlDocument(
  api: string,
  chatId: string,
  filename: string,
  html: string,
  caption: string,
) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption.slice(0, 1000));
  form.append("parse_mode", "HTML");
  form.append("document", new Blob([html], { type: "text/html" }), filename);
  const res = await fetch(`${api}/sendDocument`, { method: "POST", body: form });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) throw new Error(j?.description ?? `HTTP ${res.status}`);
}

export const Route = createFileRoute("/api/public/hooks/monthly-reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["REPORTS_CRON_KEY"];
        const given = request.headers.get("x-cron-key") ?? "";
        if (!expected || given !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: any = {};
        try {
          body = (await request.json()) ?? {};
        } catch {
          body = {};
        }
        const force = body?.force === true;

        const now = adenNow();
        if (!force && now.d !== daysInMonth(now.y, now.m)) {
          return Response.json({ ok: true, skipped: "not last day of month" });
        }

        const year = Number.isInteger(body?.year) ? Number(body.year) : now.y;
        const month = Number.isInteger(body?.month) ? Number(body.month) : now.m;
        const { start, end } = monthRangeUtc(year, month);
        const monthLabel = arabicMonth(month, year);

        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) {
          return Response.json({ error: "TELEGRAM_BOT_TOKEN غير مُهيّأ" }, { status: 500 });
        }
        const api = `https://api.telegram.org/bot${token}`;
        const chatId = resolveChatId();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [{ data: docs }, { data: cases, error }] = await Promise.all([
          supabaseAdmin.from("doctor_profiles").select("slot, name, branch, active"),
          supabaseAdmin
            .from("slot_cases")
            .select("*")
            .gte("created_at", start)
            .lte("created_at", end)
            .order("created_at", { ascending: true }),
        ]);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = (cases ?? []) as ReportRow[];
        const bySlot = new Map<number, ReportRow[]>();
        for (const r of rows) {
          const slot = Number((r as any).doctor_slot);
          if (!bySlot.has(slot)) bySlot.set(slot, []);
          bySlot.get(slot)!.push(r);
        }

        const keys: ReportKey[] = ["pending", "uninstalled", "completed"];
        const results: { doctor: string; cases: number; teeth: number; ok: boolean; error?: string }[] = [];
        let grandCases = 0;
        let grandTeeth = 0;

        for (const [slot, list] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
          const profile = (docs ?? []).find((d: any) => Number(d.slot) === slot) as any;
          const doctorName = profile?.name ?? `طبيب ${slot}`;
          const groups = keys.map((key) => ({ key, rows: list.filter((r) => matchesReportRow(r, key)) }));
          const teeth = sumTeeth(list);
          grandCases += list.length;
          grandTeeth += teeth;

          const lines = groups
            .map(({ key, rows: g }) => `• ${REPORT_LABELS[key]}: <b>${g.length}</b> حالة — <b>${sumTeeth(g)}</b> سِنّ`)
            .join("\n");
          const caption =
            `📋 <b>الكشف الشهري</b> — ${monthLabel}\n` +
            `👨‍⚕️ الطبيب: <b>${doctorName}</b>\n` +
            (profile?.branch ? `🏥 الفرع: ${profile.branch === "ibb" ? "فرع إب" : "فرع صنعاء"}\n` : "") +
            `\n${lines}\n\n` +
            `📦 إجمالي الحالات: <b>${list.length}</b>\n` +
            `🦷 مجموع الأسنان: <b>${teeth}</b> سِنّ`;

          const html = buildMonthlyReportHtml({
            doctorName,
            branch: profile?.branch ?? null,
            monthLabel,
            groups,
          });
          const filename = `كشف-${doctorName}-${year}-${String(month).padStart(2, "0")}.html`;

          try {
            await sendHtmlDocument(api, chatId, filename, html, caption);
            results.push({ doctor: doctorName, cases: list.length, teeth, ok: true });
          } catch (e: any) {
            // Fall back to the summary message alone so the numbers still arrive.
            try {
              await sendMessage(api, chatId, caption);
            } catch { /* ignore */ }
            results.push({ doctor: doctorName, cases: list.length, teeth, ok: false, error: e?.message });
          }
        }

        // كشوفات المصمم والفني (كل الأطباء مجتمعين)
        const doctorNameOf = (r: ReportRow) => {
          const p = (docs ?? []).find((d: any) => Number(d.slot) === Number((r as any).doctor_slot)) as any;
          return p?.name ?? `طبيب ${(r as any).doctor_slot ?? ""}`;
        };
        const staffReports: { title: string; icon: string; keys: StaffReportKey[] }[] = [
          { title: "مصمم CAD/CAM", icon: "🖥️", keys: DESIGNER_KEYS },
          { title: "فني النحت", icon: "🛠️", keys: TECHNICIAN_KEYS },
        ];
        const staffResults: { staff: string; cases: number; teeth: number; ok: boolean; error?: string }[] = [];

        for (const rep of staffReports) {
          const groups = rep.keys.map((key) => ({
            key,
            rows: rows.filter((r) => matchesStaffRow(r, key)),
          }));
          const involved = rows.filter((r) => rep.keys.some((k) => matchesStaffRow(r, k)));
          const teeth = sumTeeth(involved);
          const lines = groups
            .map(({ key, rows: g }) => `• ${STAFF_REPORT_LABELS[key]}: <b>${g.length}</b> حالة — <b>${sumTeeth(g)}</b> سِنّ`)
            .join("\n");
          const caption =
            `${rep.icon} <b>الكشف الشهري</b> — ${monthLabel}\n` +
            `👤 القسم: <b>${rep.title}</b>\n\n` +
            `${lines}\n\n` +
            `📦 إجمالي الحالات: <b>${involved.length}</b>\n` +
            `🦷 مجموع الأسنان: <b>${teeth}</b> سِنّ`;
          const html = buildStaffReportHtml({
            staffTitle: rep.title,
            monthLabel,
            groups,
            doctorNameOf,
          });
          const filename = `كشف-${rep.title.replace(/[\/\s]+/g, "-")}-${year}-${String(month).padStart(2, "0")}.html`;
          try {
            await sendHtmlDocument(api, chatId, filename, html, caption);
            staffResults.push({ staff: rep.title, cases: involved.length, teeth, ok: true });
          } catch (e: any) {
            try {
              await sendMessage(api, chatId, caption);
            } catch { /* ignore */ }
            staffResults.push({ staff: rep.title, cases: involved.length, teeth, ok: false, error: e?.message });
          }
        }

        try {
          await sendMessage(
            api,
            chatId,
            `🗓️ <b>ملخّص نهاية الشهر</b> — ${monthLabel}\n` +
              `👨‍⚕️ عدد الأطباء: <b>${bySlot.size}</b>\n` +
              `📦 إجمالي الحالات: <b>${grandCases}</b>\n` +
              `🦷 مجموع الأسنان: <b>${grandTeeth}</b> سِنّ`,
          );
        } catch { /* ignore */ }

        return Response.json({ ok: true, month: `${year}-${month}`, doctors: results, staff: staffResults, grandCases, grandTeeth });
      },
    },
  },
});
