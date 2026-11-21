import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
import { getBase64Encoder, getTransactionDecoder } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import type { SolanaConnection } from '../connection';
import { PackPartnerSigner } from './PackPartnerSigner';

/** Public historical transactions, fetched read-only through Solana RPC. */
const examples = [
  {
    name: 'buy — mainnet, sponsored fees',
    expectedStandard: undefined,
    scope: Network.Mainnet,
    wire: 'Ao/pwyfkVcjtKcM9gQnqBjcmEg3apwdz0AgbpZetzxbrzzmBoPWWAODHtioYkUqMTm2BHPfjDbhV/6pZcDpZRwHl0/fY5Um0/eee0jTanOkflnAKYwZyd6VGDT+RB8AwFGlnrLjRznFbYOo9qWzUQrn9d/bOaWu6ADHFbfmqObYAAgEECOd71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+WyBHFpjPc1ZkhlvOkuJEcTLGq5ucF80zsPlAhhcwchOFtAmSSHHIVGp/55P62LZYJDvRyqScl0Cxd670MJ8ga7RlmLExWVGoedg0hIcp1OXnzRLoyQAas9eXDuhNa6QPAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKkQMSg+50JJQoZ0tGBeTVLbWsFoyg2HLDnCRtIqLc0cVAQEAAUCgDgBAAYALGNjLTc1ODI1NDhjLWNmOGMtNDJjYi1iMThmLTFhOGQ3Njc0OWM4YTpvcGVuBwUCBQMBAQoMQHh9AQAAAAAGBAAJAxAnAAAAAAAA',
    user: '78ieXfmDY4ZG2t6PzY183YjpmpJkmzThgZHV6ZVxyare',
    amount: '25000000',
    nft: undefined,
  },
  {
    name: 'buy — mainnet, user-paid fees',
    expectedStandard: undefined,
    scope: Network.Mainnet,
    wire: 'AirY9ADUPLF1uY35OD5o+MewRkRbT9kcjfrzxyvEOsl+ifpvHzWE2yhMV/Ve8ZQ67ppoMyxc6spOIXVyn26UJQQ/F8p8JfsRAkJDwiEc3S8TFBQ9TDkORVsuREcmNyfHrcHeNj/kT03RlLujkFsC1MnRDAg2CuO5XNi8LiUaB5YIAgEECGJNNHW20O2pV1BOsKzdN1ewpY1n09GXow5Mo2HRzYRZ53vWE3CfH8/Yy2QxY+m59WiXVQxtqqNSDj0ZCHa+/P59POcox/X7/mcvmiR+j2xVwby+weHGSFx+r8ZAKM56mLRlmLExWVGoedg0hIcp1OXnzRLoyQAas9eXDuhNa6QPAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKlYKUzILvBiZaWB1VmM1DpZ1mxmyvop6q0XxjYIN/YTAwQEAAUCgDgBAAYBATFqdXBpdGVyLTEwODBjNTIzLWRjZjMtNGQxZC1iYTg5LTQ0ODUxNjE3MGQxYjpvcGVuBwUCBQMAAAoMQHh9AQAAAAAGBAAJAxAnAAAAAAAA',
    user: '7cjEct8b9jCAyQaCTefikqXkh9iU3j8BaUVdX7pWf3Lc',
    amount: '25000000',
    nft: undefined,
  },
] as const;

function signHistoricalTransaction(
  signer: PackPartnerSigner,
  account: ExtendedKeyringAccount,
  unsignedUserWire: string,
  example: (typeof examples)[number],
): ReturnType<PackPartnerSigner['signBuy']> {
  return signer.signBuy(
    account,
    unsignedUserWire,
    { amount: example.amount },
    example.scope,
  );
}

describe('Pack Partner historical transactions', () => {
  it.each(examples)(
    'accepts the authentic presignature and instruction schema for $name',
    async (example) => {
      const { wire, user, scope } = example;
      const getMultipleAccounts = vi.fn(() => {
        throw new Error('REACHED_SNAPSHOT');
      });
      const connection = {
        getRpc: () => ({ getMultipleAccounts }),
      } as unknown as SolanaConnection;
      const account = {
        address: user,
        scopes: [scope],
      } as unknown as ExtendedKeyringAccount;
      const signer = new PackPartnerSigner(connection);
      const historical = getTransactionDecoder().decode(
        getBase64Encoder().encode(wire),
      );
      const unsignedUserWire = fromTransactionToBase64String({
        ...historical,
        signatures: { ...historical.signatures, [user]: undefined },
      });
      const signing = signHistoricalTransaction(
        signer,
        account,
        unsignedUserWire,
        example,
      );
      await expect(signing).rejects.toThrow('REACHED_SNAPSHOT');
      expect(getMultipleAccounts).toHaveBeenCalledTimes(1);
    },
  );
});
