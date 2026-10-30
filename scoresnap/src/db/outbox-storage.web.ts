import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnvelopeStorage } from '../services/score-outbox';
export const outboxStorage: EnvelopeStorage = {
  getItem: key => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};
