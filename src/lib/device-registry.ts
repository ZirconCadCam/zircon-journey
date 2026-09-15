import { supabase } from "@/integrations/supabase/client";
import { STAFF_PASSWORDS } from "@/lib/chat";

export interface DeviceRow {
  device_id: string;
  label: string | null;
  user_agent: string | null;
  platform: string | null;
  ip: string | null;
  last_role: string | null;
  last_path: string | null;
  visits: number;
  blocked: boolean;
  blocked_at: string | null;
  first_seen: string;
  last_seen: string;
}

const ADMIN_PW = STAFF_PASSWORDS.admin;

/** Stable per-browser device identifier (shared with the staff portal). */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("zircon_device_id");
  if (!id) {
    id = (crypto as any)?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("zircon_device_id", id as string);
  }
  return id as string;
}

/** Human friendly device name derived from the user-agent string. */
export function describeDevice(ua: string | null, platform: string | null): string {
  const s = ua ?? "";
  const os =
    /iPhone/i.test(s) ? "iPhone" :
    /iPad/i.test(s) ? "iPad" :
    /Android/i.test(s) ? "Android" :
    /Windows/i.test(s) ? "Windows" :
    /Mac OS X|Macintosh/i.test(s) ? "Mac" :
    /Linux/i.test(s) ? "Linux" : (platform || "غير معروف");
  const br =
    /Edg\//i.test(s) ? "Edge" :
    /OPR\//i.test(s) ? "Opera" :
    /Chrome\//i.test(s) ? "Chrome" :
    /Firefox\//i.test(s) ? "Firefox" :
    /Safari\//i.test(s) ? "Safari" : "متصفح";
  return `${os} • ${br}`;
}

export async function listDevices(): Promise<DeviceRow[]> {
  const { data, error } = await supabase.rpc("list_devices", { p_admin_password: ADMIN_PW });
  if (error) throw new Error(error.message);
  return (data as DeviceRow[]) ?? [];
}

export async function setDeviceBlocked(deviceId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_device_blocked", {
    p_device_id: deviceId, p_blocked: blocked, p_admin_password: ADMIN_PW,
  });
  if (error) throw new Error(error.message);
}

export async function setDeviceLabel(deviceId: string, label: string): Promise<void> {
  const { error } = await supabase.rpc("set_device_label", {
    p_device_id: deviceId, p_label: label, p_admin_password: ADMIN_PW,
  });
  if (error) throw new Error(error.message);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_device", {
    p_device_id: deviceId, p_admin_password: ADMIN_PW,
  });
  if (error) throw new Error(error.message);
}

/** Live check used by the block guard. */
export async function isDeviceBlocked(deviceId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_device_blocked", { p_device_id: deviceId });
  if (error) return false;
  return Boolean(data);
}
