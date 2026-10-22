import {
  deriveSecurityAlert,
  getSecurityAlertDescription,
  requiresMaliciousAcknowledgement,
} from './utils';

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

describe('requiresMaliciousAcknowledgement', () => {
  it('requires acknowledgement for a malicious verdict with security alerts on', () => {
    expect(
      requiresMaliciousAcknowledgement({
        useSecurityAlerts: true,
        scan: { status: 'SUCCESS', validation: { type: 'Malicious' } },
      }),
    ).toBe(true);
  });

  it('does not require acknowledgement when security alerts are off', () => {
    expect(
      requiresMaliciousAcknowledgement({
        useSecurityAlerts: false,
        scan: { status: 'SUCCESS', validation: { type: 'Malicious' } },
      }),
    ).toBe(false);
  });

  it('does not require acknowledgement for a missing scan', () => {
    expect(
      requiresMaliciousAcknowledgement({ useSecurityAlerts: true, scan: null }),
    ).toBe(false);
    expect(requiresMaliciousAcknowledgement({ useSecurityAlerts: true })).toBe(
      false,
    );
  });

  it('does not require acknowledgement for a missing validation', () => {
    expect(
      requiresMaliciousAcknowledgement({
        useSecurityAlerts: true,
        scan: { status: 'ERROR', validation: null },
      }),
    ).toBe(false);
  });

  it('does not require acknowledgement for warning and benign verdicts', () => {
    expect(
      requiresMaliciousAcknowledgement({
        useSecurityAlerts: true,
        scan: { status: 'SUCCESS', validation: { type: 'Warning' } },
      }),
    ).toBe(false);
    expect(
      requiresMaliciousAcknowledgement({
        useSecurityAlerts: true,
        scan: { status: 'SUCCESS', validation: { type: 'Benign' } },
      }),
    ).toBe(false);
  });
});
