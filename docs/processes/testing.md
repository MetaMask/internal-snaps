# Writing and running tests

[Jest](https://jestjs.io/) is used to ensure that code is working as expected. Ideally, all packages should have 100% test coverage.

Please follow the [MetaMask unit testing guidelines](https://github.com/MetaMask/contributor-docs/blob/main/docs/testing/unit-testing.md) when writing tests.

If you need to customize the behavior of Jest for a package, see `jest.config.js` / `jest.config.mjs` within that package.

- Run `yarn workspace <workspaceName> run test` to run **unit** tests for a package.
- Run `yarn workspace <workspaceName> run jest --no-coverage <file>` to run a test file within the context of a package.
- Run `yarn test` to run unit tests for packages in the monorepo.
- For Snaps that define them, run `yarn workspace <workspaceName> run test:integration` for `installSnap` / SES suites. Those require a prior Snap build (`yarn build` or `yarn build:snaps`).

> **Note**
>
> `workspaceName` in these commands is the `name` field within a package's `package.json`, e.g., `@metamask/bitcoin-wallet-snap`.
>
> Snap unit configs use the Node environment (or, for Solana, `snaps-jest` with a lazy build via `jest.globalSetup`). Do not put `installSnap` tests in the default unit suite — use `integration-test/` or `*.integration.test.*` instead.
