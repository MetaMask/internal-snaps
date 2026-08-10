const { access } = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

/**
 * Ensure `dist/bundle.js` exists before snaps-jest starts its HTTP server.
 * Library packages are already built by `yarn build:libs` during install.
 *
 * @returns {Promise<void>}
 */
module.exports = async function globalSetup() {
  const bundlePath = join(__dirname, 'dist', 'bundle.js');
  try {
    await access(bundlePath);
    return;
  } catch {
    // Bundle missing — build below.
  }

  console.log(
    '[solana-wallet-snap] dist/bundle.js missing; running yarn build before tests…',
  );

  const code = await new Promise((resolve, reject) => {
    const child = spawn('yarn', ['build'], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve(exitCode ?? 1);
    });
  });

  if (code !== 0) {
    throw new Error(
      '[solana-wallet-snap] Failed to build Snap bundle required by snaps-jest',
    );
  }
};
