import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { configureHaptics } from "@/lib/haptics";

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
  setThemeAuto: (v: boolean) => void;
  setThemeMode: (v: ThemeMode) => void;
  setHapticsEnabled: (v: boolean) => void;
}

const defaultValue: SettingsContextValue = {
  themeAuto: true,
  themeMode: "light",
  hapticsEnabled: true,
  setThemeAuto: () => {},
  setThemeMode: () => {},
  setHapticsEnabled: () => {},
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

  useEffect(() => {
    async function load() {
      const [auto, mode, haptics] = await Promise.all([
        AsyncStorage.getItem(KEYS.themeAuto),
        AsyncStorage.getItem(KEYS.themeMode),
        AsyncStorage.getItem(KEYS.hapticsEnabled),
      ]);
      if (auto !== null) _setThemeAuto(auto === "true");
      if (mode === "light" || mode === "dark") _setThemeMode(mode);
      if (haptics !== null) {
        const enabled = haptics === "true";
        _setHapticsEnabled(enabled);
        configureHaptics(enabled);
      }
    }
    load();
  }, []);

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

  return (
    <SettingsContext.Provider
      value={{
        themeAuto,
        themeMode,
        hapticsEnabled,
        setThemeAuto,
        setThemeMode,
        setHapticsEnabled,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
