import type { Infer } from '@metamask/superstruct';
import { array, nonempty, object, string, union } from '@metamask/superstruct';

import { UuidStruct } from '../uuidStruct/uuidStruct';

/**
 * Prefix for proof-of-ownership messages signed by network snaps.
 */
export const PROOF_OF_OWNERSHIP_MESSAGE_PREFIX = 'metamask:proof-of-ownership:';

/**
 * Validates parsed proof-of-ownership message fields.
 */
export const ProofOfOwnershipMessageStruct = object({
  nonce: nonempty(string()),
  address: nonempty(string()),
});

/**
 * Parsed proof-of-ownership message fields.
 */
export type ProofOfOwnershipMessage = Infer<
  typeof ProofOfOwnershipMessageStruct
>;

/**
 * Validates one proof-of-ownership batch request item.
 */
export const ProofOfOwnershipBatchRequestItemStruct = object({
  accountId: UuidStruct,
  message: string(),
});

/**
 * One proof-of-ownership batch request item.
 */
export type ProofOfOwnershipBatchRequestItem = Infer<
  typeof ProofOfOwnershipBatchRequestItemStruct
>;

/**
 * Validates proof-of-ownership batch request params.
 */
export const ProofOfOwnershipBatchRequestParamsStruct = object({
  items: array(ProofOfOwnershipBatchRequestItemStruct),
});

/**
 * Proof-of-ownership batch request params.
 */
export type ProofOfOwnershipBatchRequestParams = Infer<
  typeof ProofOfOwnershipBatchRequestParamsStruct
>;

/**
 * Validates one successful proof-of-ownership batch result.
 */
export const ProofOfOwnershipBatchSuccessStruct = object({
  accountId: UuidStruct,
  signature: string(),
});

/**
 * One successful proof-of-ownership batch result.
 */
export type ProofOfOwnershipBatchSuccess = Infer<
  typeof ProofOfOwnershipBatchSuccessStruct
>;

/**
 * Validates one failed proof-of-ownership batch result.
 */
export const ProofOfOwnershipBatchErrorStruct = object({
  accountId: UuidStruct,
  error: nonempty(string()),
});

/**
 * One failed proof-of-ownership batch result.
 */
export type ProofOfOwnershipBatchError = Infer<
  typeof ProofOfOwnershipBatchErrorStruct
>;

/**
 * Validates one proof-of-ownership batch result.
 */
export const ProofOfOwnershipBatchItemResponseStruct = union([
  ProofOfOwnershipBatchSuccessStruct,
  ProofOfOwnershipBatchErrorStruct,
]);

/**
 * One proof-of-ownership batch result.
 */
export type ProofOfOwnershipBatchItemResponse = Infer<
  typeof ProofOfOwnershipBatchItemResponseStruct
>;

/**
 * Validates a proof-of-ownership batch response.
 */
export const ProofOfOwnershipBatchResponseStruct = object({
  results: array(ProofOfOwnershipBatchItemResponseStruct),
});

/**
 * Proof-of-ownership batch response shape.
 */
export type ProofOfOwnershipBatchResponse = Infer<
  typeof ProofOfOwnershipBatchResponseStruct
>;

/**
 * Parses a plaintext proof-of-ownership message in the format
 * `metamask:proof-of-ownership:{nonce}:{address}`.
 *
 * Address validity is intentionally not checked here because it is
 * chain-specific. Callers should validate the returned address with the
 * relevant network/address validator.
 *
 * @param message - The plaintext message to parse.
 * @returns The parsed nonce and address.
 * @throws Error if the message format is invalid.
 */
export function parseProofOfOwnershipMessage(
  message: string,
): ProofOfOwnershipMessage {
  if (!message.startsWith(PROOF_OF_OWNERSHIP_MESSAGE_PREFIX)) {
    throw new Error(
      `Message must start with "${PROOF_OF_OWNERSHIP_MESSAGE_PREFIX}"`,
    );
  }

  const remainder = message.slice(PROOF_OF_OWNERSHIP_MESSAGE_PREFIX.length);
  const separatorIndex = remainder.lastIndexOf(':');
  if (separatorIndex === -1) {
    throw new Error(
      'Message must follow the format "metamask:proof-of-ownership:{nonce}:{address}"',
    );
  }

  const nonce = remainder.slice(0, separatorIndex);
  const address = remainder.slice(separatorIndex + 1);

  if (nonce.length === 0) {
    throw new Error('Message must include a non-empty nonce');
  }

  if (address.length === 0) {
    throw new Error('Message must include a non-empty address');
  }

  return { nonce, address };
}
