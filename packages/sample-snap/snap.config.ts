import type { SnapConfig } from '@metamask/snaps-cli';
// eslint-disable-next-line import-x/no-nodejs-modules
import { resolve } from 'path';

const config: SnapConfig = {
  // eslint-disable-next-line no-restricted-globals
  input: resolve(__dirname, 'src/index.tsx'),
  server: {
    port: 8080,
  },
  polyfills: {
    buffer: true,
  },
};

export default config;
