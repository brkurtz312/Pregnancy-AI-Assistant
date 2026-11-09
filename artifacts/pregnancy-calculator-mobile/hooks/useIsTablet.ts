import { useWindowDimensions } from "react-native";

/**
 * Minimum window width (pt) for the tablet layout: the sidebar instead of the
 * bottom tab bar, and content centred at a comfortable reading width.
 *
 * 600 pt rather than the old 768 (the narrowest iPad) so the unfolded inner
 * screen of iPhone Duo — about 669 pt wide — gets the tablet layout instead
 * of a stretched phone layout. Every iPhone, and the Duo's folded outer
 * screen (about 466 pt), stays well below it.
 */
export const TABLET_MIN_WIDTH = 600;

/**
 * Returns true when the current window is at least TABLET_MIN_WIDTH wide.
 * Safe to call during layout; re-renders when the window size changes
 * (iPad Split View, or folding/unfolding an iPhone Duo).
 */
export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_MIN_WIDTH;
}
