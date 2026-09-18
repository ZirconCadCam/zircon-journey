import { createFileRoute } from "@tanstack/react-router";
import {
  buildDoctorPointsHtml,
  buildStaffAccountingHtml,
  dedupe,
  designerDateOf,
  digits,
  doctorDateOf,
  firstName,
  isArchivedCase,
  isRepeatName,
  monthKeyAden,
  monthKeyOf,
  sumTeethAcc,
  technicianDateOf,
  AR_MONTHS,
  type AccRow,
} from "@/lib/accounting-report-build";

/**
 * جداول الحسابات الشهرية (نقاط الأطباء + حساب المصمم + حساب الفني)
 * → جروب تلجرام، آخر يوم من كل شهر الساعة 11:59 مساءً بتوقيت عدن.
 *
 * مقاوم لانقطاع الإنترنت: كل إرسال ناجح يُسجَّل في
 * `accounting_report_deliveries`. الـ cron ينادي هذا المسار كل ساعة أيضاً،
 * فأي شهر انتهى ولم يُرسَل كشفه (لعدم توفر الإنترنت) يُرسَل تلقائياً في أول
 * محاولة ناجحة لاحقاً — وبيانات الكشف تكون دائماً بيانات الشهر المنتهي فقط.
 *
 * الأمان: يتطلب رأس `x-cron-key` مطابقاً لـ REPORTS_CRON_KEY.
 */

const ADEN_OFFSET_MS = 3 * 3600_000;
/** Number of past months to attempt catching up on. */
const CATCHUP_MONTHS = 3;

function adenNow(): Date {
  return new Date(Date.now() + ADEN_OFFSET_MS);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A month is eligible once Aden time has reached its last day at 23:59. */
function monthIsClosed(y: number, m: number, now: Date): boolean {
  const closeUtc = Date.UTC(y, m - 1, daysInMonth(y, m), 23, 59, 0);
  return now.getTime() >= closeUtc;
}

function arabicMonthLabel(m: number, y: number): string {
  return `${AR_MONTHS[m - 1] ?? m} ${y}`;
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

async function sendHtml(
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

/** اسم ملف آمن (النقاط تقطع الاسم على أندرويد). */
function safeName(s: string): string {
  return s.replace(/\./g, "").replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export const Route = createFileRoute("/api/public/hooks/monthly-accounting")({
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

        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) {
          return Response.json({ error: "TELEGRAM_BOT_TOKEN غير مُهيّأ" }, { status: 500 });
        }
        const api = `https://api.telegram.org/bot${token}`;
        const chatId = resolveChatId();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---- Which months should be handled? ----
        const now = adenNow();
        const targets: { year: number; month: number }[] = [];
        if (Number.isInteger(body?.year) && Number.isInteger(body?.month)) {
          targets.push({ year: Number(body.year), month: Number(body.month) });
        } else {
          for (let back = 0; back <= CATCHUP_MONTHS; back++) {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth() + 1;
            if (force || monthIsClosed(y, m, now)) targets.push({ year: y, month: m });
          }
        }
        if (!targets.length) {
          return Response.json({ ok: true, skipped: "no closed month to send yet" });
        }

        // ---- Load data ----
        const [{ data: docs }, { data: cases, error }, { data: withdrawals }] = await Promise.all([
          supabaseAdmin.from("doctor_profiles").select("slot,name,branch,active"),
          supabaseAdmin.from("slot_cases").select("*").order("created_at", { ascending: true }),
          supabaseAdmin.from("doctor_point_withdrawals").select("doctor_slot,points"),
        ]);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = (cases ?? []) as AccRow[];
        const doctors = (docs ?? []) as any[];
        const nameOfSlot = (slot: unknown) =>
          doctors.find((d) => Number(d.slot) === Number(slot))?.name ?? `طبيب ${slot ?? ""}`;
        const withdrawnOf = (slot: number) =>
          (withdrawals ?? [])
            .filter((w: any) => Number(w.doctor_slot) === slot)
            .reduce((s: number, w: any) => s + (Number(w.points) || 0), 0);

        const { data: delivered } = await supabaseAdmin
          .from("accounting_report_deliveries")
          .select("scope,doctor_slot,year,month,ok");
        // كشوف اعتمدتها الإدارة («تمت المراجعة») — الإرسال التلقائي لا يعمل بدونها.
        const { data: reviews } = await supabaseAdmin
          .from("accounting_reviews")
          .select("scope,doctor_slot,year,month,reviewed");
        const reviewedKey = new Set(
          (reviews ?? [])
            .filter((r: any) => r.reviewed)
            .map((r: any) => `${r.scope}|${r.doctor_slot}|${r.year}|${r.month}`),
        );
        const isReviewed = (scope: string, slot: number, y: number, m: number) =>
          reviewedKey.has(`${scope}|${slot}|${y}|${m}`);

        const doneKey = new Set(
          (delivered ?? [])
            .filter((d: any) => d.ok)
            .map((d: any) => `${d.scope}|${d.doctor_slot ?? -1}|${d.year}|${d.month}`),
        );

        const results: any[] = [];

        async function record(
          scope: string,
          doctorSlot: number,
          year: number,
          month: number,
          ok: boolean,
          err?: string,
        ) {
          await supabaseAdmin
            .from("accounting_report_deliveries")
            .upsert(
              {
                scope,
                doctor_slot: doctorSlot,
                year,
                month,
                ok,
                error: err ?? null,
                sent_at: new Date().toISOString(),
              } as any,
              { onConflict: "scope,year,month,doctor_slot" },
            )
            .then(
              () => undefined,
              () => undefined,
            );
        }

        for (const { year, month } of targets) {
          const mk = monthKeyOf(year, month);
          const label = arabicMonthLabel(month, year);

          /* ---------------- 1) نقاط كل طبيب ---------------- */
          const archived = rows.filter(isArchivedCase);
          for (const d of doctors) {
            const slot = Number(d.slot);
            const key = `doctor|${slot}|${year}|${month}`;
            if (!force && doneKey.has(key)) continue;
            if (!force && !isReviewed("doctors", slot, year, month)) {
              results.push({ scope: "doctor", doctor: d.name, month: mk, skipped: "بانتظار مراجعة الإدارة" });
              continue;
            }
            const list = dedupe(
              archived.filter(
                (r) => Number(r.doctor_slot) === slot && monthKeyAden(doctorDateOf(r)) === mk,
              ),
            );
            if (!list.length) {
              await record("doctor", slot, year, month, true, "لا توجد حالات");
              continue;
            }
            const points = sumTeethAcc(list);
            const withdrawn = withdrawnOf(slot);
            const amounts = list.reduce((s, r) => s + (Number(r.remaining_amount) || 0), 0);
            const caption =
              `💰 <b>كشف الحسابات الشهري — نقاط الطبيب</b>\n` +
              `🗓️ الشهر: <b>${label}</b>\n` +
              `👨‍⚕️ الطبيب: <b>${d.name}</b>\n` +
              (d.branch ? `🏥 الفرع: ${d.branch === "ibb" ? "فرع إب" : "فرع صنعاء"}\n` : "") +
              `\n📦 الحالات المؤرشفة: <b>${list.length}</b>\n` +
              `⭐ مجموع النقاط: <b>${points}</b>\n` +
              `➖ النقاط المسحوبة: <b>${withdrawn}</b>\n` +
              `✅ النقاط المتبقية: <b>${points - withdrawn}</b>\n` +
              `💵 إجمالي المبالغ المتبقية: <b>${amounts || 0}</b>`;
            const html = buildDoctorPointsHtml({
              doctorName: d.name,
              branch: d.branch,
              monthLabel: label,
              rows: list,
              withdrawn,
            });
            const filename = safeName(`نقاط ${d.name} ${year}-${String(month).padStart(2, "0")}`) + ".html";
            try {
              await sendHtml(api, chatId, filename, html, caption);
              await record("doctor", slot, year, month, true);
              results.push({ scope: "doctor", doctor: d.name, month: mk, cases: list.length, points, ok: true });
            } catch (e: any) {
              try {
                await sendMessage(api, chatId, caption);
              } catch { /* offline — سيُعاد المحاولة لاحقاً */ }
              await record("doctor", slot, year, month, false, String(e?.message ?? e));
              results.push({ scope: "doctor", doctor: d.name, month: mk, ok: false, error: e?.message });
            }
          }

          /* ---------------- 2) حساب المصمم ---------------- */
          if (!force && !isReviewed("designer", -1, year, month)) {
            results.push({ scope: "designer", month: mk, skipped: "بانتظار مراجعة الإدارة" });
          } else if (force || !doneKey.has(`designer|-1|${year}|${month}`)) {
            const list = dedupe(
              rows.filter((r) => !!r.design_done && monthKeyAden(designerDateOf(r)) === mk),
            );
            const repeatIds = new Set<string>();
            for (const r of list) {
              if (!isRepeatName(r.patient_name)) continue;
              const ph = digits(r.patient_phone);
              const fn = firstName(r.patient_name);
              if (!ph) continue;
              if (rows.some((o) => o.id !== r.id && digits(o.patient_phone) === ph && firstName(o.patient_name) === fn))
                repeatIds.add(String(r.id));
            }
            const total = sumTeethAcc(list);
            const caption =
              `🖥️ <b>كشف الحسابات الشهري — المصمم</b>\n` +
              `🗓️ الشهر: <b>${label}</b>\n\n` +
              `📦 عدد الحالات المُصمَّمة: <b>${list.length}</b>\n` +
              `🦷 مجموع الأسنان: <b>${total}</b> سِنّ` +
              (repeatIds.size ? `\n🔁 حالات الإعادة: <b>${repeatIds.size}</b>` : "");
            if (!list.length) {
              await record("designer", -1, year, month, true, "لا توجد حالات");
            } else {
              const html = buildStaffAccountingHtml({
                staffTitle: "مصمم CAD/CAM — الحالات المُصمَّمة",
                monthLabel: label,
                rows: list,
                doctorNameOf: (r) => nameOfSlot(r.doctor_slot),
                dateOf: designerDateOf,
                dateHeader: "تاريخ التصميم",
                repeatIds,
              });
              const filename = safeName(`حساب المصمم ${year}-${String(month).padStart(2, "0")}`) + ".html";
              try {
                await sendHtml(api, chatId, filename, html, caption);
                await record("designer", -1, year, month, true);
                results.push({ scope: "designer", month: mk, cases: list.length, teeth: total, ok: true });
              } catch (e: any) {
                try { await sendMessage(api, chatId, caption); } catch { /* ignore */ }
                await record("designer", -1, year, month, false, String(e?.message ?? e));
                results.push({ scope: "designer", month: mk, ok: false, error: e?.message });
              }
            }
          }

          /* ---------------- 3) حساب الفني ---------------- */
          if (!force && !isReviewed("technician", -1, year, month)) {
            results.push({ scope: "technician", month: mk, skipped: "بانتظار مراجعة الإدارة" });
          } else if (force || !doneKey.has(`technician|-1|${year}|${month}`)) {
            const list = dedupe(
              rows.filter(
                (r) => !!r.permanent_fabrication_done && monthKeyAden(technicianDateOf(r)) === mk,
              ),
            );
            const total = sumTeethAcc(list);
            const caption =
              `🛠️ <b>كشف الحسابات الشهري — الفني</b>\n` +
              `🗓️ الشهر: <b>${label}</b>\n\n` +
              `📦 حالات «تم نحت الزركون الدائم»: <b>${list.length}</b>\n` +
              `🦷 مجموع الأسنان: <b>${total}</b> سِنّ`;
            if (!list.length) {
              await record("technician", -1, year, month, true, "لا توجد حالات");
            } else {
              const html = buildStaffAccountingHtml({
                staffTitle: "فني النحت — نحت الزركون الدائم",
                monthLabel: label,
                rows: list,
                doctorNameOf: (r) => nameOfSlot(r.doctor_slot),
                dateOf: technicianDateOf,
                dateHeader: "تاريخ النحت الدائم",
              });
              const filename = safeName(`حساب الفني ${year}-${String(month).padStart(2, "0")}`) + ".html";
              try {
                await sendHtml(api, chatId, filename, html, caption);
                await record("technician", -1, year, month, true);
                results.push({ scope: "technician", month: mk, cases: list.length, teeth: total, ok: true });
              } catch (e: any) {
                try { await sendMessage(api, chatId, caption); } catch { /* ignore */ }
                await record("technician", -1, year, month, false, String(e?.message ?? e));
                results.push({ scope: "technician", month: mk, ok: false, error: e?.message });
              }
            }
          }
        }

        return Response.json({ ok: true, months: targets, results });
      },
    },
  },
});
