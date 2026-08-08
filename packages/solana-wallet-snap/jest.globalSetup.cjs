const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * Ensure `dist/bundle.js` exists before snaps-jest starts its HTTP server.
 * Library packages are already built by `yarn build:libs` during install.
 */
module.exports = function globalSetup() {
  const bundlePath = join(__dirname, 'dist', 'bundle.js');
  if (existsSync(bundlePath)) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    '[solana-wallet-snap] dist/bundle.js missing; running yarn build before tests…',
  );

  const result = spawnSync('yarn', ['build'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ENVIRONMENT: process.env.ENVIRONMENT || 'local',
    },
  });

  if (result.status !== 0) {
    throw new Error(
      '[solana-wallet-snap] Failed to build Snap bundle required by snaps-jest',
    );
  }
};
