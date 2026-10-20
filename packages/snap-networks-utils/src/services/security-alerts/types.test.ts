import {
  SECURITY_ALERTS_SCAN_OPTIONS,
  SecurityAlertResponse,
  SecurityAlertsScanStatus,
} from './types';

describe('shared scan vocabulary', () => {
  it('exposes the Security Alerts API scan options', () => {
    expect(SECURITY_ALERTS_SCAN_OPTIONS).toStrictEqual([
      'simulation',
      'validation',
    ]);
  });

  it('exposes the scan statuses', () => {
    expect(SecurityAlertsScanStatus).toStrictEqual({
      SUCCESS: 'SUCCESS',
      ERROR: 'ERROR',
    });
  });

  it('exposes the security alert verdicts', () => {
    expect(SecurityAlertResponse).toStrictEqual({
      Benign: 'Benign',
      Warning: 'Warning',
      Malicious: 'Malicious',
      Error: 'Error',
    });
  });
});
