# Writing and running tests

[Vitest](https://vitest.dev/) is used to ensure that code is working as expected. Ideally, all packages should have 100% test coverage.

Please follow the [MetaMask unit testing guidelines](https://github.com/MetaMask/contributor-docs/blob/main/docs/testing/unit-testing.md) when writing tests.

Package configs merge `vitest.config.packages.ts`. Add only that package's inline dependencies, setup file, and coverage thresholds.

- Run `yarn workspace <workspaceName> run test` to run all tests for a package.
- Run `yarn workspace <workspaceName> exec vitest run <file>` to run a test file within the context of a package.
- Run `yarn test` to run tests for all packages.
- Bitcoin integration tests stay on Jest: `yarn workspace @metamask/bitcoin-wallet-snap run test:integration`.

> **Note**
>
> `workspaceName` in these commands is the `name` field within a package's `package.json`, e.g., `@metamask/bitcoin-wallet-snap`.
