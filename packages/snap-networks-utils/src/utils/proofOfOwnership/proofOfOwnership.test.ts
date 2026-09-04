import { assert, StructError } from '@metamask/superstruct';

import {
  ProofOfOwnershipBatchRequestItemStruct,
  ProofOfOwnershipBatchRequestParamsStruct,
  ProofOfOwnershipBatchResponseStruct,
  ProofOfOwnershipMessageStruct,
  parseProofOfOwnershipMessage,
  PROOF_OF_OWNERSHIP_MESSAGE_PREFIX,
} from './proofOfOwnership.js';

const accountId = '11111111-1111-4111-8111-111111111111';

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

describe('ProofOfOwnershipMessageStruct', () => {
  it('accepts parsed proof-of-ownership message fields', () => {
    expect(() =>
      assert(
        {
          nonce: 'nonce',
          address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        },
        ProofOfOwnershipMessageStruct,
      ),
    ).not.toThrow();
  });

  it.each([
    {
      nonce: '',
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    },
    { nonce: 'nonce', address: '' },
    {
      nonce: 123,
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    },
    { nonce: 'nonce', address: 123 },
  ])('rejects invalid parsed proof message fields', (value) => {
    expect(() => assert(value, ProofOfOwnershipMessageStruct)).toThrow(
      StructError,
    );
  });
});

describe('ProofOfOwnershipBatchRequestItemStruct', () => {
  it('accepts a valid batch request item', () => {
    expect(() =>
      assert(
        {
          accountId,
          message: 'metamask:proof-of-ownership:nonce:address',
        },
        ProofOfOwnershipBatchRequestItemStruct,
      ),
    ).not.toThrow();
  });

  it.each([
    { accountId: 'not-a-uuid', message: 'message' },
    { accountId, message: 123 },
    { message: 'message' },
    { accountId },
  ])('rejects invalid batch request items', (value) => {
    expect(() => assert(value, ProofOfOwnershipBatchRequestItemStruct)).toThrow(
      StructError,
    );
  });
});

describe('ProofOfOwnershipBatchRequestParamsStruct', () => {
  it('accepts valid batch request params', () => {
    expect(() =>
      assert(
        {
          items: [
            {
              accountId,
              message: 'metamask:proof-of-ownership:nonce:address',
            },
          ],
        },
        ProofOfOwnershipBatchRequestParamsStruct,
      ),
    ).not.toThrow();
  });

  it.each([
    {},
    { items: 'not-an-array' },
    { items: [{ accountId: 'not-a-uuid', message: 'message' }] },
  ])('rejects invalid batch request params', (value) => {
    expect(() =>
      assert(value, ProofOfOwnershipBatchRequestParamsStruct),
    ).toThrow(StructError);
  });
});

describe('ProofOfOwnershipBatchResponseStruct', () => {
  it('accepts success and error batch results', () => {
    expect(() =>
      assert(
        {
          results: [
            {
              accountId,
              signature: 'chain-specific-signature',
            },
            {
              accountId: '22222222-2222-4222-8222-222222222222',
              error: 'Account not found',
            },
          ],
        },
        ProofOfOwnershipBatchResponseStruct,
      ),
    ).not.toThrow();
  });

  it('keeps signature validation chain-agnostic', () => {
    expect(() =>
      assert(
        {
          results: [
            {
              accountId,
              signature: 'AkcwRAIgZxodJQ60t9Rr/hABEHZ1zPUJ4m5hdM5QLpysH8fDSzg=',
            },
          ],
        },
        ProofOfOwnershipBatchResponseStruct,
      ),
    ).not.toThrow();
  });

  it.each([
    {},
    { results: 'not-an-array' },
    { results: [{ accountId: 'not-a-uuid', signature: 'signature' }] },
    { results: [{ accountId, signature: 123 }] },
    { results: [{ accountId, error: '' }] },
    { results: [{ accountId, error: 123 }] },
  ])('rejects invalid batch responses', (value) => {
    expect(() => assert(value, ProofOfOwnershipBatchResponseStruct)).toThrow(
      StructError,
    );
  });
});
