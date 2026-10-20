import { assert } from '@metamask/superstruct';

import {
  SecurityAlertRequestStruct,
  SecurityAlertResponseStruct,
} from './structs';

describe('TronScanRequestBodyStruct', () => {
  const validRequestBody = {
    account_address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
    metadata: { domain: 'https://example.com' },
    data: {
      from: 'TRXcKoEvHr6Y38VMcDYGBEYKznvH3XUX4g',
      to: 'TT5rFsXYCrnzdE2q1WdR9F2SuVY59A4hoM',
      value: '0xf1b30',
    },
    options: ['simulation', 'validation'],
  };

  it('accepts a valid scan request body', () => {
    expect(() =>
      assert(validRequestBody, SecurityAlertRequestStruct),
    ).not.toThrow();
  });

  it('accepts omitted optional scan parameters', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: {
            from: 'TRXcKoEvHr6Y38VMcDYGBEYKznvH3XUX4g',
            value: '0x0',
          },
        },
        SecurityAlertRequestStruct,
      ),
    ).not.toThrow();
  });

  it('accepts optional call data', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: {
            ...validRequestBody.data,
            data: '0xa9059cbb',
          },
        },
        SecurityAlertRequestStruct,
      ),
    ).not.toThrow();
  });

  it('accepts non-dApp metadata', () => {
    expect(() =>
      assert(
        { ...validRequestBody, metadata: { non_dapp: true } },
        SecurityAlertRequestStruct,
      ),
    ).not.toThrow();
  });

  it('rejects an empty account address', () => {
    expect(() =>
      assert(
        { ...validRequestBody, account_address: '' },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('Expected a nonempty string');
  });

  it('rejects metadata that is neither a domain nor a non-dApp marker', () => {
    expect(() =>
      assert({ ...validRequestBody, metadata: {} }, SecurityAlertRequestStruct),
    ).toThrow(
      'At path: metadata -- Expected the value to satisfy a union of `type | type`',
    );
  });

  it('rejects a false non-dApp marker', () => {
    expect(() =>
      assert(
        { ...validRequestBody, metadata: { non_dapp: false } },
        SecurityAlertRequestStruct,
      ),
    ).toThrow(
      'At path: metadata -- Expected the value to satisfy a union of `type | type`',
    );
  });

  it('rejects a value that is not a hex string', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: { ...validRequestBody.data, value: 990000 },
        },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('Expected a string');
  });

  it('rejects null optional scan parameters', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: { ...validRequestBody.data, to: null },
        },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: data.to -- Expected a string, but received: null');
  });

  it('rejects a missing sender address', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: { ...validRequestBody.data, from: undefined },
        },
        SecurityAlertRequestStruct,
      ),
    ).toThrow(
      'At path: data.from -- Expected a string, but received: undefined',
    );
  });

  it('rejects an empty sender address', () => {
    expect(() =>
      assert(
        { ...validRequestBody, data: { ...validRequestBody.data, from: '' } },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('At path: data.from -- Expected a nonempty string');
  });

  it('rejects an unknown scan option', () => {
    expect(() =>
      assert(
        { ...validRequestBody, options: ['trace'] },
        SecurityAlertRequestStruct,
      ),
    ).toThrow(
      'At path: options.0 -- Expected one of `"simulation","validation"`, but received: "trace"',
    );
  });

  it('rejects an empty options array', () => {
    expect(() =>
      assert({ ...validRequestBody, options: [] }, SecurityAlertRequestStruct),
    ).toThrow('At path: options -- Expected a nonempty array');
  });

  it('rejects non-array options', () => {
    expect(() =>
      assert(
        { ...validRequestBody, options: 'simulation' },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('Expected an array');
  });
});

describe('SecurityAlertResponseStruct', () => {
  const validResponseBody = {
    validation: {
      status: 'Success',
      result_type: 'Benign',
      reason: '',
      classification: '',
      features: [],
    },
    simulation: {
      status: 'Success',
      account_summary: { assets_diffs: [] },
    },
  };

  it('accepts a valid scan response body', () => {
    expect(() =>
      assert(validResponseBody, SecurityAlertResponseStruct),
    ).not.toThrow();
  });

  it('accepts a simulation error with error details', () => {
    expect(() =>
      assert(
        {
          validation: validResponseBody.validation,
          simulation: {
            status: 'Error',
            error: 'Simulation failed',
            error_details: {
              code: 'GENERAL_INSUFFICIENT_FUNDS',
              category: 'REVERT',
            },
          },
        },
        SecurityAlertResponseStruct,
      ),
    ).not.toThrow();
  });

  it('accepts a response without a validation section', () => {
    expect(() =>
      assert(
        { simulation: validResponseBody.simulation },
        SecurityAlertResponseStruct,
      ),
    ).not.toThrow();
  });

  it('accepts a response without a simulation section', () => {
    expect(() =>
      assert(
        { validation: validResponseBody.validation },
        SecurityAlertResponseStruct,
      ),
    ).not.toThrow();
  });

  it('rejects a null response', () => {
    expect(() => assert(null, SecurityAlertResponseStruct)).toThrow(
      'Expected an object',
    );
  });
});
