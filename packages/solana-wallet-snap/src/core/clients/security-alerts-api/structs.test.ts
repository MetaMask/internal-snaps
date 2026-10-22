import { assert } from '@metamask/superstruct';

import {
  SecurityAlertResponseStruct,
  SecurityAlertRequestStruct,
  AssetDiffStruct,
  AssetStruct,
} from './structs';

describe('SecurityAlertRequestStruct', () => {
  const validRequestBody = {
    method: 'signAndSendTransaction',
    encoding: 'base64',
    account_address: 'AkLq9iLD89TDFWs4bnHZRJRYtHqGAbYdF99SjFC4UFYm',
    metadata: { url: 'https://example.com' },
    chain: 'mainnet',
    transactions: ['base64-transaction-payload'],
    options: ['simulation', 'validation'],
  };

  it('accepts a valid scan request body', () => {
    expect(() =>
      assert(validRequestBody, SecurityAlertRequestStruct),
    ).not.toThrow();
  });

  it('accepts every supported chain', () => {
    for (const chain of ['mainnet', 'devnet', 'testnet', 'localnet']) {
      expect(() =>
        assert({ ...validRequestBody, chain }, SecurityAlertRequestStruct),
      ).not.toThrow();
    }
  });

  it('rejects an encoding other than base64', () => {
    expect(() =>
      assert(
        { ...validRequestBody, encoding: 'base58' },
        SecurityAlertRequestStruct,
      ),
    ).toThrow(
      'At path: encoding -- Expected the literal `"base64"`, but received: "base58"',
    );
  });

  it('rejects an unsupported chain', () => {
    expect(() =>
      assert(
        { ...validRequestBody, chain: 'ethereum' },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: chain -- Expected one of');
  });

  it('rejects an empty account address', () => {
    expect(() =>
      assert(
        { ...validRequestBody, account_address: '' },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: account_address -- Expected a nonempty string');
  });

  it('accepts non-dApp metadata with a null URL', () => {
    expect(() =>
      assert(
        { ...validRequestBody, metadata: { url: null, non_dapp: true } },
        SecurityAlertRequestStruct,
      ),
    ).not.toThrow();
  });

  it('rejects metadata without a url key (the API requires it, even when null)', () => {
    expect(() =>
      assert(
        { ...validRequestBody, metadata: { non_dapp: true } },
        SecurityAlertRequestStruct,
      ),
    ).toThrow(
      'At path: metadata.url -- Expected a string, but received: undefined',
    );
  });

  it('rejects metadata that is missing the url key entirely', () => {
    expect(() =>
      assert({ ...validRequestBody, metadata: {} }, SecurityAlertRequestStruct),
    ).toThrow(
      'At path: metadata.url -- Expected a string, but received: undefined',
    );
  });

  it('rejects an empty transactions array', () => {
    expect(() =>
      assert(
        { ...validRequestBody, transactions: [] },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: transactions -- Expected a nonempty array');
  });

  it('rejects an empty transaction payload', () => {
    expect(() =>
      assert(
        { ...validRequestBody, transactions: [''] },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: transactions.0 -- Expected a nonempty string');
  });

  it('rejects an unknown scan option', () => {
    expect(() =>
      assert(
        { ...validRequestBody, options: ['trace'] },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: options.0 -- Expected one of');
  });

  it('rejects an empty options array', () => {
    expect(() =>
      assert({ ...validRequestBody, options: [] }, SecurityAlertRequestStruct),
    ).toThrow('At path: options -- Expected a nonempty array');
  });
});

describe('SecurityAlertResponseStruct', () => {
  it('accepts a successful scan response', () => {
    const response = {
      encoding: 'base58',
      status: 'SUCCESS',
      error: null,
      error_details: null,
      request_id: 'test-request-id',
      result: {
        validation: {
          result_type: 'Benign',
          reason: null,
          features: [],
        },
        simulation: {
          account_summary: {
            account_assets_diff: [],
            account_delegations: [],
            account_ownerships_diff: [],
            total_usd_diff: { in: 0, out: 0, total: 0 },
          },
        },
      },
    };

    expect(SecurityAlertResponseStruct.validate(response)).toStrictEqual([
      undefined,
      response,
    ]);
  });

  it('accepts a response with an explicitly null simulation section', () => {
    // Real API behavior: when only `validation` is requested, the response
    // reports the omitted section as null rather than omitting the key.
    const response = {
      status: 'SUCCESS',
      result: {
        validation: { result_type: 'Benign', reason: null },
        simulation: null,
      },
    };

    expect(() => assert(response, SecurityAlertResponseStruct)).not.toThrow();
  });

  it('accepts a response with an explicitly null validation section', () => {
    const response = {
      status: 'SUCCESS',
      result: {
        validation: null,
        simulation: { account_summary: { account_assets_diff: [] } },
      },
    };

    expect(() => assert(response, SecurityAlertResponseStruct)).not.toThrow();
  });

  it('accepts an error response without a result', () => {
    const response = {
      status: 'ERROR',
      error: 'failed',
      error_details: {
        type: 'TransactionError',
        message: 'failed',
        code: '0x1',
        transaction_index: 0,
      },
    };

    expect(SecurityAlertResponseStruct.validate(response)).toStrictEqual([
      undefined,
      response,
    ]);
  });

  it('accepts a successful response with asset diffs', () => {
    const response = {
      status: 'SUCCESS',
      result: {
        validation: {
          result_type: 'Warning',
          reason: 'transfer_farming',
        },
        simulation: {
          account_summary: {
            account_assets_diff: [
              {
                asset_type: 'NativeToken',
                asset: {
                  type: 'NativeToken',
                  decimals: 9,
                  logo: null,
                },
                in: {
                  usd_price: 10,
                  summary: null,
                  value: 1,
                  raw_value: 1,
                },
                out: null,
              },
            ],
          },
        },
      },
    };

    expect(SecurityAlertResponseStruct.validate(response)).toStrictEqual([
      undefined,
      response,
    ]);
  });

  it('accepts an asset type that is not known to this snap', () => {
    const [, asset] = AssetStruct.validate({
      type: 'SOME_FUTURE_ASSET_TYPE',
    });

    expect(asset).toStrictEqual({ type: 'SOME_FUTURE_ASSET_TYPE' });
  });

  it('rejects a missing status', () => {
    const [error] = SecurityAlertResponseStruct.validate({});

    expect(error).toBeDefined();
  });

  it('rejects an unexpected status', () => {
    const [error] = SecurityAlertResponseStruct.validate({
      status: 'OK',
    });

    expect(error).toBeDefined();
  });

  it('rejects a non-object response', () => {
    const [error] = SecurityAlertResponseStruct.validate(null);

    expect(error).toBeDefined();
  });

  it('rejects an asset diff with a malformed change', () => {
    const [error] = AssetDiffStruct.validate({
      asset_type: 'TOKEN',
      asset: {
        type: 'TOKEN',
        symbol: 'USDC',
        name: 'USD Coin',
      },
      in: {
        usd_price: 'not-a-number',
      },
    });

    expect(error).toBeDefined();
  });
});
