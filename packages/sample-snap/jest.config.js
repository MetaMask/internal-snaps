const shared = require('../../jest.config.snaps.unit.js');

module.exports = {
  ...shared,
  // Sample snap coverage is exercised via integration tests (`installSnap`).
  passWithNoTests: true,
};
