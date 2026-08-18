# TypeScript Package Resolution Design

## Problem

The shared package TypeScript configuration maps every `@metamask/*` import to
`../*/src`. This assumes every scoped dependency has source code in a sibling
directory of the consuming package. That is not true for published
dependencies, and it makes resolution depend on which package directory is
using the inherited configuration. Snap configs also inherit `composite: true`,
which prevents a consuming project from including source files from a local
workspace package.

## Design

Use a monorepo-root wildcard with a published-package fallback:

```json
"paths": {
  "@metamask/*": ["./packages/*/src"],
  "@metamask/*/*": ["./packages/*/src/*"]
}
```

The first mapping covers package-root imports such as
`@metamask/snap-networks-utils`. The second covers subpaths such as
`@metamask/snap-networks-utils/logger`. When no matching
`packages/<name>/src` directory exists, TypeScript continues with normal
package resolution from `node_modules`. Adding a new workspace package does
not require an allowlist change.

Snap packages extend a shared `tsconfig.snaps.json` that disables `composite`
so they can typecheck against sibling workspace source without TS6307. Those
configs must not set `baseUrl` unless they also re-declare the workspace
`paths` relative to that `baseUrl`; inherited path mappings are resolved
against `baseUrl` when it is present.

Jest uses the same rule: try `packages/<name>/src` (and `src/<subpath>`) from
the monorepo root, then fall back to the installed `@metamask/<name>` package.

## Testing

Verify the effective TypeScript configuration has the root-relative mappings
and `composite: false` for Snap packages. Confirm a local workspace import
resolves under `packages/*/src` and a published `@metamask/*` import resolves
under `node_modules`. Run type checking for Snap packages, the library
package tests, lint, and changelog validation.

## Alternatives considered

1. Keep the consumer-relative wildcard and add more sibling-path variants.
   This preserves the incorrect parent-directory assumption.
2. Maintain an explicit allowlist of local packages. Correct, but every new
   workspace package needs a config update.
3. Remove all path mappings and rely on Yarn workspace links. This uses built
   declarations instead of source during development.
4. Root-relative wildcard, subpath mapping, published-package fallback, and
   Snap `composite: false`. This is the selected approach because local
   packages are picked up automatically and missing local packages use
   `node_modules`.
