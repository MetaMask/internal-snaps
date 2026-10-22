import questionMarkIcon from '../Asset/question-mark.svg';
import { ActionHeader } from './ActionHeader';

const render = (
  props: Partial<Parameters<typeof ActionHeader>[0]> = {},
): string =>
  JSON.stringify(ActionHeader({ title: 'Transaction request', ...props }));

const spacer = '{"type":"Box","props":{"children":null},"key":null}';

describe('ActionHeader', () => {
  it('renders the title as a large heading between two spacers', () => {
    const serialized = render().replace(/null,/gu, '');

    expect(serialized).toContain('"alignment":"center","center":true');
    expect(serialized).toContain(
      `"children":[${spacer},{"type":"Heading","props":{"size":"lg","children":"Transaction request"},"key":null},${spacer}]`,
    );
  });

  it('renders the subtitle as centered muted text below the title', () => {
    const serialized = render({ subtitle: 'Sign in to the site' });

    expect(serialized).toContain(
      '"color":"muted","alignment":"center","children":"Sign in to the site"',
    );
    expect(serialized.indexOf('Transaction request')).toBeLessThan(
      serialized.indexOf('Sign in to the site'),
    );
  });

  it('renders an extra-large asset icon below the title', () => {
    const serialized = render({ iconUrl: 'https://icon.example/usdc.png' });

    expect(serialized).toContain(
      '"src":"https://icon.example/usdc.png","height":48,"width":48',
    );
    expect(serialized.indexOf('Transaction request')).toBeLessThan(
      serialized.indexOf('usdc.png'),
    );
  });

  it('falls back to the question-mark icon for a blank icon URL', () => {
    const serialized = render({ iconUrl: '' });

    expect(serialized).toContain(JSON.stringify(questionMarkIcon));
  });

  it('renders neither subtitle nor icon by default', () => {
    const serialized = render();

    expect(serialized).not.toContain('"type":"Text"');
    expect(serialized).not.toContain('"type":"Image"');
  });
});
