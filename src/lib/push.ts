/**
 * Web Push subscription client.
 *
 * Registers a dedicated messaging service worker (`/push-sw.js`) and subscribes
 * the current device to Web Push so a staff member receives a system
 * notification (with the device's notification sound) when a message / file /
 * case arrives from another staff member — EVEN when the app is fully closed.
 *
 * The matching VAPID public key below is public by design (it is shipped to
 * every browser to create the subscription). The private key lives only on the
 * server (push_config table) and never reaches the client.
 */

import { supabase } from "@/integrations/supabase/client";
import type { RoleKey } from "@/lib/chat";

// Public VAPID key (raw, base64url). Safe to expose.
const VAPID_PUBLIC_KEY =
  "BHeX6aQuNKZVsn4ro6RMMfC-vks0_gPmSW72D1KPqiHLE8ilDg9Ch7O6ykUoyHbkXHtBgojkyioRXBFlIJv8-PA";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let swReg: ServiceWorkerRegistration | null = null;

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  if (swReg) return swReg;
  try {
    swReg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return swReg;
  } catch {
    return null;
  }
}

/**
 * Subscribe this device for the given role (and doctor slot, if applicable),
 * then persist the subscription server-side. Best-effort: returns false on any
 * failure (unsupported browser, denied permission, network error).
 */
export async function enablePushForRole(role: RoleKey, slot?: number | null): Promise<boolean> {
  try {
    if (!pushSupported()) return false;
    if (Notification.permission !== "granted") return false;
    const reg = await getRegistration();
    if (!reg) return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const p256dh = json.keys?.p256dh ?? bufToBase64Url(sub.getKey("p256dh"));
    const auth = json.keys?.auth ?? bufToBase64Url(sub.getKey("auth"));
    if (!sub.endpoint || !p256dh || !auth) return false;

    const { error } = await supabase.rpc("save_push_subscription", {
      p_role: role,
      p_slot: (slot ?? null) as unknown as number,
      p_endpoint: sub.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: navigator.userAgent.slice(0, 300),
    });
    return !error;
  } catch {
    return false;
  }
}

/** Remove this device's push subscription (best-effort). */
export async function disablePush(): Promise<void> {
  try {
    const reg = await getRegistration();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch {
    /* noop */
  }
}
