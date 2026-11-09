import { createI18n } from '@metamask/snap-networks-utils';
import en from '@metamask/snap-networks-utils/locales/solana/en.json';
import es from '@metamask/snap-networks-utils/locales/solana/es.json';

export const locales = {
  en: en.messages,
  es: es.messages,
};

export const FALLBACK_LANGUAGE: Locale = 'en';

export type Locale = keyof typeof locales;
export type LocalizedMessage = keyof (typeof locales)[typeof FALLBACK_LANGUAGE];

/**
 * Fetches the translations based on the user's locale preference.
 * Falls back to the default language if the preferred locale is not available.
 *
 * @param locale - The user's preferred locale.
 * @returns A function that gets the translation for a given key.
 */
export function i18n(locale: Locale) {
  const translate = createI18n(locales)(locale);

  return (id: LocalizedMessage, replaces?: Record<string, string>): string =>
    translate(id, replaces);
}
