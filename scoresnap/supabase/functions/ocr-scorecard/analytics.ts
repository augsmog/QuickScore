type OcrAnalyticsInput = {
  success: boolean;
  latencyMs: number;
  playerCount?: number;
  scoreCount?: number;
};

type OcrAnalyticsOptions = {
  projectToken?: string;
  host?: string;
  fetchImpl?: typeof fetch;
  anonymousId?: () => string;
};

/** Sends only anonymous processing metrics; image and model content never enter analytics. */
export async function captureOcrAnalytics(
  input: OcrAnalyticsInput,
  options: OcrAnalyticsOptions = {},
): Promise<void> {
  const projectToken = options.projectToken;
  const host = options.host;
  if (!projectToken || !host) return;

  const properties = {
    distinct_id: (options.anonymousId ?? (() => crypto.randomUUID()))(),
    success: input.success,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    player_count: count(input.playerCount),
    score_count: count(input.scoreCount),
  };

  try {
    await (options.fetchImpl ?? fetch)(new URL("/i/v0/e/", host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: projectToken,
        event: "ocr_scorecard_processed",
        properties,
      }),
    });
  } catch {
    // Analytics is best-effort and must never affect OCR processing.
  }
}

function count(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
}
