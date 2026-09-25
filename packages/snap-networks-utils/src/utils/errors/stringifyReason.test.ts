import { stringifyReason } from './stringifyReason';

describe('stringifyReason', () => {
  it('stringifies a plain error as name and message', () => {
    expect(stringifyReason(new Error('boom'))).toBe('Error: boom');
  });

  it('appends the cause of wrapped errors', () => {
    const error = new Error('Failed to synchronize account', {
      cause: new Error('502 Bad Gateway'),
    });

    expect(stringifyReason(error)).toBe(
      'Error: Failed to synchronize account (Error: 502 Bad Gateway)',
    );
  });

  it('appends causes that are not errors', () => {
    const error = new Error('boom', { cause: '502 Bad Gateway' });

    expect(stringifyReason(error)).toBe('Error: boom (502 Bad Gateway)');
  });

  it('does not append an explicit null cause', () => {
    const error = new Error('boom', { cause: null });

    expect(stringifyReason(error)).toBe('Error: boom');
  });

  it('stringifies non-error reasons as-is', () => {
    expect(stringifyReason('plain failure')).toBe('plain failure');
    expect(stringifyReason(42)).toBe('42');
  });

  it('returns a placeholder when stringification throws', () => {
    const hostile = {
      toString(): string {
        throw new Error('hostile toString');
      },
    };

    expect(stringifyReason(hostile)).toBe('Unknown error');
  });

  it('returns a placeholder when the error itself cannot be stringified', () => {
    const hostileError = new Error('boom');
    hostileError.toString = (): string => {
      throw new Error('hostile toString');
    };

    expect(stringifyReason(hostileError)).toBe('Unknown error');
  });
});
