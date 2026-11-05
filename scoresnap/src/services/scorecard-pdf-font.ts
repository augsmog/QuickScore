import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

let loading: Promise<Uint8Array> | undefined;
/** Resolve only the app's existing bundled font; no third-party font service. */
export function loadScorecardPdfFont(): Promise<Uint8Array> {
  if (!loading) loading = (async () => {
    const asset = Asset.fromModule(require('../../assets/fonts/SourceSans3_400Regular.ttf'));
    if (Platform.OS === 'web') {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('PDF font unavailable');
      return new Uint8Array(await response.arrayBuffer());
    }
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('PDF font unavailable locally');
    return new File(asset.localUri).bytes();
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
