import { isPlainObject } from '@metamask/utils';

import type { Messages, Translator } from '../entities';

/**
 * Checks whether a dynamically imported module is a locale bundle exposing its
 * messages.
 *
 * @param value - The imported locale module.
 * @returns Whether the module can be used as a locale bundle.
 */
const isLocaleBundle = (value: unknown): value is { messages: Messages } =>
  isPlainObject(value) && isPlainObject(value.messages);

export class LocalTranslatorAdapter implements Translator {
  #messages: Messages;

  #locale: string;

  constructor() {
    this.#locale = '';
    this.#messages = {};
  }

  async load(locale: string): Promise<Messages> {
    if (this.#locale === locale) {
      return this.#messages;
    }

    try {
      this.#messages = await this.#loadMessages(locale);
    } catch {
      this.#messages = await this.#loadMessages('en');
    }

    this.#locale = locale;
    return this.#messages;
  }

  /**
   * Loads the messages of a locale, importing only that locale's JSON bundle.
   *
   * @param locale - The locale to load the messages for.
   * @returns The messages of the locale.
   */
  async #loadMessages(locale: string): Promise<Messages> {
    const bundle: unknown = await import(`../../locales/${locale}.json`);

    if (!isLocaleBundle(bundle)) {
      throw new Error(`Missing messages in the "${locale}" locale bundle`);
    }

    return bundle.messages;
  }
}
