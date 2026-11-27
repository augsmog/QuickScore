// One `app_opened` per start of the app, sent by the app itself. The SDK's own lifecycle events are
// off (src/config/posthog.tsx): they include two events every time the phone is woken.
type CaptureClient = { capture(event: string): unknown };

let reported = false;

export function reportAppOpened(client: CaptureClient | null | undefined): void {
  if (reported || !client) return;
  reported = true;
  client.capture("app_opened");
}

export function resetAppOpenedForTests(): void {
  reported = false;
}
