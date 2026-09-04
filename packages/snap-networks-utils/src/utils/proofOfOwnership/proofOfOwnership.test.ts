import {
  parseProofOfOwnershipMessage,
  PROOF_OF_OWNERSHIP_MESSAGE_PREFIX,
} from './proofOfOwnership';

describe('parseProofOfOwnershipMessage', () => {
  const nonce = 'a1b2c3d4e5f6789012345678';
  const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  it('extracts the nonce and address from a valid message', () => {
    expect(
      parseProofOfOwnershipMessage(
        `${PROOF_OF_OWNERSHIP_MESSAGE_PREFIX}${nonce}:${address}`,
      ),
    ).toStrictEqual({ nonce, address });
  });

  it('preserves embedded colons in the nonce', () => {
    expect(
      parseProofOfOwnershipMessage(
        `${PROOF_OF_OWNERSHIP_MESSAGE_PREFIX}ns:abc:123:${address}`,
      ),
    ).toStrictEqual({ nonce: 'ns:abc:123', address });
  });

  it.each([
    `rewards,${address},123`,
    `metamask:proof:${nonce}:${address}`,
    `Metamask:proof-of-ownership:${nonce}:${address}`,
    `${nonce}:${address}`,
    '',
  ])('rejects messages without the expected prefix: "%s"', (message) => {
    expect(() => parseProofOfOwnershipMessage(message)).toThrow(
      'Message must start with "metamask:proof-of-ownership:"',
    );
  });

  it('rejects messages missing the address separator', () => {
    expect(() =>
      parseProofOfOwnershipMessage(
        `${PROOF_OF_OWNERSHIP_MESSAGE_PREFIX}${nonce}`,
      ),
    ).toThrow('Message must follow the format');
  });

  it('rejects messages with an empty nonce', () => {
    expect(() =>
      parseProofOfOwnershipMessage(
        `${PROOF_OF_OWNERSHIP_MESSAGE_PREFIX}:${address}`,
      ),
    ).toThrow('non-empty nonce');
  });

  it('rejects messages with an empty address', () => {
    expect(() =>
      parseProofOfOwnershipMessage(
        `${PROOF_OF_OWNERSHIP_MESSAGE_PREFIX}${nonce}:`,
      ),
    ).toThrow('non-empty address');
  });
});
