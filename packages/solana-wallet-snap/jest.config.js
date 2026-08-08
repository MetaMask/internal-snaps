module.exports = {
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
    '^.+\\.svg$': '<rootDir>/svg-transformer.js',
  },
  verbose: true,
  // Solana tests start a mock RPC on a fixed port (8899); parallel workers collide.
  maxWorkers: 1,
  collectCoverage: true,
  setupFilesAfterEnv: ['./jest.setup.ts'],
  coverageReporters: ['html', 'json-summary', 'text', 'lcov'],
  // Lazy-build the Snap bundle when missing so `yarn test` works after install.
  globalSetup: '<rootDir>/jest.globalSetup.cjs',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/integration-test/',
    '\\.integration\\.test\\.[tj]sx?$',
  ],
};
