import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAdmin } from "../supabase";

const FIELDS =
  "id,case_code,patient_name,patient_phone,doctor_slot,case_type,created_at,design_done,fabrication_done,archived,final_archived,notes";

type CaseRow = {
  id: string; case_code: string; patient_name: string; patient_phone: string | null;
  doctor_slot: number; case_type: string | null; created_at: string; design_done: boolean;
  fabrication_done: boolean; archived: boolean; final_archived: boolean; notes: string | null;
};

const toJson = (c: CaseRow) => ({
  id: c.id, case_code: c.case_code, patient_name: c.patient_name, patient_phone: c.patient_phone,
  doctor_slot: c.doctor_slot, case_type: c.case_type, created_at: c.created_at,
  design_done: c.design_done, fabrication_done: c.fabrication_done,
  archived: c.archived, final_archived: c.final_archived, notes: c.notes,
});

async function guard(ctx: Parameters<typeof requireAdmin>[0]) {
  try { return await requireAdmin(ctx); } catch (e) { throw new ToolError((e as Error).message); }
}

export const listCasesTool = defineTool({
  name: "list_cases",
  title: "List cases",
  description: "List the most recent lab cases, optionally filtered by patient name or doctor slot.",
  inputSchema: {
    search: z.string().max(100).optional().describe("Part of the patient name."),
    doctor_slot: z.number().int().optional().describe("Doctor slot number."),
    limit: z.number().int().min(1).max(100).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, doctor_slot, limit }, ctx) => {
    const db = await guard(ctx);
    let q = db.from("slot_cases").select(FIELDS).order("created_at", { ascending: false }).limit(limit);
    if (search) q = q.ilike("patient_name", `%${search}%`);
    if (typeof doctor_slot === "number") q = q.eq("doctor_slot", doctor_slot);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const cases = ((data ?? []) as CaseRow[]).map(toJson);
    return { content: [{ type: "text", text: JSON.stringify(cases) }], structuredContent: { cases } };
  },
});

export const getCaseTool = defineTool({
  name: "get_case",
  title: "Get case",
  description: "Get one lab case by its case code (for example ZJ-260920-26eb).",
  inputSchema: { case_code: z.string().min(3).max(60) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ case_code }, ctx) => {
    const db = await guard(ctx);
    const { data, error } = await db.from("slot_cases").select(FIELDS).eq("case_code", case_code).maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Case not found");
    const c = toJson(data as CaseRow);
    return { content: [{ type: "text", text: JSON.stringify(c) }], structuredContent: { case: c } };
  },
});
