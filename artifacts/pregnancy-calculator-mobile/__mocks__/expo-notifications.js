/**
 * Manual Jest mock for expo-notifications, applied automatically to every
 * test suite in this package (node-module manual mocks adjacent to
 * node_modules are used without an explicit jest.mock call).
 *
 * Why: the real expo-notifications module has import-time side effects
 * (console warnings, native-module probing).  Several suites mock it with
 * inline jest.mock factories; suites that DON'T mock it (but transitively
 * import lib/milestone-notifications.ts or appointment-reminders.ts via
 * screens) would otherwise load the real module.  Under parallel full-suite
 * runs this produced intermittent failures where the library captured the
 * real module instead of a test's mock.  A package-level manual mock makes
 * the resolution deterministic; suites with their own jest.mock factory
 * still take precedence.
 */
module.exports = {
  SchedulableTriggerInputTypes: { DATE: "date" },
  scheduleNotificationAsync: jest.fn(async () => "manual-mock-notif-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
};
