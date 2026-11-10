/**
 * Manual Jest mock for expo-audio, applied automatically to every test suite
 * in this package (it replaced expo-av, which Expo removed in SDK 55).
 *
 * Why: expo-audio loads its native module at import time, which throws in
 * Jest. Suites that provide their own jest.mock factory still take precedence.
 */

function makeRecorder() {
  return {
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    getStatus: jest.fn(() => ({ durationMillis: 0, isRecording: false })),
    uri: null,
  };
}

function makePlayer() {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
}

const recorder = makeRecorder();

module.exports = {
  useAudioRecorder: jest.fn(() => recorder),
  createAudioPlayer: jest.fn(() => makePlayer()),
  setAudioModeAsync: jest.fn(async () => {}),
  getRecordingPermissionsAsync: jest.fn(async () => ({
    status: "granted",
    granted: true,
  })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({
    status: "granted",
    granted: true,
  })),
  RecordingPresets: { HIGH_QUALITY: {} },
};
