import { isUnsupportedSimulationError } from './isUnsupportedSimulationError';

describe('isUnsupportedSimulationError', () => {
  it('returns true for DelegateResource energy rental unsupported call types', () => {
    expect(
      isUnsupportedSimulationError(
        'Unsupported call type: delegateresourceofenergy',
      ),
    ).toBe(true);
  });

  it('returns true for FreezeBalanceV2 bandwidth unsupported call types', () => {
    expect(
      isUnsupportedSimulationError(
        'Unsupported call type: freezebalancev2forbandwidth',
      ),
    ).toBe(true);
  });

  it('matches Unsupported call type case-insensitively', () => {
    expect(
      isUnsupportedSimulationError(
        'UNSUPPORTED CALL TYPE: DelegateResourceOfEnergy',
      ),
    ).toBe(true);
  });

  it('returns false for genuine simulation reverts', () => {
    expect(isUnsupportedSimulationError('Reverted: insufficient balance')).toBe(
      false,
    );
  });

  it('returns false when the error message is missing', () => {
    expect(isUnsupportedSimulationError(undefined)).toBe(false);
    expect(isUnsupportedSimulationError(null)).toBe(false);
  });
});
