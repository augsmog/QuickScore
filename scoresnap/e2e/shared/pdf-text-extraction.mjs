import { execFileSync } from "node:child_process";

export function extractPdfText(pdfPath, execute = execFileSync) {
  try {
    return { status: "available", text: execute("pdftotext", [pdfPath, "-"], { encoding: "utf8" }) };
  } catch (error) {
    if (error?.code === "ENOENT" && error.path === "pdftotext") {
      return { status: "unknown", detail: "pdftotext is unavailable; PDF contents were not checked" };
    }
    throw error;
  }
}
