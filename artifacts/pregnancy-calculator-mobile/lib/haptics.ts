import * as Haptics from "expo-haptics";

let _enabled = true;

export function configureHaptics(enabled: boolean): void {
  _enabled = enabled;
}

export function impact(style: Haptics.ImpactFeedbackStyle): void {
  if (_enabled) Haptics.impactAsync(style);
}

export function notification(type: Haptics.NotificationFeedbackType): void {
  if (_enabled) Haptics.notificationAsync(type);
}
