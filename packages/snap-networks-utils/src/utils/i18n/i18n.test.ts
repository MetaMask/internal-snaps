import { createI18n, FALLBACK_LANGUAGE } from './i18n';

const locales = {
  [FALLBACK_LANGUAGE]: {
    greeting: { message: 'Hello {name}' },
    farewell: { message: 'Goodbye' },
    onlyInEnglish: { message: 'Translated' },
  },
  es: {
    greeting: { message: 'Hola {name}' },
    farewell: { message: 'Adiós' },
    onlyInSpanish: { message: 'Solo español' },
  },
};

describe('createI18n', () => {
  it('returns the correct translation for a given key', () => {
    const translate = createI18n(locales)('en');
    expect(translate('farewell')).toBe('Goodbye');
  });

  it('interpolates placeholders', () => {
    const translate = createI18n(locales)('es');
    expect(translate('greeting', { name: 'Michele' })).toBe('Hola Michele');
  });

  it('replaces a placeholder without a value with an empty string', () => {
    const translate = createI18n(locales)('en');
    expect(
      translate('greeting', { name: undefined as unknown as string }),
    ).toBe('Hello ');
  });

  it('falls back to the fallback locale for an unavailable locale', () => {
    const translate = createI18n(locales)('fr');
    expect(translate('farewell')).toBe('Goodbye');
  });

  it('falls back to the fallback locale for a key missing from the requested locale', () => {
    const translate = createI18n(locales)('es');
    expect(translate('onlyInEnglish')).toBe('Translated');
  });

  it('returns the key when no locale has the message', () => {
    const translate = createI18n(locales)('en');
    expect(translate('onlyInSpanish')).toBe('onlyInSpanish');
  });

  it('returns the key when no catalog is available', () => {
    const translate = createI18n({})('fr');
    expect(translate('farewell')).toBe('farewell');
  });

  it('supports a custom fallback locale', () => {
    const translate = createI18n(locales, 'es')('fr');
    expect(translate('farewell')).toBe('Adiós');
  });
});
