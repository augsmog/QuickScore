import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';

let sharing = false;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Resolves on sheet closure/download dispatch, never proof of recipient delivery. */
export async function shareScorecardPdf(pdf: Uint8Array, isCurrent: () => boolean = () => true): Promise<void> {
  if (sharing) throw new Error('PDF export already in progress');
  sharing = true;
  try {
    if (!isCurrent()) return;
    if (Platform.OS === 'web') {
      const bytes = new Uint8Array(pdf.length); bytes.set(pdf);
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: 'application/pdf' }));
      let link: HTMLAnchorElement | undefined;
      try {
        link = document.createElement('a'); link.href = url; link.download = 'scorecard.pdf';
        document.body.appendChild(link); link.click();
      } finally {
        link?.remove();
        // Allow the browser to start reading; also revoke on DOM/click failure.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return;
    }
    const available = await Sharing.isAvailableAsync();
    // Native availability is asynchronous: account/route/round can change while it resolves.
    if (!isCurrent()) return;
    if (!available) throw new Error('PDF sharing unavailable');
    const directory = new Directory(Paths.cache, 'scorecard-pdf-exports');
    directory.create({ idempotent: true, intermediates: true });
    // Only our expired files; preserve recent recipient access even after sheet closes.
    for (const entry of directory.list()) {
      if (entry instanceof File && /^scorecard-[0-9a-f-]+\.pdf$/.test(entry.name) &&
          entry.modificationTime !== null && Date.now() - entry.modificationTime > RETENTION_MS) {
        try { entry.delete(); } catch { /* Cleanup must not prevent a new export. */ }
      }
    }
    const file = new File(directory, `scorecard-${Crypto.randomUUID()}.pdf`);
    file.create({ overwrite: false });
    try { file.write(pdf); }
    catch (error) { try { file.delete(); } catch { /* Preserve original write failure. */ } throw error; }
    if (!isCurrent()) { try { file.delete(); } catch { /* Unshared cache file can expire normally. */ } return; }
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } finally { sharing = false; }
}
