import { FALLBACK_LANGUAGE } from '@metamask/snap-networks-utils';
import de from '@metamask/snap-networks-utils/locales/bitcoin/de.json';
import el from '@metamask/snap-networks-utils/locales/bitcoin/el.json';
import en from '@metamask/snap-networks-utils/locales/bitcoin/en.json';
import es from '@metamask/snap-networks-utils/locales/bitcoin/es.json';
import es419 from '@metamask/snap-networks-utils/locales/bitcoin/es_419.json';
import fr from '@metamask/snap-networks-utils/locales/bitcoin/fr.json';
import hi from '@metamask/snap-networks-utils/locales/bitcoin/hi.json';
import id from '@metamask/snap-networks-utils/locales/bitcoin/id.json';
import ja from '@metamask/snap-networks-utils/locales/bitcoin/ja.json';
import ko from '@metamask/snap-networks-utils/locales/bitcoin/ko.json';
import pt from '@metamask/snap-networks-utils/locales/bitcoin/pt.json';
import ru from '@metamask/snap-networks-utils/locales/bitcoin/ru.json';
import tl from '@metamask/snap-networks-utils/locales/bitcoin/tl.json';
import tr from '@metamask/snap-networks-utils/locales/bitcoin/tr.json';
import vi from '@metamask/snap-networks-utils/locales/bitcoin/vi.json';
import zhCN from '@metamask/snap-networks-utils/locales/bitcoin/zh_CN.json';

import type { Messages, Translator } from '../entities';

const locales: Record<string, Messages> = {
  de: de.messages,
  el: el.messages,
  en: en.messages,
  es: es.messages,
  es_419: es419.messages,
  fr: fr.messages,
  hi: hi.messages,
  id: id.messages,
  ja: ja.messages,
  ko: ko.messages,
  pt: pt.messages,
  ru: ru.messages,
  tl: tl.messages,
  tr: tr.messages,
  vi: vi.messages,
  zh_CN: zhCN.messages,
};

export class LocalTranslatorAdapter implements Translator {
  #locale = '';

  #messages: Messages = {};

  async load(locale: string): Promise<Messages> {
    if (this.#locale === locale) {
      return this.#messages;
    }

    this.#messages = locales[locale] ?? locales[FALLBACK_LANGUAGE] ?? {};
    this.#locale = locale;
    return this.#messages;
  }
}
