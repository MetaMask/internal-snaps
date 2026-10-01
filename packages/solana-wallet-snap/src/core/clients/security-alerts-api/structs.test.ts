import {
  SecurityAlertResponseStruct,
  AssetDiffStruct,
  AssetStruct,
} from './structs';

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
