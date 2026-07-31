# Temporary vendored Core packages

These tarballs pin `@metamask/assets-controller@13.0.0` and its unpublished
dependencies from [MetaMask/core release 1165.0.0](https://github.com/MetaMask/core/pull/9740)
until they are available on npm.

Remove this directory and the matching `resolutions` entries in the root
`package.json` once `@metamask/assets-controller@^13.0.0` can be installed
from the registry.
