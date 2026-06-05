import { toast } from "sonner";

/**
 * Robust "share" that works across desktop + mobile.
 *
 * The Web Share API (`navigator.share`) is only available on some browsers
 * (mostly mobile / HTTPS) and additionally requires an active user gesture.
 * When it is missing, fails, or the gesture has expired, we fall back to
 * copying the content to the clipboard so the button always does something
 * useful instead of silently failing.
 *
 * Call this DIRECTLY inside the click handler (do not await long async work
 * before calling it) so the browser still considers it a user gesture.
 */
export async function shareOrCopy(opts: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<void> {
  const { title, text, url } = opts;
  const fallbackText = [text, url].filter(Boolean).join("\n").trim() || title || "";

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return; // shared successfully
    } catch (e: any) {
      // User canceled the native sheet — treat as a no-op, not an error.
      if (e?.name === "AbortError") return;
      // Any other failure (NotAllowedError, unsupported payload, …) → clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(fallbackText);
    toast.success("تم نسخ المحتوى للمشاركة");
  } catch {
    toast.error("تعذرت المشاركة على هذا المتصفح");
  }
}
