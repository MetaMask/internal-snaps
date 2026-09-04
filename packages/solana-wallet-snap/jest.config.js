module.exports = {
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
    '^.+\\.svg$': '<rootDir>/svg-transformer.js',
  },
  verbose: true,
  // Solana tests start a mock RPC on a fixed port (8899); parallel workers collide.
  maxWorkers: 1,
  moduleNameMapper: {
    // `@metamask/snap-networks-utils` is ESM-only, which Jest's CommonJS
    // runtime cannot require, so map it to the uncompiled source instead.
    // The source uses Node16-style `.js` specifiers and `lodash-es`, which
    // must be mapped as well.
    '^@metamask/snap-networks-utils$':
      '<rootDir>/../snap-networks-utils/src/index.ts',
    '^lodash-es$': 'lodash',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverage: true,
  setupFilesAfterEnv: ['./jest.setup.ts'],
  coverageReporters: ['html', 'json-summary', 'text', 'lcov'],
};
