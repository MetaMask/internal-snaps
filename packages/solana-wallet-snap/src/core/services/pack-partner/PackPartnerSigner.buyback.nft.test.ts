import type { ExtendedKeyringAccount } from '@metamask/snap-networks-utils';
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Fixture helpers preserve their inferred shapes. */
/* eslint-disable id-denylist -- Solana RPC names its simulation error field `err`. */
import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
  TOKEN_PROGRAM_ADDRESS,
  getMintEncoder,
  getTokenEncoder,
} from '@solana-program/token';
import {
  address,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionDecoder,
} from '@solana/kit';
import type { Address, ReadonlyUint8Array } from '@solana/kit';

import { Network } from '../../constants/solana';
import { fromTransactionToBase64String } from '../../sdk-extensions/codecs';
import { deriveSolanaKeypair } from '../../utils/deriveSolanaKeypair';
import * as DeriveSolanaKeypair from '../../utils/deriveSolanaKeypair';
import type { SolanaConnection } from '../connection';
import { getPackPartnerNetworkConfig } from './constants';
import { TOKEN_METADATA_PROGRAM_ADDRESS } from './nft-standards/programs';
import { PackPartnerSigner } from './PackPartnerSigner';

const PACK_PARTNER_SIGNER = address(
  'GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3',
);
const PACK_PARTNER_USDC_MINT = getPackPartnerNetworkConfig(
  Network.Mainnet,
).usdcMint;

// https://solscan.io/tx/3fhT71ykVsxVALjpmriH5gBXM1M34hYNXx9Cy6Tcev2HQwfRcrNRN69rfsWsP5u29MraiC75VtmCbAVwCuqZEfEs
const historicalWire =
  'AoVnuca0nOpFIifngY8a3qznsieXT5Up4g85aTbi5mCVHMfTTO+GCwgRZX4E67gXQI5O36rk+miLzjAo9jdQxQSz6NNIgLFDTyDHuDcgGSdWMDvzMoSvQLbAM2OCMTIHW5rX0P6vX7jZZ+wL41XESvb9lYGI1bcWRSc9JyUTKL4FAgEKEed71hNwnx/P2MtkMWPpufVol1UMbaqjUg49GQh2vvz+z0OtU2mIuJsIUs2IKsNs5/tS98vqnTWqP257krc8QJMxaboBz6+BuB+JKfxE4dFrVEx2SLv551FuiCoeLOMU0VYciNCFDMiw5QvdwcPJwvDxaC5hFJoeNy4kAXyZazAJjax95QgrB2E3MUdqy7mJ5qSPtNoOUnEgwbNpMKIHZxy0ZZixMVlRqHnYNISHKdTl580S6MkAGrPXlw7oTWukD9ONKqOcu9j446Hn7npn7T4+yF83uzGCsGi9YItTtTxyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyBgykz9/yLFU/tjpxdMBMCCQrG4BRxSwIdhqtPOAkVYyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQRH8ysyA5xxDb+HIw9Nkxz35c6sACy2LMzhraQMTB34BUpTWpkpIQZNJOhxYNo4fHw1td28kruB5B+oQEEFRI0LcGWx49F8RTidUn9rBMPNWLhscxqg/bVJttG8A/gpRgan1RcYe9FmNdrUBFX9wsDBJMaPIVZ1pdu6y18IAAAABt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKkGa3Ths5C8A3pd0LuJEfxc7IpkosFQuQbfOIzL+aY0UwcKAAUCkNADAA4RBAECDAgGDg4OAQAHDxAJDg4LMQABAAAAAAAAAAAKAAkDECcAAAAAAAAJBgADAQsHEAEBEAQFCwMACgyAOa8eAAAAAAYQAwQAAQEJDQAvY2MtYWRlYzU1ZWMtMmNjMi00NDc2LWE3MjQtODNiMjk5N2E3YWIwOmJ1eWJhY2s=';
const realMetadataBase64 =
  'BLhJvSf1pWAOic+nA+axhrqDqHE78GhDY+x+MkbVM/zyMgYMpM/f8ixVP7Y6cXTATAgkKxuAUcUsCHYarTzgJFUgAAAAMjAxNyAjNTggSkFQQU5FU0UgU1VOICYgTU9PTiBTSEkKAAAAQ09MTEVDVE9SAMgAAABodHRwczovL2Fyd2VhdmUubmV0L0Vhd1Y4dmNSbUJ2RGZNd1h3dmVjOHREUWtFU0V0SE9QX3FiRnEwN1lYcGMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMgAAQEAAAC4Sb0n9aVgDonPpwPmsYa6g6hxO/BoQ2PsfjJG1TP88gBkAAEB/gEAAQGmenUWm3sm4gcWrNZ52hLQ6Qw2PFdY1cFlpTDn2o/CKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
const user = address('Ex5FM97zzczYpmKcDEQazswrVZW9jh5i3tDe7Sr4LtBU');
const nft = address('4NGjdY9LHWhbWGysoeXTgrQq8CLNm5SzZKuHfzerXByW');
const inventory = address('HiGHqwYddP5N2waqUmXPdaASpMpUEvfqPr2fSawctEb');
const sourceToken = address('AY33CnRGMcrQHnUjdxxbiz7YRp4EnXGJDkHNPbuNTAR9');
const destinationToken = address(
  '4KtUyXvdXjpDuGfFTknH5CQofK8WKqBKA6g6zGdyqxiC',
);
const metadataAddress = address('FEoscb7BpuqdwDc4Dh5NSwdGDghQ7XkqTPknzGAzZLs3');
const userUsdc = address('6o9JHV5AjTHv8S1f3qUeUC71g9nD84s58BobBxNkp81e');
const sponsorUsdc = address('D9CEogjHA6CpS12F8St9zpSco7pQKJB5uR1RqDsuzQZk');
const amount = 514_800_000n;
const rent = 1_488_440n;
const fee = 12_500n;

const response = (value: unknown) => ({
  send: vi.fn().mockResolvedValue(value),
});
const rpc = {
  getMultipleAccounts: vi.fn(),
  getFeeForMessage: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
};
const connection = {
  getRpc: vi.fn(() => rpc),
} as unknown as SolanaConnection;
const account = {
  address: user,
  scopes: [Network.Mainnet],
} as unknown as ExtendedKeyringAccount;
const accountData = (
  owner: Address,
  bytes: ReadonlyUint8Array,
  lamports: bigint,
) => ({
  owner,
  executable: false,
  lamports,
  data: [getBase64Decoder().decode(bytes), 'base64'] as const,
});
const sol = (lamports: bigint) => ({
  owner: SYSTEM_PROGRAM_ADDRESS,
  executable: false,
  lamports,
  data: ['', 'base64'] as const,
});
const token = (mint: Address, owner: Address, balance: bigint) =>
  accountData(
    TOKEN_PROGRAM_ADDRESS,
    getTokenEncoder().encode({
      mint,
      owner,
      amount: balance,
      delegate: null,
      state: 1,
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    }),
    rent,
  );
type AccountState =
  | ReturnType<typeof accountData>
  | ReturnType<typeof sol>
  | null;
type Snapshot = Map<string, AccountState>;
type Mutation = (before: Snapshot, after: Snapshot) => void;

function fixture(mutate?: Mutation) {
  const historical = getTransactionDecoder().decode(
    getBase64Encoder().encode(historicalWire),
  );
  const wire = fromTransactionToBase64String({
    ...historical,
    signatures: { ...historical.signatures, [user]: undefined },
  });
  const before: Snapshot = new Map<string, AccountState>([
    [user, sol(1_000_000n)],
    [PACK_PARTNER_SIGNER, sol(5_000_000n)],
    [userUsdc, token(PACK_PARTNER_USDC_MINT, user, 1_817_960_000n)],
    [
      sponsorUsdc,
      token(PACK_PARTNER_USDC_MINT, PACK_PARTNER_SIGNER, 5_000_000_000n),
    ],
    [sourceToken, token(nft, user, 1n)],
    [destinationToken, token(nft, inventory, 0n)],
    [
      metadataAddress,
      accountData(
        TOKEN_METADATA_PROGRAM_ADDRESS,
        getBase64Encoder().encode(realMetadataBase64),
        2_000_000n,
      ),
    ],
    [
      nft,
      accountData(
        TOKEN_PROGRAM_ADDRESS,
        getMintEncoder().encode({
          mintAuthority: null,
          supply: 1n,
          decimals: 0,
          isInitialized: true,
          freezeAuthority: null,
        }),
        1_000_000n,
      ),
    ],
  ]);
  const after: Snapshot = new Map(before);
  after.set(PACK_PARTNER_SIGNER, sol(5_000_000n + rent - fee));
  after.set(
    userUsdc,
    token(PACK_PARTNER_USDC_MINT, user, 1_817_960_000n + amount),
  );
  after.set(
    sponsorUsdc,
    token(PACK_PARTNER_USDC_MINT, PACK_PARTNER_SIGNER, 5_000_000_000n - amount),
  );
  after.set(sourceToken, null);
  after.set(destinationToken, token(nft, inventory, 1n));
  mutate?.(before, after);
  let requestedAddresses: string[] = [];
  rpc.getMultipleAccounts.mockImplementation((addresses: string[]) => {
    requestedAddresses = addresses;
    return response({
      context: { slot: 1n },
      value: addresses.map((item) =>
        before.has(item) ? before.get(item) : sol(1_000_000n),
      ),
    });
  });
  rpc.getFeeForMessage.mockReturnValue(
    response({ context: { slot: 1n }, value: fee }),
  );
  rpc.simulateTransaction.mockImplementation(() =>
    response({
      context: { slot: 1n },
      value: {
        err: null,
        accounts: requestedAddresses.map((item) =>
          after.has(item) ? after.get(item) : sol(1_000_000n),
        ),
      },
    }),
  );
  vi.mocked(deriveSolanaKeypair).mockRejectedValue(new Error('REACHED_DERIVE'));
  return wire;
}

async function sign(wire: string, standard: 'nft' | 'pnft' = 'nft') {
  return new PackPartnerSigner(connection).signBuyback(
    account,
    wire,
    {
      amount: amount.toString(),
      assetAddress: nft,
      expectedStandard: standard,
    },
    Network.Mainnet,
  );
}

describe('PackPartnerSigner classic NFT buyback simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(DeriveSolanaKeypair, 'deriveSolanaKeypair');
  });

  it('reaches signing only after the observed NFT and exact USDC effects', async () => {
    await expect(sign(fixture())).rejects.toThrow('REACHED_DERIVE');
    expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('accepts sponsored creation of a missing user USDC ATA despite treasury activity', async () => {
    const wire = fixture((pre, post) => {
      pre.set(userUsdc, null);
      post.set(userUsdc, token(PACK_PARTNER_USDC_MINT, user, amount));
      // The shared Pack Partner wallet can change between RPC reads.
      post.set(PACK_PARTNER_SIGNER, sol(15_000_000n));
    });
    await expect(sign(wire)).rejects.toThrow('REACHED_DERIVE');
    expect(deriveSolanaKeypair).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'source NFT account has the wrong mint',
      token(PACK_PARTNER_USDC_MINT, user, 1n),
    ],
    ['source NFT account has the wrong owner', token(nft, inventory, 1n)],
    [
      'source NFT account is delegated',
      accountData(
        TOKEN_PROGRAM_ADDRESS,
        getTokenEncoder().encode({
          mint: nft,
          owner: user,
          amount: 1n,
          delegate: inventory,
          state: 1,
          isNative: null,
          delegatedAmount: 1n,
          closeAuthority: null,
        }),
        rent,
      ),
    ],
  ] as const)('rejects when %s', async (_name, sourceAccount) => {
    const wire = fixture((pre) => pre.set(sourceToken, sourceAccount));
    await expect(sign(wire)).rejects.toThrow(/Pack Partner/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it.each([
    [
      'source NFT did not leave user',
      (_pre: Snapshot, post: Snapshot) =>
        post.set(sourceToken, token(nft, user, 1n)),
    ],
    [
      'destination did not receive NFT',
      (_pre: Snapshot, post: Snapshot) =>
        post.set(destinationToken, token(nft, inventory, 0n)),
    ],
    [
      'user USDC is short',
      (_pre: Snapshot, post: Snapshot) =>
        post.set(
          userUsdc,
          token(PACK_PARTNER_USDC_MINT, user, 1_817_960_000n + amount - 1n),
        ),
    ],
    [
      'user pays SOL',
      (_pre: Snapshot, post: Snapshot) => post.set(user, sol(999_999n)),
    ],
    [
      'metadata is altered',
      (_pre: Snapshot, post: Snapshot) =>
        post.set(
          metadataAddress,
          accountData(
            TOKEN_METADATA_PROGRAM_ADDRESS,
            new Uint8Array([4]),
            2_000_000n,
          ),
        ),
    ],
    [
      'mint supply is altered',
      (_pre: Snapshot, post: Snapshot) =>
        post.set(
          nft,
          accountData(
            TOKEN_PROGRAM_ADDRESS,
            getMintEncoder().encode({
              mintAuthority: null,
              supply: 2n,
              decimals: 0,
              isInitialized: true,
              freezeAuthority: null,
            }),
            1_000_000n,
          ),
        ),
    ],
  ] as const)('rejects when %s', async (_name, mutate) => {
    await expect(sign(fixture(mutate))).rejects.toThrow(/Pack Partner/u);
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });

  it('rejects a wrong expected standard before requesting any account snapshots', async () => {
    await expect(sign(fixture(), 'pnft')).rejects.toThrow(/Pack Partner/u);
    expect(rpc.getMultipleAccounts).not.toHaveBeenCalled();
    expect(deriveSolanaKeypair).not.toHaveBeenCalled();
  });
});
