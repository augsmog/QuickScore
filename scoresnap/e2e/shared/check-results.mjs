const VALID_STATUSES = new Set(["pass", "fail", "unknown"]);

export function recordCheck(results, status, name, detail = "") {
  if (!VALID_STATUSES.has(status)) throw new TypeError(`Invalid check status: ${status}`);
  const result = { status, ok: status === "pass" ? true : status === "fail" ? false : null, name, detail };
  results.push(result);
  return result;
}

export function failedCheckCount(results) {
  return results.filter((result) => result.status === "fail").length;
}
