import { MaliciousAcknowledgementFormNames } from './MaliciousAcknowledgementFormNames';
import { MaliciousAcknowledgementScreen } from './MaliciousAcknowledgementScreen';

const labels = {
  title: 'Malicious request',
  description:
    'If you confirm this request, you will probably lose your assets to a scammer.',
  checkbox: 'I have acknowledged the risk and still want to proceed',
  proceed: 'Confirm',
  back: 'Go back',
};

const render = (
  props: Partial<Parameters<typeof MaliciousAcknowledgementScreen>[0]>,
): string =>
  JSON.stringify(MaliciousAcknowledgementScreen({ labels, ...props }));

describe('MaliciousAcknowledgementScreen', () => {
  it('renders the danger banner and the risk checkbox', () => {
    const serialized = render({});

    expect(serialized).toContain('"severity":"danger"');
    expect(serialized).toContain(labels.title);
    expect(serialized).toContain(labels.description);
    expect(serialized).toContain(labels.checkbox);
    expect(serialized).toContain(MaliciousAcknowledgementFormNames.Acknowledge);
  });

  it('disables the proceed button until the risk checkbox is checked', () => {
    const serialized = render({ acknowledged: false });

    expect(serialized).toContain('"disabled":true');
    expect(serialized).toContain(labels.proceed);
    expect(serialized).toContain(labels.back);
  });

  it('enables the proceed button once the risk is acknowledged', () => {
    const serialized = render({ acknowledged: true });

    expect(serialized).not.toContain('"disabled":true');
  });
});
