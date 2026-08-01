/**
 * getWeeklyTips
 *
 * Returns 3–5 Apple Watch tips tailored to the current gestational week.
 * Content is derived from the existing weekly fetal-development data so that
 * tips stay consistent with what the user sees in the Learn tab.
 */

import { fetalDevelopmentData } from "./fetal-development";
import type { WatchTip } from "@/hooks/useWatchConnectivity";

/**
 * Returns week-specific tips for the Apple Watch.
 *
 * @param week - Current gestational week (1–42).  Out-of-range values receive
 *               a small set of universal fallback tips.
 */
export function getWeeklyTips(week: number): WatchTip[] {
  const data = fetalDevelopmentData[week];

  if (!data) {
    // Generic fallback for weeks outside the data set
    return [
      {
        week,
        emoji: "👶",
        text: `Week ${week}: Baby is growing every day.`,
      },
      {
        week,
        emoji: "💧",
        text: "Stay hydrated — aim for 8–10 glasses of water daily.",
      },
      {
        week,
        emoji: "🚶",
        text: "Gentle walks help circulation and mood.",
      },
    ];
  }

  const tips: WatchTip[] = [];

  // Tip 1 – baby size/comparison
  tips.push({
    week,
    emoji: "📏",
    text: `Week ${week}: Baby is about ${data.size} — the size of ${data.sizeComparison}.`,
  });

  // Tip 2 – first baby development milestone for the week
  if (data.development.length > 0) {
    tips.push({
      week,
      emoji: "👶",
      text: data.development[0],
    });
  }

  // Tip 3 – first mother change for the week
  if (data.motherChanges.length > 0) {
    tips.push({
      week,
      emoji: "💕",
      text: data.motherChanges[0],
    });
  }

  // Tip 4 – second baby development milestone (if available)
  if (data.development.length > 1) {
    tips.push({
      week,
      emoji: "🌱",
      text: data.development[1],
    });
  }

  // Tip 5 – coming-up preview
  if (data.comingUp) {
    tips.push({
      week,
      emoji: "🔮",
      text: data.comingUp,
    });
  }

  return tips;
}
