import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "whats_new_last_seen_version";

/**
 * Returns the app version string from the Expo config (e.g. "1.0.1").
 * Falls back to an empty string when the config is unavailable (unit tests, etc.).
 */
function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "";
}

/**
 * Manages the one-time "What's New" sheet shown after a version upgrade.
 *
 * - `visible` — true when the current version has not been acknowledged.
 * - `dismiss` — persists the current version so the sheet never re-shows for it.
 */
export function useWhatsNew(): {
  visible: boolean;
  dismiss: () => Promise<void>;
} {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const currentVersion = getAppVersion();
    if (!currentVersion) return;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((lastSeen) => {
        if (lastSeen !== currentVersion) {
          setVisible(true);
        }
      })
      .catch(() => {
        // If storage is unreadable, silently skip the sheet.
      });
  }, []);

  const dismiss = useCallback(async () => {
    const currentVersion = getAppVersion();
    setVisible(false);
    if (currentVersion) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, currentVersion);
      } catch {
        // Best-effort; if we can't persist it the sheet will show again next
        // launch but that is preferable to crashing.
      }
    }
  }, []);

  return { visible, dismiss };
}
