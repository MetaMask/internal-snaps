/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals -- Snap configuration executes in Node.js. */
import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';
import { resolve } from 'path';
import { ProvidePlugin } from 'webpack';

import { PROVIDED_GLOBALS } from './src/shims/provided-globals.ts';

const globalsPath = resolve(__dirname, 'src/shims/globals.ts');

const config: SnapConfig = {
  input: resolve(__dirname, 'src/index.ts'),
  typescript: {
    enabled: true,
  },
  server: {
    port: 8080,
  },
  polyfills: false,
  preinstalled: {
    removable: false,
    hidden: true,
    hideSnapBranding: true,
  },
  customizeWebpackConfig: (webpackConfig) =>
    merge(webpackConfig, {
      plugins: [
        new ProvidePlugin(
          Object.fromEntries(
            PROVIDED_GLOBALS.map((name) => [name, [globalsPath, name]]),
          ),
        ),
      ],
    }),
};

export default config;
/* eslint-enable import-x/no-nodejs-modules, no-restricted-globals */
