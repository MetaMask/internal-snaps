import { deriveSecurityAlert, getSecurityAlertDescription } from './utils';

describe('deriveSecurityAlert', () => {
  it('returns null for missing verdicts', () => {
    expect(deriveSecurityAlert(null)).toBeNull();
    expect(deriveSecurityAlert(undefined)).toBeNull();
  });

  it('returns null for benign verdicts', () => {
    expect(deriveSecurityAlert('Benign')).toBeNull();
  });

  it('returns null for error verdicts', () => {
    expect(deriveSecurityAlert('Error')).toBeNull();
  });

  it('returns reportable verdicts unchanged', () => {
    expect(deriveSecurityAlert('Warning')).toBe('Warning');
    expect(deriveSecurityAlert('Malicious')).toBe('Malicious');
  });
});

describe('getSecurityAlertDescription', () => {
  it('falls back to an unknown-reason description for missing reasons', () => {
    expect(getSecurityAlertDescription(null)).toBe(
      'Security alert: Unknown reason',
    );
    expect(getSecurityAlertDescription(undefined)).toBe(
      'Security alert: Unknown reason',
    );
  });

  it('uses the table description for known reasons', () => {
    expect(getSecurityAlertDescription('honeypot')).toBe(
      'Security alert: The account invests funds in a token that is part of an orchestrated honeypot scheme',
    );
  });

  it('echoes the raw reason for unknown reasons', () => {
    expect(getSecurityAlertDescription('mystery_reason')).toBe(
      'Security alert: mystery_reason',
    );
  });
});
