import { toast } from "sonner";

/**
 * Reliable "print to PDF" helper.
 *
 * Using window.open() + document.write() is fragile: popups are frequently
 * blocked, and print() can fire before the document finishes laying out.
 * Instead we render into a hidden same-origin iframe, wait for it to load,
 * then trigger the print dialog where the user can choose "Save as PDF".
 */
export function printHtmlDocument(html: string, fallbackTitle = "report") {
  if (typeof window === "undefined") return;

  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";

    document.body.appendChild(iframe);

    const cleanup = () => {
      // Give the print dialog time to grab the document before removing it.
      window.setTimeout(() => {
        try { iframe.remove(); } catch { /* noop */ }
      }, 1000);
    };

    const triggerPrint = () => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      try {
        win.focus();
        win.print();
      } catch {
        toast.error("تعذر فتح نافذة الطباعة");
      }
      // Remove after the print dialog closes.
      win.onafterprint = cleanup;
      cleanup();
    };

    iframe.onload = () => window.setTimeout(triggerPrint, 250);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      openFallbackWindow(html);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
  } catch {
    openFallbackWindow(html);
  }
}

function openFallbackWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("اسمح بالنوافذ المنبثقة لتصدير PDF"); return; }
  w.document.write(html);
  w.document.close();
}
