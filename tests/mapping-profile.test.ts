import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMappingProfile } from "../app/lib/mapping-profile";

test("accepts and trims company mapping assignments", () => {
  assert.deepEqual(sanitizeMappingProfile({ "income:revenue": " Net Sales ", "sheet:balance": "Balance Sheet" }), {
    "income:revenue": "Net Sales",
    "sheet:balance": "Balance Sheet",
  });
});

test("rejects invalid mapping keys", () => {
  assert.throws(() => sanitizeMappingProfile({ "other:revenue": "Sales" }), /Invalid mapping key/);
});

test("rejects empty and oversized source labels", () => {
  assert.throws(() => sanitizeMappingProfile({ "income:revenue": "" }), /Invalid source account/);
  assert.throws(() => sanitizeMappingProfile({ "income:revenue": "x".repeat(201) }), /Invalid source account/);
});
