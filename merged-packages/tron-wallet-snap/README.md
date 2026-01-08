# Tron Snap

## Configuration

Rename `.env.example` to `.env`
Configurations are setup though `.env`,

## API:

### `keyring_createAccount`

example:

```typescript
provider.request({
  method: 'wallet_invokeKeyring',
  params: {
    snapId,
    request: {
      method: 'keyring_createAccount',
      params: {
        scope: 'bip122:000000000933ea01ad0ee984209779ba', // the CAIP-2 chain ID of the network
        addressType: 'bip122:p2wpkh', // the CAIP-like address type
      },
    },
  },
});
```

### `confirmStake`

Stakes TRX for bandwidth or energy resources. Votes are automatically allocated to a Super Representative (SR) node after staking.

**Parameters:**

| Parameter               | Type                      | Required | Description                                                                                       |
| ----------------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `fromAccountId`         | `string`                  | Yes      | The UUID of the account to stake from                                                             |
| `assetId`               | `string`                  | Yes      | The CAIP-19 asset ID (e.g., `tron:728126428/slip44:195`)                                          |
| `value`                 | `string`                  | Yes      | The amount of TRX to stake                                                                        |
| `options.purpose`       | `'ENERGY' \| 'BANDWIDTH'` | Yes      | The resource type to stake for                                                                    |
| `options.srNodeAddress` | `string`                  | No       | Optional SR node address to allocate votes to. If not provided, defaults to the Consensys SR node |

**Example:**

```typescript
// Stake with default Consensys SR node
provider.request({
  method: 'wallet_invokeSnap',
  params: {
    snapId,
    request: {
      method: 'confirmStake',
      params: {
        fromAccountId: 'account-uuid',
        assetId: 'tron:728126428/slip44:195',
        value: '100',
        options: {
          purpose: 'ENERGY',
        },
      },
    },
  },
});

// Stake with custom SR node address
provider.request({
  method: 'wallet_invokeSnap',
  params: {
    snapId,
    request: {
      method: 'confirmStake',
      params: {
        fromAccountId: 'account-uuid',
        assetId: 'tron:728126428/slip44:195',
        value: '100',
        options: {
          purpose: 'BANDWIDTH',
          srNodeAddress: 'TCustomSRNodeAddress1234567890abc',
        },
      },
    },
  },
});
```
