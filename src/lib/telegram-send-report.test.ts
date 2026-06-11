import { describe, it, expect } from "vitest";
import {
  buildTelegramSendReport,
  type TelegramToast,
} from "./telegram-send-report";

const texts = (toasts: TelegramToast[]) => toasts.map((t) => t.text).join(" | ");

describe("buildTelegramSendReport — زر إرسال إلى تلجرام", () => {
  it("لا يفشل بصمت: يرجّع رسالة واحدة على الأقل دائمًا", () => {
    const reports = buildTelegramSendReport({
      missing: [],
      urlFailed: [],
      failed: [],
      documentCount: 0,
    });
    expect(reports.length).toBeGreaterThanOrEqual(1);
  });

  it("يظهر رسالة واضحة عند غياب ملف ZIP", () => {
    const reports = buildTelegramSendReport({
      missing: ["ملف الحالة ZIP من الطبيب (قبل التعديل)"],
      urlFailed: [],
      failed: [],
      documentCount: 0,
    });
    const info = reports.find((r) => r.kind === "info");
    expect(info).toBeTruthy();
    expect(info!.text).toContain("ZIP");
    expect(info!.text).toContain("غير متوفّرة");
  });

  it("يظهر رسالة واضحة عند غياب ملف RAR", () => {
    const reports = buildTelegramSendReport({
      missing: ["ملف التصميم RAR من المصمم (قبل التعديل)"],
      urlFailed: [],
      failed: [],
      documentCount: 1,
    });
    expect(texts(reports)).toContain("RAR");
  });

  it("يظهر رسالة واضحة عند غياب نص التعديل", () => {
    const reports = buildTelegramSendReport({
      missing: ["نص التعديل من المصمم للفني"],
      urlFailed: [],
      failed: [],
      documentCount: 1,
    });
    const info = reports.find((r) => r.kind === "info");
    expect(info?.text).toContain("نص التعديل");
  });

  it("يجمع كل العناصر الناقصة (ZIP و RAR ونص التعديل) في رسالة واحدة", () => {
    const reports = buildTelegramSendReport({
      missing: [
        "ملف الحالة ZIP من الطبيب (قبل التعديل)",
        "ملف التصميم RAR من المصمم (قبل التعديل)",
        "نص التعديل من المصمم للفني",
      ],
      urlFailed: [],
      failed: [],
      documentCount: 0,
    });
    const info = reports.find((r) => r.kind === "info");
    expect(info).toBeTruthy();
    expect(info!.text).toContain("ZIP");
    expect(info!.text).toContain("RAR");
    expect(info!.text).toContain("نص التعديل");
  });

  it("يحذّر عند تعذّر تجهيز رابط الملف", () => {
    const reports = buildTelegramSendReport({
      missing: [],
      urlFailed: ["ملف الحالة ZIP (بعد التعديل)"],
      failed: [],
      documentCount: 1,
    });
    const warn = reports.find((r) => r.kind === "warning");
    expect(warn).toBeTruthy();
    expect(warn!.text).toContain("تعذّر تجهيز رابط");
  });

  it("يحذّر بوضوح عند فشل إرسال ملفات إلى تلجرام مع ذكر أسمائها", () => {
    const reports = buildTelegramSendReport({
      missing: [],
      urlFailed: [],
      failed: [{ filename: "مريض - التصميم بعد التعديل.rar" }],
      documentCount: 2,
    });
    const warn = reports.find((r) => r.kind === "warning");
    expect(warn).toBeTruthy();
    expect(warn!.text).toContain("فشل إرسال 1 ملف");
    expect(warn!.text).toContain("التصميم بعد التعديل.rar");
  });

  it("يذكر سبب فشل إرسال الملف عند توفّره", () => {
    const reports = buildTelegramSendReport({
      missing: [],
      urlFailed: [],
      failed: [
        { filename: "حسام - التصميم بعد التعديل.rar", error: "حجم الملف 63.0MB يتجاوز حد تلجرام (50MB)" },
      ],
      documentCount: 2,
    });
    const warn = reports.find((r) => r.kind === "warning");
    expect(warn!.text).toContain("يتجاوز حد تلجرام");
  });

  it("ينجح نصيًا عندما لا توجد ملفات مرفقة", () => {
    const reports = buildTelegramSendReport({
      missing: [],
      urlFailed: [],
      failed: [],
      documentCount: 0,
    });
    const ok = reports.find((r) => r.kind === "success");
    expect(ok?.text).toContain("لا توجد ملفات مرفقة");
  });

  it("ينجح بإظهار عدد الملفات المرسلة عند اكتمال الإرسال", () => {
    const reports = buildTelegramSendReport({
      missing: [],
      urlFailed: [],
      failed: [],
      documentCount: 3,
    });
    const ok = reports.find((r) => r.kind === "success");
    expect(ok?.text).toContain("3 ملف");
  });

  it("يدمج عدة حالات: عنصر ناقص + رابط متعذّر + فشل إرسال معًا دون فقدان أي رسالة", () => {
    const reports = buildTelegramSendReport({
      missing: ["نص التعديل من المصمم للفني"],
      urlFailed: ["ملف PDF للمحادثات"],
      failed: [{ filename: "مريض - ملف الحالة (قبل التعديل).zip" }],
      documentCount: 2,
    });
    expect(reports.some((r) => r.kind === "info")).toBe(true);
    expect(reports.filter((r) => r.kind === "warning").length).toBe(2);
    // success لا يظهر عند وجود فشل إرسال
    expect(reports.some((r) => r.kind === "success")).toBe(false);
  });
});
