import { describe, expect, it, vi } from "vitest";
import { deleteCaseRecords, visibleRevisionRounds } from "./case-records.server";

function database(records: Record<string, any[]>, storageError = false) {
  const removed: Record<string, string[]> = {};
  const db = {
    storage: { from: (bucket: string) => ({ remove: vi.fn(async (paths: string[]) => {
      if (storageError) return { error: { message: "storage unavailable" } };
      removed[bucket] = paths;
      return { error: null };
    }) }) },
    from: (table: string) => {
      let data = [...(records[table] ?? [])];
      let deleting = false;
      const builder: any = {
        select: () => builder,
        is: (key: string, value: unknown) => { data = data.filter(row => row[key] === value); return builder; },
        in: (key: string, values: unknown[]) => { data = data.filter(row => values.includes(row[key])); return builder; },
        order: () => builder,
        delete: () => { deleting = true; return builder; },
        then: (resolve: (value: unknown) => unknown) => {
          if (deleting) records[table] = records[table].filter(row => !data.includes(row));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { db, removed };
}

describe("case deletion", () => {
  it("does not return follow-up history for trashed or missing cases", async () => {
    const { db } = database({
      slot_cases: [{ id: "active", trashed_at: null }, { id: "trash", trashed_at: "2026-11-01" }],
      case_revision_rounds: [{ id: "r1", case_id: "active" }, { id: "r2", case_id: "trash" }, { id: "r3", case_id: "missing" }],
    });
    expect((await visibleRevisionRounds(db, null)).map((row: any) => row.id)).toEqual(["r1"]);
  });

  it("only returns a doctor's own active cases", async () => {
    const { db } = database({
      slot_cases: [{ id: "own", doctor_slot: 1, trashed_at: null }, { id: "other", doctor_slot: 2, trashed_at: null }],
      case_revision_rounds: [{ id: "r1", case_id: "own" }, { id: "r2", case_id: "other" }],
    });
    expect((await visibleRevisionRounds(db, [1])).map((row: any) => row.id)).toEqual(["r1"]);
  });

  it("deletes selected case files and follow-up logs without deleting other cases", async () => {
    const records = {
      slot_cases: [{ id: "selected", scan_path: "scan.zip", archive_receipt_path: "receipt.jpg", design_html_path: "design.html" }, { id: "keep" }],
      case_revision_rounds: [{ id: "r1", case_id: "selected", rar_path: "revision.rar", html_path: "design.html" }, { id: "r2", case_id: "keep" }],
      file_activity: [{ case_id: "selected" }, { case_id: "keep" }],
    };
    const { db, removed } = database(records);
    await deleteCaseRecords(db, ["selected"], "https://storage.example.com");
    expect(removed).toEqual({ "case-files": ["scan.zip"], "chat-attachments": ["design.html", "receipt.jpg", "revision.rar"] });
    expect(records.slot_cases).toEqual([{ id: "keep" }]);
    expect(records.case_revision_rounds).toEqual([{ id: "r2", case_id: "keep" }]);
    expect(records.file_activity).toEqual([{ case_id: "keep" }]);
  });

  it("keeps database records when storage cleanup fails so deletion can be retried", async () => {
    const records = { slot_cases: [{ id: "selected", scan_path: "scan.zip" }], case_revision_rounds: [], file_activity: [] };
    const { db } = database(records, true);
    await expect(deleteCaseRecords(db, ["selected"], "https://storage.example.com")).rejects.toThrow("storage unavailable");
    expect(records.slot_cases).toHaveLength(1);
  });
});