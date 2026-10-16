/**
 * Links between stored case files and the Telegram group message that holds
 * the same file. Used after archived case files are auto-deleted from storage.
 */
import { supabase } from "@/integrations/supabase/client";

/** Normalise a storage URL or raw path to the object path used as lookup key. */
export function objectKey(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const s = String(urlOrPath);
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const m = u.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/[^/]+\/(.+)$/);
      return m ? decodeURIComponent(m[1]!) : null;
    } catch {
      return null;
    }
  }
  return s.replace(/^\/+/, "");
}

/** Build a t.me deep link to a message in a group/channel. */
export function telegramMessageLink(chatId: string, messageId: number): string {
  if (chatId.startsWith("@")) return `https://t.me/${chatId.slice(1)}/${messageId}`;
  const internal = chatId.replace(/^-100/, "").replace(/^-/, "");
  return `https://t.me/c/${internal}/${messageId}`;
}

/** Find the Telegram link for a stored file (browser side). */
export async function findTelegramLink(urlOrPath: string | null | undefined): Promise<string | null> {
  const key = objectKey(urlOrPath);
  if (!key) return null;
  const { data } = await (supabase as any)
    .from("telegram_file_links").select("link")
    .eq("object_path", key).order("created_at", { ascending: false }).limit(1);
  return (data?.[0]?.link as string | undefined) ?? null;
}
