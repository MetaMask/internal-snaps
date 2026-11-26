import { assertJSXElement } from '@metamask/snaps-sdk/jsx';

import type { TransactionScanResult } from '../../../../core/services/transaction-scan/types';
import type { Preferences } from '../../../../core/types/snap';
import { i18n } from '../../../../core/utils/i18n';
import { SecurityScanAlert } from './SecurityScanAlert';

const translate = i18n('en');
const MALICIOUS_TITLE = translate('confirmation.validationErrorTitle');
const UNAVAILABLE_TITLE = translate(
  'confirmation.securityScanUnavailableTitle',
);

const preferences = { locale: 'en', useSecurityAlerts: true } as Preferences;

const maliciousScan: TransactionScanResult = {
  status: 'SUCCESS',
  estimatedChanges: { assets: [] },
  validation: { type: 'Malicious', reason: null },
  error: null,
  validationError: null,
};

describe('SecurityScanAlert', () => {
  it.each([
    { scanFetchStatus: 'error' as const },
    { scanFetchStatus: 'fetching' as const },
  ])('passes runtime UI validation for %j', (props) => {
    expect(() =>
      assertJSXElement(
        SecurityScanAlert({
          scan: null,
          preferences: { locale: 'en', useSecurityAlerts: true } as Preferences,
          ...props,
        }),
      ),
    ).not.toThrow();
  });

  it('shows the malicious verdict, not the unavailable notice, when a refresh failed after a malicious scan', () => {
    const text = JSON.stringify(
      SecurityScanAlert({
        scan: maliciousScan,
        scanFetchStatus: 'error',
        preferences,
      }),
    );

    expect(text).toContain(MALICIOUS_TITLE);
    expect(text).not.toContain(UNAVAILABLE_TITLE);
  });

  it('shows the unavailable notice when the scan failed and there is no verdict', () => {
    const text = JSON.stringify(
      SecurityScanAlert({
        scan: null,
        scanFetchStatus: 'error',
        preferences,
      }),
    );

    expect(text).toContain(UNAVAILABLE_TITLE);
    expect(text).not.toContain(MALICIOUS_TITLE);
  });

  it('shows the unavailable notice when the security scan itself failed', () => {
    const text = JSON.stringify(
      SecurityScanAlert({
        scan: {
          ...maliciousScan,
          validation: { type: null, reason: null },
          validationError: { type: 'validation', code: null, message: null },
        },
        scanFetchStatus: 'fetched',
        preferences,
      }),
    );

    expect(text).toContain(UNAVAILABLE_TITLE);
  });

  it.each([
    {
      type: 'Malicious',
      subtitle: 'confirmation.validationErrorSubtitle' as const,
    },
    {
      type: 'Warning',
      subtitle: 'confirmation.validationWarningSubtitle' as const,
    },
  ])(
    'shows the translated copy, not the raw Blockaid description, for %j',
    ({ type, subtitle }) => {
      const text = JSON.stringify(
        SecurityScanAlert({
          scan: {
            ...maliciousScan,
            validation: {
              type,
              reason: 'known_attacker',
              description: 'Raw Blockaid text',
            },
          },
          scanFetchStatus: 'fetched',
          preferences,
        }),
      );

      expect(text).toContain(translate(subtitle));
      expect(text).not.toContain('Raw Blockaid text');
    },
  );
});
