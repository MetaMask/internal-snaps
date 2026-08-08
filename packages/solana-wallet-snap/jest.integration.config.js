module.exports = {
  preset: '@metamask/snaps-jest',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
    '^.+\\.svg$': '<rootDir>/svg-transformer.js',
  },
  testMatch: [
    '**/integration-test/**/*.[jt]s?(x)',
    '**/src/**/*.integration.test.[jt]s?(x)',
  ],
  maxWorkers: 1,
  setupFilesAfterEnv: ['./jest.setup.ts'],
};
