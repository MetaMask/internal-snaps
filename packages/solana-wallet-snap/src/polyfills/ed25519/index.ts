import {
  exportKey as exportKeyPolyfill,
  generateKey as generateKeyPolyfill,
  importKey as importKeyPolyfill,
  sign as signPolyfill,
  verify as verifyPolyfill,
} from './polyfill';
import { isEd25519Algorithm } from './utils/is-ed25519-algorithm';

/**
 * Adds Ed25519 support to Web Crypto API's native methods.
 *
 * Based on the following libraries:
 * https://github.com/solana-labs/solana-web3.js/tree/master/packages/webcrypto-ed25519-polyfill
 * https://github.com/yoursunny/webcrypto-ed25519.
 *
 */
export function install() {
  const { subtle } = globalThis.crypto;

  const originalGenerateKey = subtle.generateKey.bind(subtle);
  const originalExportKey = subtle.exportKey.bind(subtle);
  const originalSign = subtle.sign.bind(subtle);
  const originalVerify = subtle.verify.bind(subtle);
  const originalImportKey = subtle.importKey.bind(subtle);

  Object.defineProperty(globalThis, 'isSecureContext', {
    value: true,
    writable: true,
    configurable: true,
  });

  /**
   * Override `SubtleCrypto#generateKey`
   */
  Object.defineProperty(subtle, 'generateKey', {
    value: async (...args: Parameters<SubtleCrypto['generateKey']>) => {
      const algorithm = args[0];

      if (!isEd25519Algorithm(algorithm)) {
        return await originalGenerateKey(...args);
      }

      return await generateKeyPolyfill(...args);
    },
    writable: true,
    configurable: true,
  });

  /**
   * Override `SubtleCrypto#exportKey`
   */
  Object.defineProperty(subtle, 'exportKey', {
    value: async (...args: Parameters<SubtleCrypto['exportKey']>) => {
      const key = args[1];

      if (!isEd25519Algorithm(key.algorithm)) {
        return await originalExportKey(...args);
      }

      return await exportKeyPolyfill(...args);
    },
    writable: true,
    configurable: true,
  });

  /**
   * Override `SubtleCrypto#sign`
   */
  Object.defineProperty(subtle, 'sign', {
    value: async (...args: Parameters<SubtleCrypto['sign']>) => {
      const [algorithm, key] = args;

      if (
        !isEd25519Algorithm(algorithm) ||
        !isEd25519Algorithm(key.algorithm)
      ) {
        return await originalSign(...args);
      }

      return await signPolyfill(...args);
    },
    writable: true,
    configurable: true,
  });

  /**
   * Override `SubtleCrypto#verify`
   */
  Object.defineProperty(subtle, 'verify', {
    value: async (...args: Parameters<SubtleCrypto['verify']>) => {
      const [algorithm, key] = args;

      if (
        !isEd25519Algorithm(algorithm) ||
        !isEd25519Algorithm(key.algorithm)
      ) {
        return await originalVerify(...args);
      }

      return await verifyPolyfill(...args);
    },
    writable: true,
    configurable: true,
  });

  /**
   * Override `SubtleCrypto#importKey`
   */
  Object.defineProperty(subtle, 'importKey', {
    value: async (...args: Parameters<SubtleCrypto['importKey']>) => {
      const algorithm = args[2];

      if (!isEd25519Algorithm(algorithm)) {
        return await originalImportKey(...args);
      }

      return await importKeyPolyfill(...args);
    },
    writable: true,
    configurable: true,
  });
}
