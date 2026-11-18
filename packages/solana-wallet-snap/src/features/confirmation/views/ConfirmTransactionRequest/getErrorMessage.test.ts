import type { Preferences } from '../../../../core/types/snap';
import { getErrorMessage } from './getErrorMessage';

const preferences = { locale: 'en' } as Preferences;

describe('getErrorMessage', () => {
  it('returns the translated copy for a mapped error code', () => {
    expect(
      getErrorMessage(
        {
          type: 'simulation',
          code: 'ResultWithNegativeLamports',
          message: 'raw message',
        },
        preferences,
      ),
    ).toBe('Account does not have enough SOL to perform the operation.');
  });

  it('returns the API message for an unmapped error code', () => {
    expect(
      getErrorMessage(
        {
          type: 'simulation',
          code: 'UnmappedCode',
          message: 'Program failed to complete',
        },
        preferences,
      ),
    ).toBe('Program failed to complete');
  });

  it('returns the API message when there is no error code', () => {
    expect(
      getErrorMessage(
        { type: 'simulation', code: null, message: 'Program failed' },
        preferences,
      ),
    ).toBe('Program failed');
  });

  it('returns the unknown error copy for an unmapped code without a message', () => {
    expect(
      getErrorMessage(
        { type: 'simulation', code: 'UnmappedCode', message: null },
        preferences,
      ),
    ).toBe('An unknown error occurred.');
  });

  it('returns the unknown error copy when there is neither a code nor a message', () => {
    expect(
      getErrorMessage(
        { type: 'simulation', code: null, message: null },
        preferences,
      ),
    ).toBe('An unknown error occurred.');
  });
});
