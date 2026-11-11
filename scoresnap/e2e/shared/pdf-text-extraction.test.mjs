import assert from "node:assert/strict";
import { test } from "node:test";
import { failedCheckCount, recordCheck } from "./check-results.mjs";
import { extractPdfText } from "./pdf-text-extraction.mjs";

test("extractPdfText returns text when pdftotext is available", () => {
  const calls = [];
  const result = extractPdfText("scorecard.pdf", (...args) => {
    calls.push(args);
    return "Sam: +$26.25";
  });

  assert.deepEqual(result, { status: "available", text: "Sam: +$26.25" });
  assert.equal(calls[0][0], "pdftotext");
  assert.deepEqual(calls[0][1], ["scorecard.pdf", "-"]);
});

test("a missing pdftotext executable records UNKNOWN without counting as a pass or failure", () => {
  const result = extractPdfText("scorecard.pdf", () => {
    const error = new Error("spawn pdftotext ENOENT");
    error.code = "ENOENT";
    error.path = "pdftotext";
    throw error;
  });

  assert.equal(result.status, "unknown");
  const checks = [];
  recordCheck(checks, result.status, "PDF ledger text", result.detail);
  assert.equal(checks[0].ok, null);
  assert.equal(failedCheckCount(checks), 0);
});

test("real PDF extraction failures remain failures", () => {
  const error = Object.assign(new Error("invalid PDF"), { code: 1, path: "pdftotext" });
  assert.throws(() => extractPdfText("scorecard.pdf", () => { throw error; }), error);
});

test("failedCheckCount counts failures but excludes unknown checks", () => {
  const checks = [];
  recordCheck(checks, "pass", "ledger", "matches");
  recordCheck(checks, "unknown", "PDF", "pdftotext missing");
  recordCheck(checks, "fail", "geometry", "clipped");
  assert.equal(failedCheckCount(checks), 1);
});
