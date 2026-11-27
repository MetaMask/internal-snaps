# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the `syncUser` JSON-RPC method, which identifies the device as a Braze user with the Braze Web SDK `7.0.0`, running without DOM and cookies, and returns `{ flushed }` to report whether queued data flushed ([#685](https://github.com/MetaMask/internal-snaps/pull/685))
  - Exposed via `onClientRequest` so only MetaMask can invoke it, with the Braze config as a param.
  - Sets the user's language in Braze from the optional `language` param when it changed for that user or when a new 30-minute session starts.
  - Only reports the device time zone to Braze, without the user agent, platform, or browser language.
  - Only lets the SDK `POST` to `https://<endpoint>/api/v3/data/` with a 20-second request timeout.
  - Persists the SDK storage once per request in unencrypted snap state, without the in-app message triggers.

[Unreleased]: https://github.com/MetaMask/internal-snaps/
