import { Asset, AssetIcon } from './Asset';
import questionMarkIcon from './question-mark.svg';

const render = (props: Partial<Parameters<typeof Asset>[0]> = {}): string =>
  JSON.stringify(Asset({ symbol: 'XLM', amount: '1.5', ...props }));

describe('AssetIcon', () => {
  it('renders the icon URL as a round image of the requested size', () => {
    const serialized = JSON.stringify(
      AssetIcon({ iconUrl: 'https://icon.example/xlm.svg', size: 'xl' }),
    );

    expect(serialized).toContain('"src":"https://icon.example/xlm.svg"');
    expect(serialized).toContain('"borderRadius":"full"');
    expect(serialized).toContain('"height":48');
    expect(serialized).toContain('"width":48');
  });

  it.each([undefined, null, '', '   '])(
    'falls back to the question-mark icon for %p',
    (iconUrl) => {
      const serialized = JSON.stringify(AssetIcon({ iconUrl }));

      expect(serialized).toContain(JSON.stringify(questionMarkIcon));
      expect(serialized).toContain('"height":16');
    },
  );
});

describe('Asset', () => {
  it('renders the amount and symbol next to the icon', () => {
    const serialized = render({ iconUrl: 'https://icon.example/xlm.svg' });

    expect(serialized).toContain('"children":"1.5 XLM"');
    expect(serialized).toContain('"src":"https://icon.example/xlm.svg"');
  });

  it('renders only the symbol when there is no amount', () => {
    const serialized = render({ amount: undefined });

    expect(serialized).toContain('"children":"XLM"');
  });

  it('renders the asset text as a link when a link is provided', () => {
    const serialized = render({ link: 'https://explorer.example/xlm' });

    expect(serialized).toContain('"type":"Link"');
    expect(serialized).toContain('"href":"https://explorer.example/xlm"');
  });

  it('renders a Snaps icon instead of the image when an icon name is provided', () => {
    const serialized = render({ iconName: 'flash' });

    expect(serialized).toContain('"name":"flash"');
    expect(serialized).not.toContain('"type":"Image"');
  });

  it('renders no icon when the icon is hidden', () => {
    const serialized = render({ hideIcon: true });

    expect(serialized).not.toContain('"type":"Image"');
    expect(serialized).not.toContain('"type":"Icon"');
  });

  it('renders the fiat value before the amount', () => {
    const serialized = render({ fiat: '$0.45' });

    expect(serialized).toContain('"children":"$0.45"');
    expect(serialized.indexOf('$0.45')).toBeLessThan(
      serialized.indexOf('1.5 XLM'),
    );
  });

  it('renders a skeleton instead of the fiat value while it loads', () => {
    const serialized = render({ fiat: '$0.45', isFiatLoading: true });

    expect(serialized).toContain('"type":"Skeleton"');
    expect(serialized).not.toContain('$0.45');
  });

  it('renders neither fiat nor skeleton when there is no fiat value', () => {
    const serialized = render({ fiat: null });

    expect(serialized).not.toContain('"type":"Skeleton"');
    expect(serialized).not.toContain('"color":"muted"');
  });
});
