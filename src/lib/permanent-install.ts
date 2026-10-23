import { z } from "zod";

export const permanentInstallSchema = z.object({
  caseId: z.string().uuid(),
  remaining: z.number().finite().nonnegative(),
  note: z.string().trim().max(2000),
  receipt: z.object({
    path: z.string().min(1).max(600),
    name: z.string().min(1).max(255),
    mime: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/),
    size: z.number().int().positive(),
  }).optional(),
});

export function canConfirmPermanentInstall(role: string, slot: number | null, caseSlot: number): boolean {
  return role === "admin" || (role === "doctor" && slot === caseSlot);
}