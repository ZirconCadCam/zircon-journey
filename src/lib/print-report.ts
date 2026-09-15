import { toast } from "sonner";

/**
 * Reliable "print to PDF" helper.
 *
 * Printing from a hidden iframe is unreliable on mobile browsers (Android
 * Chrome frequently prints the *host* page instead of the frame, which is why
 * reports came out looking like a screenshot of the app). Instead we mount the
 * report markup into the current document inside a print-only host element and
 * hide everything else with a print stylesheet, so the printed output is
 * always the report itself.
 */
const HOST_ID = "lovable-print-host";
const STYLE_ID = "lovable-print-host-style";

function baseStyle() {
  return `
    #${HOST_ID} {
      position: fixed;
      inset: 0 auto auto 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      z-index: -1;
    }
    @media print {
      html, body { background: #fff !important; }
      body > *:not(#${HOST_ID}) { display: none !important; }
      #${HOST_ID} {
        position: static !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        opacity: 1 !important;
        z-index: auto !important;
        display: block !important;
        color: #000;
      }
    }
  `;
}

export function printHtmlDocument(html: string, fallbackTitle = "report") {
  if (typeof window === "undefined") return;

  try {
    // Clean up any leftovers from a previous run.
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();

    const parsed = new DOMParser().parseFromString(html, "text/html");
    const docTitle = parsed.title?.trim() || fallbackTitle;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    // Scope the report's own CSS to the host so it can't leak into the app.
    const rawCss = Array.from(parsed.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    // @page must stay at the top level, not nested inside @media print.
    const pageRules = rawCss.match(/@page[^{]*\{[^}]*\}/g)?.join("\n") ?? "";
    const reportCss = rawCss
      .replace(/@page[^{]*\{[^}]*\}/g, "")
      .replace(/(^|\})\s*(?:html|body)\b/g, (_m, brace: string) => `${brace} #${HOST_ID}`);
    style.textContent = `${baseStyle()}\n${pageRules}\n@media print {\n${reportCss}\n}`;
    document.head.appendChild(style);

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.dir = parsed.documentElement.getAttribute("dir") || "rtl";
    host.innerHTML = parsed.body.innerHTML;
    document.body.appendChild(host);

    const prevTitle = document.title;
    // The print dialog derives the suggested PDF filename from document.title.
    // A dot makes Chrome treat everything after it as a file extension
    // (title "د. محمد ..." became "د.pdf"), so drop dots entirely.
    const cleanTitle =
      docTitle
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim() || fallbackTitle;
    document.title = cleanTitle;

    const cleanup = () => {
      document.title = prevTitle;
      window.setTimeout(() => {
        host.remove();
        style.remove();
      }, 500);
    };

    window.addEventListener("afterprint", cleanup, { once: true });

    // Let layout settle (fonts/images) before opening the dialog.
    window.setTimeout(() => {
      try {
        window.print();
      } catch {
        toast.error("تعذر فتح نافذة الطباعة");
        cleanup();
      }
      // Safety net for browsers that never fire afterprint.
      window.setTimeout(cleanup, 60_000);
    }, 150);
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
