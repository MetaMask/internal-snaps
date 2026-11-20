import { i18n, locales } from './i18n';

describe('i18n', () => {
  it('returns the correct translation for a given key', () => {
    const translate = i18n('en');
    const message = translate('send.balance');
    expect(message).toBe(locales.en['send.balance'].message);
  });

  it('returns the correct translation for a given key and replaces', () => {
    const translate = i18n('en');
    const message = translate('send.transaction-failure.subtitle', {
      amount: '1.23',
      tokenSymbol: 'SOL',
    });
    expect(message).toBe('Unable to send 1.23 SOL');
  });

  it('falls back to the default language if the preferred locale is not available', () => {
    // @ts-expect-error - 'fr' is not an available locale; the fallback is
    // what this test exercises.
    const translate = i18n('fr');
    const message = translate('send.balance');
    expect(message).toBe(locales.en['send.balance'].message);
  });

  it('returns the key for a non-existent key', () => {
    const translate = i18n('en');
    // @ts-expect-error - the key is intentionally absent from the dictionary.
    const message = translate('nonExistentKey');
    expect(message).toBe('nonExistentKey');
  });
});
