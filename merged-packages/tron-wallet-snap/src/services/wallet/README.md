# WalletService

The `WalletService` is responsible for handling wallet operations like signing messages and transactions for the Tron blockchain.

## Overview

This service implements the Tron Multichain API specification, providing methods for:

- Signing plain text messages (`signMessage`)
- Signing serialized transactions (`signTransaction`)

## Architecture

The service follows a clean architecture pattern:

1. **Request Validation**: All incoming requests are validated using Superstruct schemas
2. **Account Management**: Integrates with `AccountsService` for key derivation
3. **TronWeb Integration**: Uses `TronWebFactory` for cryptographic operations
4. **Error Handling**: Comprehensive error handling with specific error codes

## Methods

### `handleKeyringRequest()`

Main entry point that routes requests to the appropriate signing method.

**Parameters:**

- `account`: TronKeyringAccount - The account to use for signing
- `scope`: Network - The Tron network (Mainnet, Shasta, or Nile)
- `method`: TronMultichainMethod - The method to execute
- `params`: Json - Method-specific parameters

**Returns:** `Promise<{ signature: string }>`

**Error Codes:**

- `4001` - Invalid parameters
- `4002` - Invalid transaction format
- `4100` - User rejected the request
- `5000` - Unknown error

### `signMessage()`

Signs a plain text message using the account's private key.

**Parameters:**

```typescript
{
  account: TronKeyringAccount;
  scope: Network;
  params: {
    address: string; // Tron address (Base58Check format)
    message: string; // Base64-encoded message
  }
}
```

**Returns:** `Promise<{ signature: string }>`

**Example:**

```typescript
const result = await walletService.signMessage({
  account: myAccount,
  scope: Network.Mainnet,
  params: {
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    message: Buffer.from('Hello World').toString('base64'),
  },
});
// result: { signature: '0xabc123...' }
```

### `signTransaction()`

Signs a serialized Tron transaction.

**Parameters:**

```typescript
{
  account: TronKeyringAccount;
  scope: Network;
  params: {
    scope: string; // CAIP-2 chain ID
    address: string; // Tron address (Base58Check format)
    transaction: string; // Base64-encoded protobuf transaction
  }
}
```

**Returns:** `Promise<{ signature: string }>`

**Example:**

```typescript
const result = await walletService.signTransaction({
  account: myAccount,
  scope: Network.Mainnet,
  params: {
    scope: 'tron:0x2b6653dc',
    address: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
    transaction: base64EncodedTransaction,
  },
});
// result: { signature: '0xabc123...' }
```

## Error Handling

The service implements comprehensive error handling:

1. **Validation Errors** (4001): Thrown when parameters don't match expected schemas
2. **Transaction Format Errors** (4002): Thrown when transaction deserialization fails
3. **User Rejection** (4100): Thrown when user denies the signing request
4. **Unknown Errors** (5000): Catch-all for unexpected errors

All errors are wrapped in `SnapError` with appropriate error codes for consistent error handling.

## Testing

The service includes comprehensive test coverage:

- Unit tests for each method
- Error handling scenarios
- Edge cases (empty signatures, invalid formats, etc.)
- Integration with TronWeb and AccountsService

Run tests:

```bash
yarn test WalletService.test.ts
```

## Dependencies

- `@metamask/snaps-sdk` - SnapError for error handling
- `@metamask/utils` - Json type definitions
- `AccountsService` - Key derivation
- `TronWebFactory` - TronWeb client creation
- Validation structs - Request/response validation

## Related Files

- `handlers/keyring.ts` - KeyringHandler that uses this service
- `handlers/keyring-types.ts` - Method and error type definitions
- `validation/structs.ts` - Validation schemas
- `services/confirmation/ConfirmationHandler.ts` - User confirmation handling
