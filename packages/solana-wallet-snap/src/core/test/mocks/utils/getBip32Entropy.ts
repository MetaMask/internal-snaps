import type { SLIP10PathNode, SupportedCurve } from '@metamask/key-tree';
import { SLIP10Node } from '@metamask/key-tree';

import {
  MOCK_SEED_PHRASE_2_BYTES,
  MOCK_SEED_PHRASE_2_ENTROPY_SOURCE,
  MOCK_SEED_PHRASE_BYTES,
} from '../solana-keyring-accounts';

export const getBip32EntropyMock = jest
  .fn()
  .mockImplementation(
    async ({
      path,
      curve,
      entropySource,
    }: {
      path: string[];
      curve: SupportedCurve;
      entropySource?: string;
    }) => {
      if (entropySource === MOCK_SEED_PHRASE_2_ENTROPY_SOURCE) {
        return await SLIP10Node.fromDerivationPath({
          derivationPath: [
            MOCK_SEED_PHRASE_2_BYTES,
            ...path.slice(1).map((node) => `slip10:${node}` as SLIP10PathNode),
          ],
          curve,
        });
      }

      return await SLIP10Node.fromDerivationPath({
        derivationPath: [
          MOCK_SEED_PHRASE_BYTES,
          ...path.slice(1).map((node) => `slip10:${node}` as SLIP10PathNode),
        ],
        curve,
      });
    },
  );

export const getSolanaCoinTypeNodeMock = jest.fn(
  async (entropySource?: string) => {
    const coinTypeNodeJson = await getBip32EntropyMock({
      entropySource,
      path: ['m', "44'", "501'"],
      curve: 'ed25519',
    });

    return await SLIP10Node.fromJSON(coinTypeNodeJson);
  },
);
