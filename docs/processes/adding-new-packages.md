# Adding new packages to the monorepo

> [!NOTE]
> If you're migrating an existing package to the monorepo, please see [the package migration documentation](./package-migration-process-guide.md). You may be able to make use of `create-package` when migrating your package, but there's a lot more to it.

Manually creating a new monorepo package can be a tedious, even frustrating process. To alleviate that problem, we have created a CLI that automates most of the job for us, creatively titled [`create-package`](../../scripts/create-package/). To create a new monorepo package, follow these steps:

1. Create a new package using `yarn create-package`.
   - You can specify the kind of package you want with the `--type` option. It defaults to `snap`:
     - `--type snap` creates a new Snap, whose bundle is built with `mm-snap`.
     - `--type library` (or the `--type lib` shorthand) creates a new non-Snap package, which is built as ESM-only with `tsc`.
   - Use the `--help` flag for usage information.
   - Once this is done, you can find a package with your chosen name in `/packages`.
2. Make sure your license is correct.
   - By default, `create-package` gives your package an MIT license.
   - If your desired license is _not_ MIT, then you must update your `LICENSE` file and the `license` field of `package.json`.
3. Update `.github/CODEOWNERS` to assign a team as the owner of the new package.
4. Add your dependencies.
   - Do this as normal using `yarn`.

And that's it!

### Contributing to `create-package`

Along with this documentation, `create-package` is intended to be the source of truth for the process of adding new packages to the monorepo. Consequently, to change that process, you will want to change `create-package`.

The `create-package` directory contains a template for each package type: [Snaps](../../scripts/create-package/snap-template/) and [libraries](../../scripts/create-package/library-template/). The CLI is not aware of the contents of the templates, only that their files have [placeholder values](../../scripts/create-package/constants.ts). When a new package is created, the template files for the requested type are read from disk, the placeholder values are replaced with real ones, and the updated files are added to a new directory in `/packages`. To modify the templates:

- If you need to add or modify any files or folders, just go ahead and make your changes in [`/scripts/create-package/snap-template`](../../scripts/create-package/snap-template/) or [`/scripts/create-package/library-template`](../../scripts/create-package/library-template/). The CLI will read whatever's in those directories and write it to disk.
- If you need to add or modify any placeholders, make sure that your desired values are added to both the relevant file(s) and [`/scripts/create-package/constants.ts`](../../scripts/create-package/constants.ts). Then, update the implementation of the CLI accordingly.
- As with placeholders, updating the monorepo files that the CLI interacts with begins by updating [`/scripts/create-package/constants.ts`](../../scripts/create-package/constants.ts).
