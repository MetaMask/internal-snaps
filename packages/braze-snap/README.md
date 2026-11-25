# `@metamask/braze-snap`

Runs the Braze Web SDK for MetaMask in an isolated snap

MetaMask preinstalls this snap and hides it. It runs the [Braze Web SDK](https://www.npmjs.com/package/@braze/web-sdk) in the snap sandbox instead of in an extension page, so that the SDK has no access to the DOM, the extension APIs, or the wallet state.

## API

The snap only accepts JSON-RPC requests from the `metamask` origin. Each request carries the Braze config, because the snap has no other way to read it.

### `syncUser`

Identify the device as the given Braze user. The SDK changes the user only when it differs from the current one, and then flushes, which starts a new session if the previous one expired.

When `language` is given, it becomes the user's language in Braze. The snap only sets it when it differs from the last language it set for that user, because the SDK sends every attribute it is given.

```ts
await snapController.handleRequest({
  snapId: 'npm:@metamask/braze-snap',
  origin: 'metamask',
  handler: 'onRpcRequest',
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
| `profileId`            | 1 to 256 characters                               |
| `language`             | Optional. An ISO 639-1 code, such as `fr`         |
| `config.apiKey`        | A UUID                                            |
| `config.endpoint`      | A host matching `sdk.<cluster>.braze.(com\|eu)`   |
| `config.appVersion`    | 1 to 64 characters                                |
| `config.enableLogging` | Optional. Logs the SDK output to the snap console |

The SDK reports no user agent, platform, or browser language, so Braze only records the device time zone.

To sign a user out, the client stops the snap and clears its state. The snap does not need to reach Braze for that.

## How it works

Each request runs in the same steps:

1. The first request after the snap starts reads the SDK storage from unencrypted snap state.
2. The SDK is loaded and initialized, or initialized again if the config changed.
3. The SDK is allowed to send requests to the endpoint, and the handler runs.
4. The SDK flushes what it queued. The snap waits up to 25 seconds for the flush and the requests it started.
5. Requests still running are aborted, and network access is removed.
6. The SDK storage is written to snap state, once, if it changed.

Requests never interleave. Because the snap runtime clears timers and cancels requests once a request ends, nothing the SDK schedules in the background runs between requests.

The SDK expects browser globals. The bundler replaces every reference to `window`, `document`, `navigator`, `location`, `screen`, `localStorage`, `XMLHttpRequest`, `CustomEvent`, `dispatchEvent`, `addEventListener`, and `removeEventListener` with the shims in [`src/shims`](./src/shims/globals.ts).

## Security model

The snap treats the SDK and the responses from Braze as untrusted.

| Concern                                 | Mitigation                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SDK reads wallet data               | The SDK only sees the profile ID, the language, and the config passed in each request. The snap has no permission besides network access and its own state.                                                                                                                                               |
| The SDK writes to the DOM               | There is no DOM. `document` only resolves URLs, has no cookies, and returns no elements. The SDK is initialized without Font Awesome and without user-supplied JavaScript.                                                                                                                                |
| The SDK sends data elsewhere            | `fetch` is only reachable through a guarded `XMLHttpRequest`. It only sends `POST` requests to `https://<endpoint>/api/v3/data/`, with bodies up to 256 KB, the size of the persisted storage they come from, up to 4 at a time, with a 20 second timeout, without credentials, redirects, or a referrer. |
| A Braze response is large or malformed  | Responses above 256 KB are rejected. Responses are only parsed by the SDK, inside the sandbox.                                                                                                                                                                                                            |
| The SDK writes storage often or a lot   | The SDK writes to memory. The snap persists the `ab.storage.*` keys, except the in-app message triggers MetaMask does not show, with its own `metamask.*` items, once per request, only when they changed. Storage above 256 KB is wiped instead of written, the SDK is reset, and the request fails with an `InternalError` that the client can report.                        |
| The SDK keeps running in the background | Network access only exists during a request, and requests still running when it ends are aborted. The client stops idle snaps.                                                                                                                                                                            |
| Another dapp or snap calls the snap     | The manifest only allows the `metamask` origin, and the handler rejects any other origin.                                                                                                                                                                                                                 |
| The client sends unexpected params      | Params are validated against strict structs. The endpoint must be a Braze SDK host, so the config cannot redirect requests.                                                                                                                                                                               |
| Several extension pages run the SDK     | Only the background calls the snap, and the snap serializes requests, so a single SDK instance runs.                                                                                                                                                                                                      |

The SDK storage holds the Braze device ID, user ID (the canonical profile ID), session, and the device time zone. The snap adds the last language it set for the user. It is unencrypted, so the snap can identify the device while the wallet is locked.

## Testing

Run `yarn test` in this directory. [`src/sdk.test.ts`](./src/sdk.test.ts) runs the real SDK against the shims and checks that a restart keeps the device and the session.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/internal-snaps#readme).
