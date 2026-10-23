/**
 * App-wide entry gate: one shared password (APP_GATE_PASSWORD) opens the app
 * on a device for 30 days. Checked on the server; returns a signed token.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const enc = new TextEncoder();

async function hmac(text: string): Promise<string> {
  const secret = process.env["STAFF_TICKET_SECRET"];
  if (!secret || secret.length < 32) throw new Error("STAFF_TICKET_SECRET غير مُهيّأ.");
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("gate:" + text)));
  let s = "";
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function digest(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const unlockApp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env["APP_GATE_PASSWORD"];
    if (!expected) return { ok: false as const, error: "كلمة مرور التطبيق غير مُهيّأة." };
    if ((await digest(data.password.trim())) !== (await digest(expected))) {
      return { ok: false as const, error: "كلمة المرور غير صحيحة" };
    }
    const exp = String(Date.now() + GATE_TTL_MS);
    return { ok: true as const, token: `${exp}.${await hmac(exp)}` };
  });

export const checkAppGate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const [exp, sig] = data.token.split(".");
    if (!exp || !sig || !(Number(exp) > Date.now())) return { ok: false };
    return { ok: (await hmac(exp)) === sig };
  });
