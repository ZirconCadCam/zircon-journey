export const PORTAL_KEYS = ["doctor", "designer", "technician"] as const;
export type PortalKey = (typeof PORTAL_KEYS)[number];
export const settingKey = (k: PortalKey) => `${k}_password_required`;

/** A password-free ticket stays valid only while the password is still off and unchanged since issue. */
export function openTicketStillValid(setting: { required: boolean; updatedAt: number }, issuedAt: number): boolean {
  return !setting.required && setting.updatedAt <= issuedAt;
}
