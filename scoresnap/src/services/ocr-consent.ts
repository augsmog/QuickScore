import { Alert } from 'react-native';
import { useSettingsStore } from '../stores/settings-store';
export const OCR_CONSENT_TEXT = "Scorecard photos are sent to Anthropic (Claude), an AI service, to read your scores.";
let pending: Promise<boolean> | undefined;
export async function requestOCRConsent(): Promise<boolean> {
  await useSettingsStore.persist.rehydrate();
  const choice = useSettingsStore.getState().ocrConsent;
  if (choice !== null) return choice;
  if (!pending) pending = new Promise<boolean>(resolve => {
    const choose = (allowed: boolean) => {
      useSettingsStore.getState().updateSetting('ocrConsent', allowed);
      resolve(allowed);
      pending = undefined;
    };
    Alert.alert('Cloud scorecard scanning', OCR_CONSENT_TEXT, [
      {text: "Don't allow", style:'cancel', onPress:()=>choose(false)},
      {text:'Allow', onPress:()=>choose(true)},
    ], {cancelable:false});
  });
  return pending;
}
