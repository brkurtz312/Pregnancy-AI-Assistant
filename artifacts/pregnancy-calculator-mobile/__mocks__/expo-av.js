/**
 * Manual Jest mock for expo-av, applied automatically to every test suite in
 * this package.
 *
 * Why: expo-av imports the ExponentAV native module at load time, which throws
 * "Cannot find native module 'ExponentAV'" in the Jest environment.  Any test
 * suite that transitively imports a component using expo-av (e.g.
 * MediaViewerModal.tsx) fails with this error without a mock.  A package-level
 * manual mock resolves this deterministically; suites that provide their own
 * jest.mock factory for expo-av still take precedence.
 */

const React = require("react");

const Video = React.forwardRef(function Video(_props, _ref) {
  return null;
});

const Audio = {
  setAudioModeAsync: jest.fn(async () => {}),
  Sound: {
    createAsync: jest.fn(async () => ({
      sound: { playAsync: jest.fn(), unloadAsync: jest.fn() },
    })),
  },
};

const ResizeMode = {
  CONTAIN: "contain",
  COVER: "cover",
  STRETCH: "stretch",
};

const AVPlaybackStatus = {};

module.exports = {
  Video,
  Audio,
  ResizeMode,
  AVPlaybackStatus,
};
