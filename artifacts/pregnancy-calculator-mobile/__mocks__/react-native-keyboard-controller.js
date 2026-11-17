/**
 * Manual Jest mock for react-native-keyboard-controller, applied automatically
 * to every test suite in this package.
 *
 * Why: the library checks for its native module at import time and throws
 * "doesn't seem to be linked" under Jest. Screens now import its
 * KeyboardAvoidingView through components/KeyboardAvoidingViewCompat.tsx, so
 * any suite that renders one of them needs this. The library ships an official
 * mock; this file just re-exports it. Suites that provide their own jest.mock
 * factory still take precedence.
 */
module.exports = jest.requireActual("react-native-keyboard-controller/jest");
