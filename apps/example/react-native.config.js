const path = require('path');
const pak = require('../../packages/mlc/package.json');

module.exports = {
  project: {
    ios: {
      automaticPodsInstallation: true,
    },
  },
  dependencies: {
    [pak.name]: {
      root: path.join(__dirname, '../../packages/mlc'),
    },
  },
};
