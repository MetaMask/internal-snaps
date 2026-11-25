import type * as Braze from '@braze/web-sdk';

/**
 * The parts of the Braze Web SDK the snap uses.
 */
export type BrazeSdk = Pick<
  typeof Braze,
  | 'DeviceProperties'
  | 'changeUser'
  | 'destroy'
  | 'getUser'
  | 'initialize'
  | 'isInitialized'
  | 'requestImmediateDataFlush'
>;

export const brazeSdkLoader = {
  /**
   * Evaluate the SDK. The eager mode keeps the SDK in the snap bundle instead
   * of a separate chunk.
   *
   * @returns The SDK.
   */
  load: async (): Promise<BrazeSdk> =>
    import(/* webpackMode: "eager" */ '@braze/web-sdk'),
};
