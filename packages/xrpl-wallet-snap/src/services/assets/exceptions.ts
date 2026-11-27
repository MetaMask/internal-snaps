import { XrplSnapException } from '../../utils/errors';
import type { XrplSnapExceptionOptions } from '../../utils/errors';

/** Base for all assets-related errors (asset loading, metadata fetching). */
export class AssetsServiceException extends XrplSnapException {}

/** Thrown when an AssetsController read fails inside {@link CoreAssetsAdapter}. */
export class CoreAssetsAdapterException extends AssetsServiceException {}

/** Thrown when a Core asset is not valid. */
export class InvalidCoreAssetException extends AssetsServiceException {
  constructor(message: string, options?: XrplSnapExceptionOptions) {
    super(`Failed to parse Core asset: ${message}`, options);
  }
}
