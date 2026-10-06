import { TransactionAlert } from './TransactionAlert';

const labels = {
  scanInProgressTitle: 'Checking for security issues',
  scanInProgressMessage: 'This usually takes a few seconds.',
  scanFailedTitle: 'Security scan failed',
  scanFailedMessage: 'Only continue if you trust every address involved.',
  maliciousTitle: 'This is a deceptive request',
  maliciousMessage: 'A third party known for scams will take all your assets.',
  warningTitle: 'This request may be risky',
  warningMessage: 'Security Alerts found potential risk.',
  learnMore: 'Learn more',
  securityAdvisedBy: 'Security advice by',
};

const error = { title: 'Simulation failed', message: 'Insufficient funds' };

const render = (
  props: Partial<Parameters<typeof TransactionAlert>[0]>,
): string =>
  JSON.stringify(
    TransactionAlert({
      labels,
      isFetching: false,
      isFetchError: false,
      error: null,
      validation: null,
      ...props,
    }),
  );

describe('TransactionAlert', () => {
  it('renders an in-progress banner while fetching, ahead of any other alert', () => {
    const serialized = render({
      isFetching: true,
      isFetchError: true,
      error,
      validation: { type: 'Malicious' },
    });

    expect(serialized).toContain('"severity":"info"');
    expect(serialized).toContain(labels.scanInProgressTitle);
    expect(serialized).toContain(labels.scanInProgressMessage);
    expect(serialized).not.toContain(labels.scanFailedTitle);
  });

  it('renders a danger banner when the scan request fails, ahead of scan results', () => {
    const serialized = render({
      isFetchError: true,
      error,
      validation: { type: 'Malicious' },
    });

    expect(serialized).toContain('"severity":"danger"');
    expect(serialized).toContain(labels.scanFailedTitle);
    expect(serialized).toContain(labels.scanFailedMessage);
    expect(serialized).not.toContain(error.title);
  });

  it('renders a warning banner for a scan error, ahead of the validation', () => {
    const serialized = render({ error, validation: { type: 'Malicious' } });

    expect(serialized).toContain('"severity":"warning"');
    expect(serialized).toContain(error.title);
    expect(serialized).toContain(error.message);
    expect(serialized).not.toContain(labels.maliciousTitle);
  });

  it('renders a danger security banner for a malicious validation', () => {
    const serialized = render({ validation: { type: 'Malicious' } });

    expect(serialized).toContain('"severity":"danger"');
    expect(serialized).toContain(labels.maliciousTitle);
    expect(serialized).toContain(labels.maliciousMessage);
    expect(serialized).toContain(
      'https://support.metamask.io/configure/wallet/how-to-turn-on-security-alerts/',
    );
    expect(serialized).toContain(labels.learnMore);
    expect(serialized).toContain(labels.securityAdvisedBy);
    expect(serialized).toContain('https://www.blockaid.io');
  });

  it('renders a warning security banner for a warning validation', () => {
    const serialized = render({ validation: { type: 'Warning' } });

    expect(serialized).toContain('"severity":"warning"');
    expect(serialized).toContain(labels.warningTitle);
    expect(serialized).toContain(labels.warningMessage);
  });

  it('uses the validation description as the message when provided', () => {
    const serialized = render({
      validation: { type: 'Warning', description: '  Known drainer  ' },
    });

    expect(serialized).toContain('"Known drainer"');
    expect(serialized).not.toContain(labels.warningMessage);
  });

  it('falls back to the default message for a blank description', () => {
    const serialized = render({
      validation: { type: 'Warning', description: '   ' },
    });

    expect(serialized).toContain(labels.warningMessage);
  });

  it.each([null, 'Benign', 'Error'])(
    'renders nothing for a %s validation type',
    (type) => {
      expect(
        TransactionAlert({
          labels,
          isFetching: false,
          isFetchError: false,
          error: null,
          validation: { type },
        }),
      ).toBeNull();
    },
  );

  it('renders nothing without an error or a validation', () => {
    expect(
      TransactionAlert({
        labels,
        isFetching: false,
        isFetchError: false,
        error: null,
        validation: null,
      }),
    ).toBeNull();
  });
});
