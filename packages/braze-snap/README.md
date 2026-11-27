# `@metamask/braze-snap`

Runs the Braze Web SDK for MetaMask in an isolated snap

MetaMask preinstalls this snap and hides it. It runs the [Braze Web SDK](https://www.npmjs.com/package/@braze/web-sdk) in the snap sandbox instead of in an extension page, so that the SDK has no access to the DOM, the extension APIs, or the wallet state.

## API

The snap exposes a client-only `onClientRequest` handler, so only MetaMask can invoke it. Each request carries the Braze config, because the snap has no other way to read it.

### `syncUser`

Identify the device as the given Braze user. The SDK changes the user only when it differs from the current one, and then flushes, which starts a new session if the previous one expired. Returns `{ flushed: boolean }` so the client knows whether queued events and attributes were delivered.

When `language` is given, it becomes the user's language in Braze. The snap skips re-sending an unchanged language during an active 30-minute session (because the SDK sends every attribute it is given), and refreshes it once a new session starts so another device using the same profile cannot leave it stale.

```ts
const { flushed } = await snapController.handleRequest({
  snapId: 'npm:@metamask/braze-snap',
  origin: 'metamask',
  handler: 'onClientRequest',
  request: {
    method: 'syncUser',
    params: {
      profileId: '<canonical profile ID>',
      language: 'fr',
      config: {
        apiKey: '<Braze Web SDK API key>',
        endpoint: 'sdk.iad-01.braze.com',
        appVersion: '13.0.0',
        enableLogging: false,
      },
    },
  },
});
```

| Param                  | Constraint                                        |
| ---------------------- | ------------------------------------------------- |
| `profileId`            | Non-empty string                                  |
| `language`             | Optional. Non-empty string, e.g. `fr`             |
| `config.apiKey`        | Non-empty string                                  |
| `config.endpoint`      | Bare `host[:port]` without scheme, path, or auth  |
| `config.appVersion`    | Non-empty string                                  |
| `config.enableLogging` | Optional. Logs the SDK output to the snap console |

The SDK reports no user agent, platform, or browser language, so Braze only records the device time zone.

To sign a user out, the client stops the snap and clears its state. The snap does not need to reach Braze for that.

## How it works

Each request runs in the same steps:

1. The snap reads the SDK storage and `appliedLanguage` metadata from unencrypted snap state.
2. The SDK is loaded and initialized.
3. The SDK is allowed to send requests to the endpoint, and the handler runs.
4. The SDK flushes what it queued (up to 25 seconds total for the request and flush).
5. Requests still running are aborted, and network access is removed.
6. The SDK storage and `appliedLanguage` are written to snap state once, if changed, and the in-memory SDK instance is destroyed before the snap runtime clears timers.

Requests never interleave. Because the snap runtime clears timers and cancels requests once a request ends, nothing the SDK schedules in the background runs between requests.

The SDK expects browser globals. The bundler replaces every reference to `window`, `document`, `navigator`, `location`, `screen`, `localStorage`, `XMLHttpRequest`, `CustomEvent`, `dispatchEvent`, `addEventListener`, and `removeEventListener` with the shims in [`src/shims`](./src/shims/globals.ts).

## Security model

The snap treats the SDK and the responses from Braze as untrusted.

| Concern                                 | Mitigation                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SDK reads wallet data               | The SDK only sees the profile ID, the language, and the config passed in each request. The snap has no permission besides network access and its own state.                                                |
| The SDK writes to the DOM               | There is no DOM. `document` only resolves URLs, has no cookies, and returns inert element stubs for non-anchor tags. The SDK is initialized without Font Awesome and without user-supplied JavaScript.     |
| The SDK sends data elsewhere            | `fetch` is only reachable through a guarded `XMLHttpRequest`. It only sends `POST` requests to `https://<endpoint>/api/v3/data/`, with a 20 second timeout, without credentials, redirects, or a referrer. |
| A Braze response is unexpected          | Responses are only parsed by the SDK, inside the sandbox.                                                                                                                                                  |
| The SDK writes storage often or a lot   | The SDK writes to memory. The snap persists the `ab.storage.*` keys, except the in-app message triggers MetaMask does not show, alongside `appliedLanguage`, once per request, only when they changed.     |
| The SDK keeps running in the background | Network access only exists during a request, and requests still running when it ends are aborted. The client stops idle snaps.                                                                             |
| Another dapp or snap calls the snap     | The snap only exports `onClientRequest` and has no `endowment:rpc` permission, so MetaMask blocks all non-client origins.                                                                                  |
| The client sends unexpected params      | Params are validated against structs. The endpoint must be a bare host, so the config cannot inject a path or credentials.                                                                                 |
| Several extension pages run the SDK     | Only the background calls the snap, and the snap serializes requests, so a single SDK instance runs.                                                                                                       |

The SDK storage holds the Braze device ID, user ID (the canonical profile ID), session, and the device time zone. The snap adds the last language it set for the user. It is unencrypted so persisting Braze state does not require the wallet's encryption key or trigger an unlock prompt.

## Testing

Run `yarn test` in this directory. [`src/sdk.test.ts`](./src/sdk.test.ts) runs the real SDK against the shims and checks that a restart keeps the device and the session, and [`src/ses.test.ts`](./src/ses.test.ts) verifies the compiled bundle inside a locked-down SES `Compartment`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/internal-snaps#readme).
