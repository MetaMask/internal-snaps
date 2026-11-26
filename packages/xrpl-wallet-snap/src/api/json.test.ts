import { assert, StructError } from '@metamask/superstruct';

import { JsonRpcRequestStruct } from './json';

describe('JsonRpcRequestStruct', () => {
  it('accepts a request with a numeric id', () => {
    expect(() =>
      assert(
        { jsonrpc: '2.0', id: 1, method: 'account_info' },
        JsonRpcRequestStruct,
      ),
    ).not.toThrow();
  });

  it('accepts a string id, a null id, and empty params', () => {
    expect(() =>
      assert(
        { jsonrpc: '2.0', id: 'req-1', method: 'account_info', params: {} },
        JsonRpcRequestStruct,
      ),
    ).not.toThrow();
    expect(() =>
      assert(
        { jsonrpc: '2.0', id: null, method: 'account_info' },
        JsonRpcRequestStruct,
      ),
    ).not.toThrow();
  });

  it('rejects the wrong protocol version', () => {
    expect(() =>
      assert(
        { jsonrpc: '1.0', id: 1, method: 'account_info' },
        JsonRpcRequestStruct,
      ),
    ).toThrow(StructError);
  });

  it('rejects a request without a method', () => {
    expect(() =>
      assert({ jsonrpc: '2.0', id: null }, JsonRpcRequestStruct),
    ).toThrow(StructError);
  });

  it('rejects params that are not an object', () => {
    expect(() =>
      assert(
        { jsonrpc: '2.0', id: 1, method: 'account_info', params: 'account' },
        JsonRpcRequestStruct,
      ),
    ).toThrow(StructError);
  });
});
