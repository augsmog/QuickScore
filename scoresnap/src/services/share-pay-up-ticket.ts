import { TICKET_CAPTURE } from '../ui/share/PayUpTicket';

export interface TicketShareDeps {
  /** Capture a mounted view to a PNG file and return its path. */
  capture(view: unknown, options: { format: 'png'; quality: number; result: 'tmpfile'; width: number; height: number }): Promise<string>;
  available(): Promise<boolean>;
  share(uri: string, options: { mimeType: string; UTI: string; dialogTitle: string }): Promise<void>;
}

// Loaded only when sharing: both need native code that web and tests do not have.
const native = (): TicketShareDeps => ({
  capture: (view, options) => require('react-native-view-shot').captureRef(view, options),
  available: () => require('expo-sharing').isAvailableAsync(),
  share: (uri, options) => require('expo-sharing').shareAsync(uri, options),
});

/**
 * Shares the Pay-up ticket as a 1080×1350 image. Returns false, without throwing, when the
 * image cannot be made or shared, so the caller can fall back to sharing the text result.
 */
export async function sharePayUpTicket(view: unknown, title: string, deps: TicketShareDeps = native()): Promise<boolean> {
  if (!view) return false;
  try {
    if (!(await deps.available())) return false;
    const uri = await deps.capture(view, { format: 'png', quality: 1, result: 'tmpfile', ...TICKET_CAPTURE });
    if (!uri) return false;
    await deps.share(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}
