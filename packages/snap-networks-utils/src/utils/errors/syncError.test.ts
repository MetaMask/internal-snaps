import {
  SynchronizationError,
  formatAccountSyncFailures,
  getSyncFailuresFromSettledResult,
} from './syncError';

describe('formatAccountSyncFailures', () => {
  it('formats a single failure', () => {
    const failures = [{ accountId: 'account-1', reason: 'Error: boom' }];

    expect(formatAccountSyncFailures(failures)).toBe('account-1: Error: boom');
  });

  it('formats multiple failures separated by semicolons', () => {
    const failures = [
      { accountId: 'account-1', reason: 'Error: boom' },
      { accountId: 'account-2', reason: 'TimeoutError: too slow' },
    ];

    expect(formatAccountSyncFailures(failures)).toBe(
      'account-1: Error: boom; account-2: TimeoutError: too slow',
    );
  });

  it('truncates long reasons', () => {
    const failures = [{ accountId: 'account-1', reason: 'x'.repeat(1000) }];

    const formatted = formatAccountSyncFailures(failures);

    expect(formatted).toHaveLength('account-1: '.length + 300 + 1);
    expect(formatted).toContain('…');
  });

  it('truncates the list when there are many failures', () => {
    const failures = Array.from({ length: 15 }, (_, index) => ({
      accountId: `account-${index}`,
      reason: 'Error: boom',
    }));

    const formatted = formatAccountSyncFailures(failures);

    expect(formatted).toContain('account-9: Error: boom');
    expect(formatted).not.toContain('account-10: Error: boom');
    expect(formatted.endsWith('+5 more')).toBe(true);
  });

  it('returns an empty string for no failures', () => {
    expect(formatAccountSyncFailures([])).toBe('');
  });
});

describe('getSyncFailuresFromSettledResult', () => {
  it('maps rejections to failures with stringified reasons', () => {
    const results = [
      { status: 'fulfilled', value: 'ok' },
      {
        status: 'rejected',
        reason: new Error('Failed to synchronize account', {
          cause: new Error('502 Bad Gateway'),
        }),
      },
      { status: 'rejected', reason: 42 },
    ] as PromiseSettledResult<unknown>[];

    expect(
      getSyncFailuresFromSettledResult(results, [
        'account-1',
        'account-2',
        'account-3',
      ]),
    ).toStrictEqual([
      {
        accountId: 'account-2',
        reason: 'Error: Failed to synchronize account (Error: 502 Bad Gateway)',
      },
      { accountId: 'account-3', reason: '42' },
    ]);
  });

  it('skips rejections without a matching account ID', () => {
    const results = [
      { status: 'rejected', reason: new Error('boom') },
      { status: 'rejected', reason: new Error('also boom') },
    ] as PromiseSettledResult<unknown>[];

    expect(
      getSyncFailuresFromSettledResult(results, ['account-1']),
    ).toStrictEqual([{ accountId: 'account-1', reason: 'Error: boom' }]);
  });

  it('returns an empty list when nothing is rejected', () => {
    const results = [
      { status: 'fulfilled', value: 'ok' },
    ] as PromiseSettledResult<unknown>[];

    expect(
      getSyncFailuresFromSettledResult(results, ['account-1']),
    ).toStrictEqual([]);
  });
});

describe('SynchronizationError', () => {
  it('sets the name and the message', () => {
    const error = new SynchronizationError('Account synchronization failures');

    expect(error.name).toBe('SynchronizationError');
    expect(error.message).toBe('Account synchronization failures');
    expect(error.failures).toStrictEqual([]);
  });

  it('appends failure details to the message so they survive error tracking', () => {
    const failures = [
      { accountId: 'account-1', reason: 'Error: boom' },
      { accountId: 'account-2', reason: 'TimeoutError: too slow' },
    ];

    const error = new SynchronizationError(
      'Account synchronization failures',
      failures,
    );

    expect(error.name).toBe('SynchronizationError');
    expect(error.message).toBe(
      'Account synchronization failures (2 failed): account-1: Error: boom; ' +
        'account-2: TimeoutError: too slow',
    );
    expect(error.failures).toBe(failures);
  });

  it('supports a cause', () => {
    const cause = new Error('root cause');
    const error = new SynchronizationError(
      'Account synchronization failures',
      [{ accountId: 'account-1', reason: 'Error: boom' }],
      { cause },
    );

    expect(error.cause).toBe(cause);
  });
});
