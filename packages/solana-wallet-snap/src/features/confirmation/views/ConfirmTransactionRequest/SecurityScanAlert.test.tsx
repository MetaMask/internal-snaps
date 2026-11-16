import { assertJSXElement } from '@metamask/snaps-sdk/jsx';

import type { Preferences } from '../../../../core/types/snap';
import { SecurityScanAlert } from './SecurityScanAlert';

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
});
