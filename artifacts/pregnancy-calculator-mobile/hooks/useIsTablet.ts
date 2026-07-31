import { useWindowDimensions } from "react-native";

/**
 * Returns true when the device screen width is at least 768 pt — the minimum
 * width for all iPad models. Safe to call during layout; re-renders when the
 * window size changes (e.g. iPad Split View).
 */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= 768;
}
