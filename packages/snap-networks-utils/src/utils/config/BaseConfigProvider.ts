import type { AnyStruct, Infer } from '@metamask/superstruct';

import { parseEnv } from './parseEnv';

/**
 * A base class that provides the configuration of a snap.
 *
 * The environment is parsed and validated once, when the provider is
 * constructed; an invalid environment throws. Subclasses pass the raw
 * environment and the struct describing it to the base constructor. Use it
 * directly when the snap needs no extra config helpers, or extend it to add
 * them.
 *
 * @example
 * const config = {
 *   environment: process.env.ENVIRONMENT,
 * };
 *
 * const ConfigStruct = object({
 *   environment: enums(Object.values(Environment)),
 * });
 *
 * // When no extra helpers are needed, use the base class directly:
 * const configProvider = new BaseConfigProvider(config, ConfigStruct);
 * const { environment } = configProvider.config;
 *
 * @example
 * // Otherwise, extend it:
 * export class ConfigProvider extends BaseConfigProvider<typeof ConfigStruct> {
 *   constructor() {
 *     super(config, ConfigStruct);
 *   }
 * }
 *
 * const configProvider = new ConfigProvider();
 * const { environment } = configProvider.config;
 */
export class BaseConfigProvider<ConfigStruct extends AnyStruct> {
  readonly #config: Infer<ConfigStruct>;

  /**
   * Construct the provider, parsing the environment once.
   *
   * @param configJson - The configuration JSON for the snap: an object literal referencing
   * the `process.env` variables consumed by the snap, nested to mirror the
   * struct where needed.
   * @param configStruct - The struct describing the configuration, including
   * coercions from raw strings to typed values.
   */
  constructor(configJson: Record<string, unknown>, configStruct: ConfigStruct) {
    this.#config = parseEnv(configJson, configStruct);
  }

  /**
   * Retrieves configuration of the snap.
   *
   * @returns The configuration, built once from the environment.
   */
  get config(): Infer<ConfigStruct> {
    return this.#config;
  }
}
