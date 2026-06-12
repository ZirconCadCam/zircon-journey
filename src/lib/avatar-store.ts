import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live store for admin-assigned avatar photos (doctors + designer + technician).
 *
 * Rows live in the `avatar_overrides` table keyed by `subject`:
 *   - doctors:     "doctor:<slot>"   (e.g. "doctor:3")
 *   - staff roles: "role:designer" | "role:technician"
 *
 * The cache loads once, stays fresh via realtime, and notifies React
 * subscribers so any <DoctorAvatar/> re-renders the moment a photo is assigned.
 */

export interface AvatarOverride {
  subject: string;
  image_url: string;
  label: string | null;
}

let cache = new Map<string, string>();
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export async function loadAvatarOverrides() {
  const { data } = await supabase
    .from("avatar_overrides")
    .select("subject,image_url,label");
  cache = new Map((data ?? []).map((r: any) => [r.subject as string, r.image_url as string]));
  emit();
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  void loadAvatarOverrides();
  supabase
    .channel("avatar-overrides-rt")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "avatar_overrides" },
      () => void loadAvatarOverrides(),
    )
    .subscribe();
}

function subscribe(cb: () => void) {
  ensureLoaded();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Subscribe a component to avatar changes; returns a version counter. */
export function useAvatarVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/** Subject keys */
export const doctorSubject = (slot: number) => `doctor:${slot}`;
export const roleSubject = (role: "designer" | "technician") => `role:${role}`;

/** Synchronous lookup of an override URL by subject (null if none). */
export function getOverrideUrl(subject: string | null | undefined): string | null {
  ensureLoaded();
  if (!subject) return null;
  return cache.get(subject) ?? null;
}

/** Assign (or replace) a photo for a subject. */
export async function setAvatarOverride(subject: string, imageUrl: string, label: string) {
  const { error } = await supabase.rpc("set_avatar_override", {
    p_subject: subject,
    p_image_url: imageUrl,
    p_label: label,
  });
  if (!error) await loadAvatarOverrides();
  return error;
}

/** Remove a photo assignment for a subject. */
export async function clearAvatarOverride(subject: string) {
  const { error } = await supabase.rpc("clear_avatar_override", { p_subject: subject });
  if (!error) await loadAvatarOverrides();
  return error;
}
