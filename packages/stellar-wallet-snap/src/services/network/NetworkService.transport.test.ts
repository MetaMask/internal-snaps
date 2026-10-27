import { InMemoryCache } from '@metamask/snap-networks-utils';
import { NetworkError } from '@stellar/stellar-sdk';
import { BigNumber } from 'bignumber.js';
import nock, { cleanAll } from 'nock';

import { KnownCaip2ChainId } from '../../api';
import { AppConfig } from '../../config';
import { logger } from '../../utils/logger';
import { NetworkServiceException } from './exceptions';
import { NetworkService } from './NetworkService';

jest.mock('../../utils/logger');

const scope = KnownCaip2ChainId.Mainnet;
const horizonUrl = new URL(AppConfig.networks[scope].horizonUrl);
const feeStatsPath = `${horizonUrl.pathname.replace(/\/$/u, '')}/fee_stats`;

describe('NetworkService Horizon transport', () => {
  let networkService: NetworkService;

  beforeEach(() => {
    networkService = new NetworkService({
      logger,
      cache: new InMemoryCache(logger),
    });
  });

  afterEach(() => {
    cleanAll();
  });

  it('honors Retry-After from an SDK 429 response', async () => {
    const horizon = nock(horizonUrl.origin)
      .get(feeStatsPath)
      .reply(429, {}, { 'Retry-After': '1' })
      .get(feeStatsPath)
      .reply(200, { last_ledger_base_fee: '100' });

    const startedAt = Date.now();
    const result = networkService.getBaseFee(scope);

    expect(await result).toStrictEqual(
      new BigNumber(100).multipliedBy(AppConfig.transaction.baseFeeMultiplier),
    );
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900);
    expect(horizon.isDone()).toBe(true);
  });

  it('attempts an SDK 401 response once and preserves its error as cause', async () => {
    const horizon = nock(horizonUrl.origin)
      .get(feeStatsPath)
      .reply(401, { detail: 'Unauthorized' });

    let error: unknown;
    try {
      await networkService.getBaseFee(scope);
    } catch (reason) {
      error = reason;
    }

    expect(error).toBeInstanceOf(NetworkServiceException);
    expect((error as NetworkServiceException).cause).toBeInstanceOf(
      NetworkError,
    );
    expect((error as NetworkServiceException).cause).toMatchObject({
      response: {
        status: 401,
      },
    });
    expect(horizon.isDone()).toBe(true);
  });
});
