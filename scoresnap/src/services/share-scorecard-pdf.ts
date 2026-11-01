import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export async function shareScorecardPdf(pdf: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scorecard.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the object URL alive until the browser has started reading the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!FileSystem.cacheDirectory) throw new Error('PDF cache unavailable');
  const url = `${FileSystem.cacheDirectory}scorecard-${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(url, pdf, { encoding: FileSystem.EncodingType.UTF8 });
  await Share.share({ url });
}
