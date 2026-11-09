/**
 * Manual Jest mock for expo-video (used by MediaViewerModal). Its native
 * module is unavailable under Jest.
 */

const React = require("react");

const VideoView = React.forwardRef(function VideoView(_props, _ref) {
  return null;
});

module.exports = {
  VideoView,
  useVideoPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
  })),
};
