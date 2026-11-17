import type { KeyboardAvoidingViewProps } from "react-native";
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
} from "react-native";
import { KeyboardAvoidingView as KCKeyboardAvoidingView } from "react-native-keyboard-controller";

type Props = Omit<KeyboardAvoidingViewProps, "behavior">;

/**
 * Keeps focused inputs above the on-screen keyboard on every platform.
 *
 * Android: the app is wrapped in react-native-keyboard-controller's
 * KeyboardProvider (app/_layout.tsx), which takes over keyboard insets and
 * draws edge-to-edge. The window no longer resizes for the keyboard, so React
 * Native's KeyboardAvoidingView with `behavior={undefined}` (the old pattern)
 * did nothing and the keyboard could cover inputs. The library's own
 * KeyboardAvoidingView reads the keyboard height from the provider and pads
 * the content instead.
 *
 * iOS: unchanged — React Native's KeyboardAvoidingView with "padding", exactly
 * as before, so this component cannot alter iOS layout.
 *
 * Web: React Native Web's KeyboardAvoidingView with no behavior, as before.
 */
export function KeyboardAvoidingViewCompat(props: Props) {
  if (Platform.OS === "android") {
    return <KCKeyboardAvoidingView behavior="padding" {...props} />;
  }
  return (
    <RNKeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      {...props}
    />
  );
}
