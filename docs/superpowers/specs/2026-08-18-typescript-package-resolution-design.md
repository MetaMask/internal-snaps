# TypeScript Package Resolution Design

## Problem

The shared package TypeScript configuration maps every `@metamask/*` import to
`../*/src`. This assumes every scoped dependency has source code in a sibling
directory of the consuming package. That is not true for published
dependencies, and it makes resolution depend on which package directory is
using the inherited configuration.

## Design

Replace the wildcard mapping with an explicit mapping for
`@metamask/snap-networks-utils`, the workspace package whose source should be
used while developing the snaps in this repository. Map both its package root
and `logger` subpath to the local source tree. Leave all other
`@metamask/*` imports unmapped so TypeScript resolves them through their
installed package metadata and declarations.

Mirror the same allowlist in Jest. Keep the existing special cases for
`@metamask/json-rpc-engine/v2` and `@metamask/utils/node`, and add local
resolution for the workspace package before the existing installed-package
fallback behavior.

## Testing

Verify the effective TypeScript configuration contains only the explicit
workspace mappings. Run type checking for the packages that consume
`@metamask/snap-networks-utils`, and run their Jest suites to verify that root
and subpath imports resolve to local source. Run repository lint and changelog
validation as final checks.

## Alternatives considered

1. Keep the wildcard and add more relative path variants. This preserves the
   incorrect assumption and grows brittle as packages move.
2. Remove all path mappings and rely on Yarn workspace links. This would use
   built declarations rather than source during development and would not
   preserve the current Jest behavior.
3. Explicitly map only workspace packages. This addresses the resolution bug,
   preserves local source development, and lets published dependencies follow
   normal package resolution, so it is the selected approach.
