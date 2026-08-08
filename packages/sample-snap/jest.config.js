const shared = require('../../jest.config.snaps.unit.cjs');

module.exports = {
  ...shared,
  // Sample snap coverage is exercised via integration tests (`installSnap`).
  passWithNoTests: true,
};
