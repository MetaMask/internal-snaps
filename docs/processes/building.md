# Building packages

Built files show up in the `dist/` directory in each package. These are the files which will ultimately be published to NPM.

- Run `yarn build` to build all packages in the monorepo (libraries and snaps, topological).
- Run `yarn build:libs` to build only non-snap (library) packages. This also runs automatically after `yarn install`.
- Run `yarn build:snaps` to build only Snap packages (`mm-snap`).
- Run `yarn workspace <workspaceName> run build` to build a single package.
