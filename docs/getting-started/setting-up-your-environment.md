# Setting up your development environment

1. Install the current LTS version of [Node](https://nodejs.org).
   - If you are using [NVM](https://github.com/creationix/nvm#installation) (recommended), running `nvm install` will install the latest version, and running `nvm use` will automatically choose the right Node version for you.
2. Run `corepack enable` to install [Yarn](https://yarnpkg.com) via [Corepack](https://github.com/nodejs/corepack?tab=readme-ov-file#how-to-install).
   - If you have Yarn installed globally via Homebrew or NPM, you'll need to uninstall it before running this command.
3. Run `yarn install` to install dependencies and run post-install hooks.
   - After install, library packages are built automatically via `yarn build:libs` (chained from `allow-scripts`).
   - Snap bundles are **not** built during install. Run `yarn build` / `yarn build:snaps` when you need `dist/bundle.js`, `serve`, or `installSnap` integration tests.
4. Verify the tree:

```bash
yarn typecheck
yarn test
```
