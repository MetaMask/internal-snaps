import { KeyringRpcMethod } from '@metamask/keyring-api';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import {
  BaseConfigProvider,
  BrokenCircuitError,
  InMemoryCache,
  InMemoryState,
} from '@metamask/snap-networks-utils';

import type { PriceApiClient } from '../../clients/price-api/PriceApiClient';
import type { SnapClient } from '../../clients/snap/SnapClient';
import type { TokenApiClient } from '../../clients/token-api/TokenApiClient';
import { TronHttpClient } from '../../clients/tron-http/TronHttpClient';
import { TrongridApiClient } from '../../clients/trongrid/TrongridApiClient';
import { KnownCaip19Id, Network } from '../../constants';
import type { TronKeyringAccount } from '../../entities/tronKeyringAccount';
import type { AccountsService } from '../../services/accounts/AccountsService';
import { SnapAssetsAdapter } from '../../services/assets/adapters/SnapAssetsAdapter';
import type { CoreAssetsAdapter } from '../../services/assets/adapters/CoreAssetsAdapter';
import type { AssetsRepository } from '../../services/assets/AssetsRepository';
import { AssetsService } from '../../services/assets/AssetsService';
import {
  ConfigStruct,
  ENVIRONMENT,
} from '../../services/config/ConfigProvider';
import type { ConfirmationHandler } from '../../services/confirmation/ConfirmationHandler';
import type { UnencryptedStateValue } from '../../services/state/stateTypes';
import type { TransactionsService } from '../../services/transactions/TransactionsService';
import type { WalletService } from '../../services/wallet/WalletService';
import { shouldTrack } from '../../utils/errors';
import {
  ACCOUNT_INFO_FETCH_FAILED_MESSAGE,
  failureStreakGate,
} from '../../utils/failureStreakGate';
import { mockLogger } from '../../utils/mockLogger';
import { OPEN_CIRCUIT_ERROR_MESSAGE } from '../../utils/openCircuitBypass';
import { KeyringHandler } from './keyring';

/* eslint-disable no-restricted-globals */

/**
 * The URL of a fetch input.
 *
 * @param input - The fetch input.
 * @returns The URL.
 */
function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

const ADDRESS = 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8';

const account: TronKeyringAccount = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  address: ADDRESS,
  options: {},
  methods: [],
  type: 'tron:eoa',
  scopes: [Network.Mainnet],
  entropySource: 'entropy-source-1',
  derivationPath: "m/44'/195'/0'/0/0",
  index: 0,
};

/**
 * A healthy upstream: TronGrid account info, account resources and rewards.
 *
 * @param input - The fetch input.
 * @returns The response.
 */
async function healthyFetch(input: RequestInfo | URL): Promise<Response> {
  const url = urlOf(input);
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  if (url.includes('/v1/accounts/')) {
    return json({
      data: [{ address: ADDRESS, balance: 2_500_000 }],
      success: true,
      meta: { at: 1770121997373, page_size: 1 },
    });
  }
  if (url.includes('/wallet/getaccountresource')) {
    return json({});
  }
  if (url.includes('/wallet/getReward')) {
    return json({ reward: 0 });
  }
  throw new Error(`Unexpected request: ${url}`);
}

/**
 * Builds the real keyring path of a balance refresh: keyring handler (through
 * the keyring SDK's request dispatch), assets service, snap assets adapter and
 * the real TronGrid / Tron HTTP clients with their real fetch policies. Only
 * `fetch` and unrelated collaborators are mocked.
 *
 * @returns The handler and the clients.
 */
function setup(): {
  keyringHandler: KeyringHandler;
  trongridApiClient: TrongridApiClient;
  tronHttpClient: TronHttpClient;
} {
  const baseUrls = {
    [Network.Mainnet]: 'https://api.trongrid.io',
    [Network.Nile]: 'https://nile.trongrid.io',
    [Network.Shasta]: 'https://api.shasta.trongrid.io',
  };
  const configProvider = new BaseConfigProvider(
    {
      ...ENVIRONMENT,
      trongridApi: { baseUrls },
      tronHttpApi: { baseUrls },
    },
    ConfigStruct,
  );
  const tronHttpClient = new TronHttpClient({ configProvider });
  const trongridApiClient = new TrongridApiClient({
    configProvider,
    tronHttpClient,
    cache: new InMemoryCache(mockLogger),
  });

  const snapClient = {
    trackError: jest.fn(),
  } as unknown as SnapClient;
  const snapAssetsAdapter = new SnapAssetsAdapter({
    logger: mockLogger,
    state: new InMemoryState<UnencryptedStateValue>(
      {} as UnencryptedStateValue,
    ),
    assetsRepository: {
      saveMany: jest.fn(),
    } as unknown as AssetsRepository,
    trongridApiClient,
    tronHttpClient,
    priceApiClient: {
      getMultipleSpotPrices: jest.fn().mockResolvedValue({}),
    } as unknown as PriceApiClient,
    tokenApiClient: {
      getTokensMetadata: jest.fn().mockResolvedValue({}),
    } as unknown as TokenApiClient,
    snapClient,
  });
  const assetsService = new AssetsService({
    snapAdapter: snapAssetsAdapter,
    coreAdapter: {} as CoreAssetsAdapter,
    remoteFeatureFlagsProvider: {
      getFeatureFlag: jest.fn(),
    } as never,
  });

  const keyringHandler = new KeyringHandler({
    logger: mockLogger,
    snapClient,
    accountsService: {
      findById: jest.fn().mockResolvedValue(account),
    } as unknown as AccountsService,
    assetsService,
    transactionsService: {} as TransactionsService,
    walletService: {} as WalletService,
    confirmationHandler: {} as ConfirmationHandler,
  });

  return { keyringHandler, trongridApiClient, tronHttpClient };
}

/**
 * Opens the circuit of the mainnet TronGrid and Tron HTTP fetch policies the
 * way a broken connection does: repeated failing background reads (no bypass)
 * until the policy short-circuits them.
 *
 * @param clients - The clients.
 * @param clients.trongridApiClient - The TronGrid client.
 * @param clients.tronHttpClient - The Tron HTTP client.
 */
async function openCircuits({
  trongridApiClient,
  tronHttpClient,
}: {
  trongridApiClient: TrongridApiClient;
  tronHttpClient: TronHttpClient;
}): Promise<void> {
  jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => new Response('', { status: 501 }));
  const reads = [
    async (index: number): Promise<unknown> =>
      trongridApiClient.getAccountInfoByAddress(
        Network.Mainnet,
        `address-${index}`,
      ),
    async (index: number): Promise<unknown> =>
      tronHttpClient.getAccountResources(Network.Mainnet, `address-${index}`),
  ];
  for (const read of reads) {
    let opened = false;
    for (let index = 0; index < 30 && !opened; index++) {
      try {
        await read(index);
      } catch (error) {
        opened = error instanceof BrokenCircuitError;
      }
    }
    if (!opened) {
      throw new Error('The circuit did not open');
    }
  }
}

const request = (
  method: string,
  params: Record<string, Json>,
): JsonRpcRequest => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  params,
});

describe('KeyringHandler balance refresh while the fetch circuit is open (v6)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    failureStreakGate.clear();
  });

  it('reaches the network for listAccountAssets then getAccountBalances (the Retry path)', async () => {
    const clients = setup();
    await openCircuits(clients);

    // Background reads are short-circuited without a request.
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(healthyFetch);
    fetchMock.mockClear();
    await expect(
      clients.trongridApiClient.getAccountInfoByAddress(
        Network.Mainnet,
        ADDRESS,
      ),
    ).rejects.toBeInstanceOf(BrokenCircuitError);
    expect(fetchMock).not.toHaveBeenCalled();

    // A failure streak is in progress (already reported once).
    expect(
      failureStreakGate.shouldReport(ACCOUNT_INFO_FETCH_FAILED_MESSAGE),
    ).toBe(true);

    // The client's refresh: keyring_listAccountAssets, then
    // keyring_getAccountBalances, through the keyring SDK dispatch.
    const assets = await clients.keyringHandler.handle(
      'metamask',
      request(KeyringRpcMethod.ListAccountAssets, { id: account.id }),
    );
    expect(assets).toContain(KnownCaip19Id.TrxMainnet);
    // TronGrid answered: the streak ended, the next failure is reported.
    expect(
      failureStreakGate.shouldReport(ACCOUNT_INFO_FETCH_FAILED_MESSAGE),
    ).toBe(true);

    const requestedUrls = fetchMock.mock.calls.map(([input]) => urlOf(input));
    expect(requestedUrls).toStrictEqual(
      expect.arrayContaining([
        `https://api.trongrid.io/v1/accounts/${ADDRESS}`,
        'https://api.trongrid.io/wallet/getaccountresource',
        'https://api.trongrid.io/wallet/getReward',
      ]),
    );

    const balances = (await clients.keyringHandler.handle(
      'metamask',
      request(KeyringRpcMethod.GetAccountBalances, {
        id: account.id,
        assets: [KnownCaip19Id.TrxMainnet],
      }),
    )) as Record<string, { amount: string; unit: string }>;
    expect(balances[KnownCaip19Id.TrxMainnet]).toStrictEqual({
      amount: '2.5',
      unit: 'TRX',
    });
  });

  it('makes the request when the circuit is open before the call (state pre-check)', async () => {
    const clients = setup();
    await openCircuits(clients);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(healthyFetch);
    fetchMock.mockClear();

    await clients.keyringHandler.handle(
      'metamask',
      request(KeyringRpcMethod.GetAccountBalances, {
        id: account.id,
        assets: [KnownCaip19Id.TrxMainnet],
      }),
    );

    expect(
      fetchMock.mock.calls.filter(([input]) =>
        urlOf(input).includes('/v1/accounts/'),
      ),
    ).toHaveLength(1);
  });

  it('lets one direct attempt through per interval when it fails', async () => {
    const clients = setup();
    await openCircuits(clients);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => {
        throw new TypeError('Failed to fetch');
      });
    // The spy is reused: forget the calls that opened the circuits.
    fetchMock.mockClear();

    // The direct attempt fails (still offline)...
    const first = clients.keyringHandler.handle(
      'metamask',
      request(KeyringRpcMethod.ListAccountAssets, { id: account.id }),
    );
    await expect(first).rejects.toThrow('Failed to fetch account info');
    const attempts = fetchMock.mock.calls.length;
    expect(attempts).toBeGreaterThan(0);

    // ...and an immediate repeat is not let through again.
    await expect(
      clients.keyringHandler.handle(
        'metamask',
        request(KeyringRpcMethod.ListAccountAssets, { id: account.id }),
      ),
    ).rejects.toThrow('Failed to fetch account info');
    expect(fetchMock.mock.calls).toHaveLength(attempts);
  });

  it('does not track the open-circuit error rethrown by the keyring SDK as a plain Error', () => {
    // `handleKeyringRequest` rethrows non-snap errors as `new Error(message)`.
    expect(shouldTrack(new Error(OPEN_CIRCUIT_ERROR_MESSAGE))).toBe(false);
  });
});
