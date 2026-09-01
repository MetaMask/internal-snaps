# Adding new packages to the monorepo

> [!NOTE]
> If you're migrating an existing package to the monorepo, please see [the package migration documentation](./package-migration-process-guide.md). You may be able to make use of `create-package` when migrating your package, but there's a lot more to it.

Manually creating a new monorepo package can be a tedious, even frustrating process. To alleviate that problem, we have created a CLI that automates most of the job for us, creatively titled [`create-package`](../../scripts/create-package/). To create a new monorepo package, follow these steps:

1. Create a new package using `yarn create-package`.
   - Use the `--help` flag for usage information.
   - Library packages are created by default. Use `--type snap --proposed-name "My Snap"` to create a Snap package instead.
   - Once this is done, you can find a package with your chosen name in `/packages`.
2. Make sure your license is correct.
   - By default, `create-package` gives your package an MIT license.
   - If your desired license is _not_ MIT, then you must update your `LICENSE` file and the `license` field of `package.json`.
3. Update `.github/CODEOWNERS` to assign a team as the owner of the new package.
4. Add your dependencies.
   - Do this as normal using `yarn`.
   - Remember, if you are adding other monorepo packages as dependents, don't forget to add them to the `references` array in your package's `tsconfig.json` and, for library packages, `tsconfig.build.json`.
   - Every package is checked through its `tsconfig.json`. Library packages also have a `tsconfig.build.json` for declaration builds, while Snap packages are built with `mm-snap`.

And that's it!

### Contributing to `create-package`

Along with this documentation, `create-package` is intended to be the source of truth for the process of adding new packages to the monorepo. Consequently, to change that process, you will want to change `create-package`.

The `create-package` directory contains a shared [library template](../../scripts/create-package/package-template/) and [Snap-specific overrides](../../scripts/create-package/snap-package-template/). The CLI replaces their [placeholder values](../../scripts/create-package/constants.ts) and writes the selected files to a new directory in `/packages`. To modify a template:

- Put files shared by both package types, and all library files, in [`/scripts/create-package/package-template`](../../scripts/create-package/package-template/). Put Snap-specific replacements in [`/scripts/create-package/snap-package-template`](../../scripts/create-package/snap-package-template/).
- If you need to add or modify any placeholders, make sure that your desired values are added to both the relevant file(s) and [`/scripts/create-package/constants.ts`](../../scripts/create-package/constants.ts). Then, update the implementation of the CLI accordingly.
- As with placeholders, updating the monorepo files that the CLI interacts with begins by updating [`/scripts/create-package/constants.ts`](../../scripts/create-package/constants.ts).
