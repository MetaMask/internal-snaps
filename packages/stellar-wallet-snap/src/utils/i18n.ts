import { createI18n } from '@metamask/snap-networks-utils';
import en from '@metamask/snap-networks-utils/locales/stellar/en.json';
import es from '@metamask/snap-networks-utils/locales/stellar/es.json';

export const locales = {
  en: en.messages,
  es: es.messages,
};

export const FALLBACK_LANGUAGE: Locale = 'en';

export type Locale = keyof typeof locales;
/** When locale `messages` is an empty object, `keyof` is `never`; fall back to `string` for keys. */
type MessageKeys = keyof (typeof locales)[typeof FALLBACK_LANGUAGE];
export type LocalizedMessage = [MessageKeys] extends [never]
  ? string
  : MessageKeys;

/**
 * Fetches the translations based on the user's locale preference.
 * Falls back to the default language if the preferred locale is not available.
 *
 * @param locale - The user's preferred locale.
 * @returns A function that gets the translation for a given key.
 */
export function i18n(locale: string) {
  const translate = createI18n(locales)(locale);

  return (id: LocalizedMessage, replaces?: Record<string, string>): string =>
    translate(id, replaces);
}
