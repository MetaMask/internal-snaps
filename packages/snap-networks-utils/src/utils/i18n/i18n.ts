/**
 * A single locale's catalog: message ids mapped to their translations.
 * Values may be missing when a locale is only partially translated.
 */
export type LocaleMessages =
  | Record<string, { message: string } | undefined>
  | undefined;

/**
 * Locale codes mapped to their message catalogs.
 */
export type Locales = Record<string, LocaleMessages>;

export const FALLBACK_LANGUAGE = 'en';

/**
 * Translates a message id, interpolating `{placeholder}` values.
 */
export type Translate = (
  id: string,
  replaces?: Record<string, string>,
) => string;

/**
 * Creates an i18n factory for a set of locale catalogs.
 *
 * @param locales - The available locale catalogs.
 * @param fallbackLocale - The locale to fall back to when the requested
 * locale (or a message within it) is not available. Defaults to `'en'`.
 * @returns A function that takes a locale and returns a translate function,
 * falling back to the fallback locale.
 */
export function createI18n(
  locales: Locales,
  fallbackLocale: string = FALLBACK_LANGUAGE,
): (locale: string) => Translate {
  return (locale: string) => {
    const messages = locales[locale] ?? locales[fallbackLocale];

    return (id: string, replaces?: Record<string, string>): string => {
      let message = messages?.[id]?.message ?? id;

      if (replaces && message) {
        for (const key of Object.keys(replaces)) {
          const regex = new RegExp(`\\{${key}\\}`, 'gu');
          message = message.replace(regex, replaces[key] ?? '');
        }
      }

      return message;
    };
  };
}
