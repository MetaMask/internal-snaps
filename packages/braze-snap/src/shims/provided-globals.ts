/**
 * The browser globals the SDK expects. The bundler resolves every free
 * reference to one of these names to the matching export of `./globals.ts`,
 * so the SDK never reaches the real snap globals.
 */
export const PROVIDED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'location',
  'screen',
  'localStorage',
  'XMLHttpRequest',
  'CustomEvent',
  'dispatchEvent',
  'addEventListener',
  'removeEventListener',
] as const;

export type ProvidedGlobal = (typeof PROVIDED_GLOBALS)[number];
