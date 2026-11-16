import { LocalTranslatorAdapter } from './LocalTranslatorAdapter';

describe('LocalTranslatorAdapter', () => {
  it('loads the messages for the requested locale', async () => {
    const translator = new LocalTranslatorAdapter();
    const messages = await translator.load('de');
    expect(messages.from?.message).toBe('Von');
  });

  it('falls back to English for an unsupported locale', async () => {
    const translator = new LocalTranslatorAdapter();
    const messages = await translator.load('klingon');
    expect(messages.from?.message).toBe('From');
  });

  it('caches the loaded locale', async () => {
    const translator = new LocalTranslatorAdapter();
    const first = await translator.load('de');
    const second = await translator.load('de');
    expect(second).toBe(first);
  });
});
