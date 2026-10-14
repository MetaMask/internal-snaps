import { assert } from '@metamask/superstruct';

import { SecurityAlertRequestStruct } from './structs';

describe('TronScanRequestBodyStruct', () => {
  const validRequestBody = {
    account_address: 'TExvJsxzPyAZ2NtkrWgNKnbLkpqnFJ73DT',
    metadata: { domain: 'https://example.com' },
    data: {
      from: 'TRXcKoEvHr6Y38VMcDYGBEYKznvH3XUX4g',
      to: 'TT5rFsXYCrnzdE2q1WdR9F2SuVY59A4hoM',
      data: null,
      value: 990000,
    },
    options: ['simulation', 'validation'],
  };

  it('accepts a valid scan request body', () => {
    expect(() =>
      assert(validRequestBody, SecurityAlertRequestStruct),
    ).not.toThrow();
  });

  it('accepts nullable optional scan parameters', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: {
            from: 'TRXcKoEvHr6Y38VMcDYGBEYKznvH3XUX4g',
            to: null,
            data: null,
            value: null,
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

  it('rejects a scan parameter of the wrong type', () => {
    expect(() =>
      assert(
        {
          ...validRequestBody,
          data: { ...validRequestBody.data, value: '990000' },
        },
        SecurityAlertRequestStruct,
      ),
    ).toThrow('Expected a number');
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
