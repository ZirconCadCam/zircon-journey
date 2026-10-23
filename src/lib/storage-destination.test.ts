import { describe, expect, it } from "vitest";
import { parseTrustedStorageUrl, validateStorageObject } from "./storage-destination";

const origin = "https://storage.example.test";
describe("file delivery destinations", () => {
  it("accepts only configured storage URLs and known buckets", () => {
    expect(parseTrustedStorageUrl(`${origin}/storage/v1/object/sign/case-files/case/report.zip?token=test`, origin)).toEqual({ bucket: "case-files", path: "case/report.zip" });
    for (const url of [
      "http://storage.example.test/storage/v1/object/sign/case-files/a.zip",
      "https://evil.test/storage/v1/object/sign/case-files/a.zip",
      "https://storage.example.test:8443/storage/v1/object/sign/case-files/a.zip",
      "https://user@storage.example.test/storage/v1/object/sign/case-files/a.zip",
      `${origin}/storage/v1/object/sign/expense-receipts/a.zip`,
      `${origin}/anything`,
      `${origin}/storage/v1/object/sign/case-files/a%2F..%2Fb.zip`,
      `${origin}/storage/v1/object/sign/case-files/a%252f..%252fb.zip`,
    ]) expect(() => parseTrustedStorageUrl(url, origin)).toThrow();
  });
  it("rejects explicit traversal and invalid buckets", () => {
    for (const path of ["../a", "a/../b", "a\\b", "/a", "a//b", "a/%2e%2e/b", "a\u0000b"]) {
      expect(() => validateStorageObject("case-files", path)).toThrow();
    }
    expect(() => validateStorageObject("other", "a.zip")).toThrow();
  });
});