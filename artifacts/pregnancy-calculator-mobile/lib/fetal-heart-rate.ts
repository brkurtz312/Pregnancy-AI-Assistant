import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export const FHR_KEY = "@fetal_heart_rate_v1";
export const FHR_DIR =
  (FileSystem.documentDirectory ?? "") + "fetal-heart-rate/";

export interface FhrRecording {
  id: string;
  uri: string;
  recordedAt: string;
  durationMs: number;
}

export async function ensureFhrDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(FHR_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(FHR_DIR, { intermediates: true });
  }
}

export async function loadFhrRecordings(): Promise<FhrRecording[]> {
  try {
    const raw = await AsyncStorage.getItem(FHR_KEY);
    return raw ? (JSON.parse(raw) as FhrRecording[]) : [];
  } catch {
    return [];
  }
}

async function saveFhrRecordings(list: FhrRecording[]): Promise<void> {
  await AsyncStorage.setItem(FHR_KEY, JSON.stringify(list));
}

export async function addFhrRecording(rec: FhrRecording): Promise<void> {
  const list = await loadFhrRecordings();
  await saveFhrRecordings([rec, ...list]);
}

export async function removeFhrRecording(id: string): Promise<FhrRecording[]> {
  const list = await loadFhrRecordings();
  const target = list.find((r) => r.id === id);
  if (target) {
    try {
      const info = await FileSystem.getInfoAsync(target.uri);
      if (info.exists) {
        await FileSystem.deleteAsync(target.uri, { idempotent: true });
      }
    } catch {
      // file may not exist; ignore
    }
  }
  const updated = list.filter((r) => r.id !== id);
  await saveFhrRecordings(updated);
  return updated;
}
