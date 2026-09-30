import {
  METAMASK_ORIGIN_URL,
  normalizeScanOrigin,
  SecurityAlertResponse,
  SecurityAlertsScanOption,
  SecurityAlertsScanStatus,
} from './types';

describe('normalizeScanOrigin', () => {
  it('maps the MetaMask in-app origin to its URL', () => {
    expect(normalizeScanOrigin('metamask')).toBe(METAMASK_ORIGIN_URL);
  });

  it('returns other origins unchanged', () => {
    expect(normalizeScanOrigin('https://example.com')).toBe(
      'https://example.com',
    );
  });
});

describe('shared scan vocabulary', () => {
  it('exposes the Security Alerts API scan options', () => {
    expect(SecurityAlertsScanOption).toStrictEqual({
      Simulation: 'simulation',
      Validation: 'validation',
    });
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
    });
  });
});
