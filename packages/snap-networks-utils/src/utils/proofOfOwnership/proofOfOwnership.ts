/**
 * Prefix for proof-of-ownership messages signed by network snaps.
 */
export const PROOF_OF_OWNERSHIP_MESSAGE_PREFIX = 'metamask:proof-of-ownership:';

/**
 * Parsed proof-of-ownership message fields.
 */
export type ProofOfOwnershipMessage = {
  /**
   * Opaque server-provided nonce. It may contain `:` characters.
   */
  nonce: string;

  /**
   * Chain-specific account address embedded in the proof message.
   */
  address: string;
};

/**
 * One proof-of-ownership batch request item.
 */
export type ProofOfOwnershipBatchRequestItem = {
  /**
   * Snap account ID to sign with.
   */
  accountId: string;

  /**
   * Plaintext proof-of-ownership message to sign.
   */
  message: string;
};

/**
 * One successful proof-of-ownership batch result.
 */
export type ProofOfOwnershipBatchSuccess = {
  /**
   * Snap account ID from the corresponding request item.
   */
  accountId: string;

  /**
   * Chain-specific proof-of-ownership signature.
   */
  signature: string;
};

/**
 * One failed proof-of-ownership batch result.
 */
export type ProofOfOwnershipBatchError = {
  /**
   * Snap account ID from the corresponding request item.
   */
  accountId: string;

  /**
   * Error message for this request item.
   */
  error: string;
};

/**
 * One proof-of-ownership batch result.
 */
export type ProofOfOwnershipBatchItemResponse =
  | ProofOfOwnershipBatchSuccess
  | ProofOfOwnershipBatchError;

/**
 * Proof-of-ownership batch response shape.
 */
export type ProofOfOwnershipBatchResponse = {
  /**
   * One result per request item, in input order.
   */
  results: ProofOfOwnershipBatchItemResponse[];
};

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
