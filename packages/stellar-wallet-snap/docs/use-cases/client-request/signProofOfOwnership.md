# Use case: `signProofOfOwnership`

Silently signs a proof-of-ownership message so `@metamask/profile-metrics-controller` can prove the user controls a Stellar address.

|            |                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| **Entry**  | `onClientRequest` → `ClientRequestHandler` → `SignProofOfOwnershipHandler`                                      |
| **Method** | `signProofOfOwnership` (`ClientRequestMethod.SignProofOfOwnership`)                                             |
| **Source** | [`handlers/clientRequest/signProofOfOwnership.ts`](../../../src/handlers/clientRequest/signProofOfOwnership.ts) |

This is a **silent sign** — there is no confirmation dialog. That is intentional: the MetaMask client needs an ownership proof without interrupting the user. The method is scoped so it cannot be used as a general sign-message bypass:

1. SIP-31 `onClientRequest` is only callable by the MetaMask client.
2. The plaintext must be `metamask:proof-of-ownership:{nonce}:{address}`, and the embedded address must match the signing account.
3. Signing uses [SEP-0053](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) (`Wallet.signMessage`).

## Request / response (shape)

**Request params**

- `accountId` — keyring account UUID
- `message` — plaintext `metamask:proof-of-ownership:{nonce}:{address}` (nonce may contain colons; the address is the last `:`-separated field)
- `nonce`, `address` — coerced from `message` internally (clients do not send these)

**Response**

- `{ signature }` — standard base64 of the 64-byte ed25519 signature (SEP-0053)

## Participants

| Component                     | Path                     | Role in this flow                                    |
| ----------------------------- | ------------------------ | ---------------------------------------------------- |
| `ClientRequestHandler`        | `handlers/clientRequest` | Routes `signProofOfOwnership` to the handler         |
| `SignProofOfOwnershipHandler` | `handlers/clientRequest` | Validates message, resolves wallet, signs            |
| `AccountResolver`             | `handlers/`              | Loads keyring account + wallet (no on-chain account) |
| `Wallet`                      | `services/wallet`        | SEP-0053 `signMessage`                               |

## Step-by-step

1. **Route** — `onClientRequest` dispatches to `SignProofOfOwnershipHandler`.
2. **Validate** — Request must match `SignProofOfOwnershipJsonRpcRequestStruct` (prefix, nonce, Stellar address). `nonce` and `address` are coerced from `message`.
3. **Resolve** — `BaseClientRequestHandler` loads keyring account and wallet only (`RESOLVE_ACCOUNT_KEYRING_AND_WALLET`). The destination account does not need to be activated on-chain.
4. **Bind** — The address in the message must equal the signing account address.
5. **Sign** — `Wallet.signMessage(message)` (SEP-0053, base64).

## Sequence (happy path)

```mermaid
sequenceDiagram
  participant Client
  participant Handler as SignProofOfOwnershipHandler
  participant Resolver as AccountResolver
  participant Wallet

  Client->>Handler: signProofOfOwnership { accountId, message }
  Note over Handler: validate coerces nonce + address from message
  Handler->>Resolver: resolve keyring account + wallet
  Resolver-->>Handler: account, wallet
  Handler->>Handler: message address == account.address
  Handler->>Wallet: signMessage (SEP-0053, base64)
  Wallet-->>Handler: signature
  Handler-->>Client: { signature }
```
