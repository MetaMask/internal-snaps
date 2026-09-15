/**
 * Base class for snap configuration providers.
 *
 * Owns the configuration lifecycle: the environment is parsed and the
 * configuration built exactly once, when the provider is constructed, then
 * frozen. Subclasses provide the two hooks and keep any snap-specific
 * methods. An environment that fails to parse stops the snap at startup
 * instead of producing undefined behaviour later.
 *
 * @example
 * class ConfigProvider extends BaseConfigProvider<Env, Config> {
 *   protected parseEnvironment(): Env {
 *     return parseEnv({ ... }, EnvStruct);
 *   }
 *
 *   protected buildConfig(environment: Env): Config {
 *     return { ... };
 *   }
 * }
 *
 * export const configProvider = new ConfigProvider();
 */
export abstract class BaseConfigProvider<EnvType, ConfigType> {
  readonly #config: ConfigType;

  constructor() {
    this.#config = this.buildConfig(this.parseEnvironment());
  }

  /**
   * Get the configuration of the snap.
   *
   * @returns The configuration, built once from the environment.
   */
  public get(): ConfigType {
    return this.#config;
  }

  /**
   * Collect the raw environment values consumed by the snap.
   *
   * @returns The raw environment.
   */
  protected abstract parseEnvironment(): EnvType;

  /**
   * Build the snap configuration from a parsed environment, applying
   * snap-specific defaults.
   *
   * @param environment - The parsed environment.
   * @returns The snap configuration.
   */
  protected abstract buildConfig(environment: EnvType): ConfigType;
}
