import {
  ACCOUNT_INFO_FETCH_FAILED_MESSAGE,
  FAILURE_STREAK_REMINDER_MS,
  FailureStreakGate,
  getStreakGatedMessage,
} from './failureStreakGate';

describe('FailureStreakGate', () => {
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports the first failure of a streak, then a reminder per interval', () => {
    const gate = new FailureStreakGate();

    expect(gate.shouldReport('a')).toBe(true);
    now += 30_000;
    expect(gate.shouldReport('a')).toBe(false);
    now += FAILURE_STREAK_REMINDER_MS - 30_000 - 1;
    expect(gate.shouldReport('a')).toBe(false);
    now += 1;
    expect(gate.shouldReport('a')).toBe(true);
    expect(gate.shouldReport('a')).toBe(false);
  });

  it('starts a new streak after a success', () => {
    const gate = new FailureStreakGate();

    expect(gate.shouldReport('a')).toBe(true);
    expect(gate.shouldReport('a')).toBe(false);
    gate.endStreak('a');
    expect(gate.shouldReport('a')).toBe(true);
  });

  it('keeps keys independent', () => {
    const gate = new FailureStreakGate();

    expect(gate.shouldReport('a')).toBe(true);
    expect(gate.shouldReport('b')).toBe(true);
    gate.clear();
    expect(gate.shouldReport('a')).toBe(true);
  });
});

describe('getStreakGatedMessage', () => {
  it('returns the gated message only', () => {
    expect(
      getStreakGatedMessage(new Error(ACCOUNT_INFO_FETCH_FAILED_MESSAGE)),
    ).toBe(ACCOUNT_INFO_FETCH_FAILED_MESSAGE);
    expect(getStreakGatedMessage(new Error('other'))).toBeUndefined();
    expect(getStreakGatedMessage('x')).toBeUndefined();
  });
});
