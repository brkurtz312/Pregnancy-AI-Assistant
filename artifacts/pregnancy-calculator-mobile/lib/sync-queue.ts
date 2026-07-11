import AsyncStorage from "@react-native-async-storage/async-storage";

export type SyncKey = "hospital-bag" | "birth-plan" | "journal";

const PREFIX = "pending_sync:";

export async function markPendingSync(key: SyncKey): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${key}`, "1");
}

export async function clearPendingSync(key: SyncKey): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${key}`);
}

export async function hasPendingSync(key: SyncKey): Promise<boolean> {
  const v = await AsyncStorage.getItem(`${PREFIX}${key}`);
  return v !== null;
}
