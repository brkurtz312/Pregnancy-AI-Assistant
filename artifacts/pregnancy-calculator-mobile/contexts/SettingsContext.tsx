import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { configureHaptics } from "@/lib/haptics";
import {
  DEFAULT_MILESTONE_PREFERENCES,
  readMilestonePreferences,
  updateMilestonePreferences,
  type MilestonePreferences,
} from "@/lib/milestone-notifications";

export type ThemeMode = "light" | "dark";

const KEYS = {
  themeAuto: "@settings/theme_auto",
  themeMode: "@settings/theme_mode",
  hapticsEnabled: "@settings/haptics_enabled",
} as const;

interface SettingsContextValue {
  themeAuto: boolean;
  themeMode: ThemeMode;
  hapticsEnabled: boolean;
  /** Master switch for all milestone reminders. */
  milestoneRemindersEnabled: boolean;
  /** Gestational weeks the user has individually disabled. */
  disabledMilestoneWeeks: number[];
  setThemeAuto: (v: boolean) => void;
  setThemeMode: (v: ThemeMode) => void;
  setHapticsEnabled: (v: boolean) => void;
  setMilestoneRemindersEnabled: (v: boolean) => void;
  setMilestoneWeekEnabled: (week: number, enabled: boolean) => void;
}

const defaultValue: SettingsContextValue = {
  themeAuto: true,
  themeMode: "light",
  hapticsEnabled: true,
  milestoneRemindersEnabled: true,
  disabledMilestoneWeeks: [],
  setThemeAuto: () => {},
  setThemeMode: () => {},
  setHapticsEnabled: () => {},
  setMilestoneRemindersEnabled: () => {},
  setMilestoneWeekEnabled: () => {},
};

export const SettingsContext =
  createContext<SettingsContextValue>(defaultValue);

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [themeAuto, _setThemeAuto] = useState(true);
  const [themeMode, _setThemeMode] = useState<ThemeMode>("light");
  const [hapticsEnabled, _setHapticsEnabled] = useState(true);
  const [milestonePrefs, _setMilestonePrefs] = useState<MilestonePreferences>({
    ...DEFAULT_MILESTONE_PREFERENCES,
  });
  // Generation counter guarding the async loads of milestone prefs: a sign-out
  // reset bumps it so any load that started earlier cannot overwrite the reset
  // with stale (previous user's) preferences.
  const milestonePrefsGenRef = useRef(0);

  const { isSignedIn } = useAuth();
  const prevSignedInRef = useRef(isSignedIn);

  useEffect(() => {
    const gen = milestonePrefsGenRef.current;
    async function load() {
      const [auto, mode, haptics, milestone] = await Promise.all([
        AsyncStorage.getItem(KEYS.themeAuto),
        AsyncStorage.getItem(KEYS.themeMode),
        AsyncStorage.getItem(KEYS.hapticsEnabled),
        readMilestonePreferences(),
      ]);
      if (auto !== null) _setThemeAuto(auto === "true");
      if (mode === "light" || mode === "dark") _setThemeMode(mode);
      if (haptics !== null) {
        const enabled = haptics === "true";
        _setHapticsEnabled(enabled);
        configureHaptics(enabled);
      }
      // Milestone prefs are user-scoped: drop the result if a sign-out reset
      // happened while this load was in flight.
      if (milestonePrefsGenRef.current === gen) {
        _setMilestonePrefs(milestone);
      }
    }
    load();
  }, []);

  // Milestone reminder preferences are user-scoped.  On sign-out the storage
  // key is cleared (cancelAllMilestoneNotifications in AuthTokenBridge); reset
  // the in-memory state too so the next account never sees — or re-persists —
  // the previous account's toggles.
  useEffect(() => {
    const wasSignedIn = prevSignedInRef.current;
    prevSignedInRef.current = isSignedIn;
    if (wasSignedIn && !isSignedIn) {
      milestonePrefsGenRef.current += 1;
      _setMilestonePrefs({ ...DEFAULT_MILESTONE_PREFERENCES });
    }
  }, [isSignedIn]);

  const setThemeAuto = useCallback((v: boolean) => {
    _setThemeAuto(v);
    AsyncStorage.setItem(KEYS.themeAuto, String(v));
  }, []);

  const setThemeMode = useCallback((v: ThemeMode) => {
    _setThemeMode(v);
    AsyncStorage.setItem(KEYS.themeMode, v);
  }, []);

  const setHapticsEnabled = useCallback((v: boolean) => {
    _setHapticsEnabled(v);
    configureHaptics(v);
    AsyncStorage.setItem(KEYS.hapticsEnabled, String(v));
  }, []);

  const applyMilestonePrefs = useCallback(
    (update: (current: MilestonePreferences) => MilestonePreferences) => {
      // Optimistic UI update...
      _setMilestonePrefs((prev) => update(prev));
      // ...then persist + resync atomically through the serialized queue in
      // milestone-notifications.ts.  The update callback re-derives the next
      // preferences from the persisted state, so rapid successive toggles
      // compose instead of clobbering each other.
      updateMilestonePreferences(update).catch(() => {
        // best-effort — a persistence failure should not crash the UI
      });
    },
    [],
  );

  const setMilestoneRemindersEnabled = useCallback(
    (v: boolean) => {
      applyMilestonePrefs((current) => ({
        masterEnabled: v,
        disabledWeeks: current.disabledWeeks,
      }));
    },
    [applyMilestonePrefs],
  );

  const setMilestoneWeekEnabled = useCallback(
    (week: number, enabled: boolean) => {
      applyMilestonePrefs((current) => ({
        masterEnabled: current.masterEnabled,
        disabledWeeks: enabled
          ? current.disabledWeeks.filter((w) => w !== week)
          : Array.from(new Set([...current.disabledWeeks, week])),
      }));
    },
    [applyMilestonePrefs],
  );

  return (
    <SettingsContext.Provider
      value={{
        themeAuto,
        themeMode,
        hapticsEnabled,
        milestoneRemindersEnabled: milestonePrefs.masterEnabled,
        disabledMilestoneWeeks: milestonePrefs.disabledWeeks,
        setThemeAuto,
        setThemeMode,
        setHapticsEnabled,
        setMilestoneRemindersEnabled,
        setMilestoneWeekEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
