# Submit & bad-sequence retry (`txBadSeq`)

Shared on-chain **submit** path used after any flow has built (or decoded), validated, and signed an envelope. This doc is only about submission and recovering when the account **sequence is wrong or too old**.

Suggested name vs “general on-chain send”: prefer **submit / sequence retry** — it is not a payment-type chooser; it is the last mile of every successful submit.

|             |                                                                                                                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service** | `TransactionService.sendTransaction`                                                                                                                                                                                          |
| **Network** | `NetworkService.send`                                                                                                                                                                                                         |
| **Rebuild** | `TransactionBuilder.rebuildTxnWithNewSeq`                                                                                                                                                                                     |
| **Used by** | [`confirmSend`](../../use-cases/client-request/confirmSend.md), [`changeTrustOpt`](../../use-cases/client-request/changeTrustOpt.md), [`signAndSendTransaction`](../../use-cases/client-request/signAndSendTransaction.md), … |

## Happy path

```text
assert scope matches envelope
  → NetworkService.send(signed tx)
  → optional poll for terminal SUCCESS
  → return transaction hash
```

## When sequence is stale (`txBadSeq`)

Stellar rejects the submit with `txBadSeq` when the envelope’s sequence does not match the source account’s current sequence (concurrent txs, race after a long confirmation dialog, etc.).

`NetworkService.send` maps that RPC error to `TransactionRetryableException`.

`TransactionService.sendTransaction` then:

1. Checks the envelope **source** equals the resolved `onChainAccount.accountId` (this wallet consumes the sequence).
   - If source is **another** account → rethrow (cannot bump someone else’s sequence).
2. Reloads the account from the network (`getAccount`) for a fresh `sequenceNumber`.
3. `rebuildTxnWithNewSeq` — clone ops / fee / timebounds onto a new envelope with the new sequence, and reattach Soroban `sorobanData` (resource fee + footprint) when the template is a contract invoke.
4. `wallet.signTransaction` again.
5. Submit **once** more.

Only **one** automatic retry.

## Soroban / `invokeHostFunction`

`TransactionBuilder.cloneFrom` does not copy `xdr.SorobanTransactionData`. `rebuildTxnWithNewSeq` reads that ext from the original envelope and reapplies it with `setSorobanData`, so SEP-41 / other assembled invoke envelopes keep their simulation footprint and resource fee across the sequence bump. A stale footprint (ledger advanced enough to invalidate simulation) is a separate failure mode — that still requires a fresh simulate / re-assemble, not only a sequence retry.

## Flow

```mermaid
sequenceDiagram
  participant Handler
  participant Tx as TransactionService
  participant Net as NetworkService
  participant Builder as TransactionBuilder
  participant Wallet

  Handler->>Wallet: signTransaction (initial)
  Handler->>Tx: sendTransaction
  Tx->>Net: send
  alt SUCCESS
    Net-->>Tx: hash
    Tx-->>Handler: transactionId
  else txBadSeq (retryable)
    Net-->>Tx: TransactionRetryableException
    alt source === wallet account
      Tx->>Net: getAccount (fresh sequence)
      Tx->>Builder: rebuildTxnWithNewSeq
      Tx->>Wallet: signTransaction
      Tx->>Net: send (retry once)
      Net-->>Tx: hash
      Tx-->>Handler: transactionId
    else source is another account
      Tx-->>Handler: rethrow
    end
  end
```

## After submit (callers)

Handlers typically then:

- `savePendingKeyringTransactionSafe`
- `TrackTransactionHandler.scheduleBackgroundEvent`
