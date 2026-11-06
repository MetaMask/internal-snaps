import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { TOKEN_2022_PROGRAM_ADDRESS } from '@solana-program/token-2022';
import * as SolanaKit from '@solana/kit';
import type { Mock } from 'vitest';

import { Network } from '../../constants/solana';
import { mockLogger } from '../__mocks__/logger';
import type { SolanaConnection } from '../connection';
import { RecipientClassifier } from './RecipientClassifier';

describe('RecipientClassifier', () => {
  let classifier: RecipientClassifier;
  let mockConnection: SolanaConnection;
  let mockRpc: any;
  let assertAccountExists: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(SolanaKit, 'address').mockImplementation(
      (value) => value as never,
    );
    assertAccountExists = vi.spyOn(
      SolanaKit,
      'assertAccountExists',
    ) as unknown as Mock;
    assertAccountExists.mockImplementation(() => undefined);

    mockRpc = {
      getAccountInfo: vi.fn(),
    };

    mockConnection = {
      getRpc: vi.fn().mockReturnValue(mockRpc),
      fetchJsonParsedAccount: vi.fn(),
    } as unknown as SolanaConnection;

    classifier = new RecipientClassifier(mockConnection, mockLogger);
  });

  describe('classify', () => {
    const recipientAddress = '9iWxPhaTyvUckBA3GqBaa8zfqeyT6UKokJs2MfimYgkr';
    const network = Network.Mainnet;

    it('classifies non-existent account as SYSTEM', async () => {
      const mockAccountInfo = null;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo as any,
      );

      assertAccountExists.mockImplementation(() => {
        throw new Error('Account does not exist');
      });

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({ type: 'SYSTEM' });
      expect(mockConnection.fetchJsonParsedAccount).toHaveBeenCalledWith(
        recipientAddress,
        network,
      );
    });

    it('classifies system program account as SYSTEM', async () => {
      const mockAccountInfo = {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({ type: 'SYSTEM' });
    });

    it('classifies token program account as TOKEN_ACCOUNT', async () => {
      const mintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const ownerAddress = '9iWxPhaTyvUckBA3GqBaa8zfqeyT6UKokJs2MfimYgkr';

      const mockAccountInfo = {
        programAddress: TOKEN_PROGRAM_ADDRESS,
        data: {
          mint: mintAddress,
          owner: ownerAddress,
        },
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({
        type: 'TOKEN_ACCOUNT',
        mint: mintAddress,
      });
    });

    it('classifies token 2022 program account as TOKEN_ACCOUNT', async () => {
      const mintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const ownerAddress = '9iWxPhaTyvUckBA3GqBaa8zfqeyT6UKokJs2MfimYgkr';

      const mockAccountInfo = {
        programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        data: {
          mint: mintAddress,
          owner: ownerAddress,
        },
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({
        type: 'TOKEN_ACCOUNT',
        mint: mintAddress,
      });
    });

    it('classifies token account without mint as UNSUPPORTED', async () => {
      const ownerAddress = '9iWxPhaTyvUckBA3GqBaa8zfqeyT6UKokJs2MfimYgkr';

      const mockAccountInfo = {
        programAddress: TOKEN_PROGRAM_ADDRESS,
        data: {
          owner: ownerAddress,
          // mint is missing
        },
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({ type: 'UNSUPPORTED' });
    });

    it('classifies token account without owner as UNSUPPORTED', async () => {
      const mintAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      const mockAccountInfo = {
        programAddress: TOKEN_PROGRAM_ADDRESS,
        data: {
          mint: mintAddress,
          // owner is missing
        },
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({ type: 'UNSUPPORTED' });
    });

    it('classifies mint account as UNSUPPORTED', async () => {
      const mockAccountInfo = {
        programAddress: TOKEN_PROGRAM_ADDRESS,
        data: {
          freezeAuthority: '7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar',
          isInitialized: true,
          mintAuthority: 'BJE5MMbqXjVwjAF7oxwPYXnTXDyspzZyt4vwenNw5ruG',
          supply: '12807222010705262',
        },
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({ type: 'UNSUPPORTED' });
    });

    it('classifies program account as UNSUPPORTED', async () => {
      const mockAccountInfo = {
        programAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        data: {},
      } as any;

      vi.spyOn(mockConnection, 'fetchJsonParsedAccount').mockResolvedValue(
        mockAccountInfo,
      );

      const result = await classifier.classify(recipientAddress, network);

      expect(result).toStrictEqual({ type: 'UNSUPPORTED' });
    });
  });
});
