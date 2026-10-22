/**
 * Mainnet Horizon event fixture: sign + broadcast from two secret keys, then roll back.
 *
 * Secrets (never commit these). Either pair works:
 *   STELLAR_SECRET_1 / STELLAR_SECRET_2
 *   STELLAR_PK_1     / STELLAR_PK_2
 *
 * Optional:
 *   STELLAR_SECRET_SPONSORED / STELLAR_PK_SPONSORED
 *                          required by `account-merge` (that account merges into account 1)
 *                          optional for `sponsored-account`; random when omitted
 *   HORIZON_URL            default https://horizon.stellar.org
 *   XLM_AMOUNT             default 0.0001 (native payment / path / claimable)
 *   TRUSTLINE_AMOUNT       default same as XLM_AMOUNT
 *   TRUSTLINE_CODE         default AQUA
 *   TRUSTLINE_ISSUER       default GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA
 *   TRUSTLINE_LIMIT             default 1000 (non-zero limit update in trustline-metadata)
 *   BASE_FEE_STROOPS       default 100
 *   DRY_RUN=1              build + sign, print XDR, do not submit
 *   YES=1                  skip the interactive mainnet confirm
 *
 * Usage (from packages/stellar-wallet-snap):
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs status
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs list
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs setup balance-move
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs teardown balance-move
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs setup fee-bump
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs setup claimable [asset-id]
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs setup two-receivers <G-address> <G-address>
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs setup trustline-limit [limit]
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs teardown trustline-limit
 *   node --env-file=.env scripts/test-live-complex-transaction.mjs remove-trustline <G-address> <asset-id>
 *
 * `remove-trustline` signs with the env secret for that address. The asset id
 * is `stellar:pubnet/asset:CODE-ISSUER` or `CODE-ISSUER`. The balance must
 * already be 0. There is no teardown.
 * `claimable` uses the same asset id and defaults to XLM when it is omitted.
 * A classic asset uses TRUSTLINE_AMOUNT and adds account2's trustline when missing.
 * `trustline-limit` changes only account1's TRUSTLINE_ASSET limit (default AQUA).
 * Pass a limit or omit it to use TRUSTLINE_LIMIT. The line must already exist.
 * Teardown restores it.
 *
 * Cases that need an id or an ephemeral key (claimable, offers, sponsored
 * accounts) save it in scripts/.horizon-fixture-state.mjson. That file is
 * gitignored. Run teardown to roll the case back.
 */

import {
  Asset,
  Claimant,
  getLiquidityPoolId,
  Horizon,
  Keypair,
  LiquidityPoolAsset,
  LiquidityPoolFeeV18,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon.stellar.org';
const NETWORK_PASSPHRASE = Networks.PUBLIC;
const EXPLORER_TX = 'https://stellar.expert/explorer/public/tx';
const XLM_AMOUNT = process.env.XLM_AMOUNT ?? '0.0001';
const TRUSTLINE_AMOUNT = process.env.TRUSTLINE_AMOUNT ?? XLM_AMOUNT;
const TRUSTLINE_ASSET = new Asset(
  process.env.TRUSTLINE_CODE ?? 'AQUA',
  process.env.TRUSTLINE_ISSUER ??
    'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
);
const BASE_FEE = Number(process.env.BASE_FEE_STROOPS ?? '100');
const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_CONFIRM = process.env.YES === '1';

const EURC = new Asset(
  'EURC',
  'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
);
const PYUSD = new Asset(
  'PYUSD',
  'GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5',
);
const TRUSTLINE_LIMIT = process.env.TRUSTLINE_LIMIT ?? '1000';

const server = new Horizon.Server(HORIZON_URL);

/**
 * `balance-move` / `balance-move-trustline` credit/debit existing accounts.
 * `trustline-metadata` covers add / limit-update / sponsored-create.
 * `fee-bump` wraps an account2 inner changeTrust; account1 pays the fee.
 * `authorized` is issuer-only (`setTrustLineFlags`); skip for EURC, TRUSTLINE_ASSET, and PYUSD.
 * Clawback of a holder's balance is intentionally not a case.
 * `claimable-clawback` only runs when account1 is the issuer of TRUSTLINE_ASSET.
 */

/**
 * @typedef {object} AccountBinding
 * @property {import('@stellar/stellar-sdk').Keypair} keypair
 * @property {import('@stellar/stellar-sdk').Horizon.AccountResponse} account
 */

/**
 * @typedef {object} Accounts
 * @property {AccountBinding} account1
 * @property {AccountBinding} account2
 * @property {AccountBinding} [sponsoredAccount]
 * Set when `STELLAR_SECRET_SPONSORED` or `STELLAR_PK_SPONSORED` is present.
 * `account` is null when that key is not on chain yet.
 */

/**
 * @typedef {object} PlannedTx
 * @property {string} label
 * @property {import('@stellar/stellar-sdk').Keypair} signer
 * @property {import('@stellar/stellar-sdk').xdr.Operation[]} operations
 * @property {import('@stellar/stellar-sdk').Keypair[]} [signers]
 * @property {import('@stellar/stellar-sdk').Keypair} [feeSource]
 * When set, wrap the inner tx (source = `signer`) in a fee-bump paid by this key.
 */

/**
 * @typedef {object} SubmitResult
 * @property {string} hash
 * @property {unknown} [raw]
 */

/**
 * @typedef {object} CaseHelpers
 * @property {(plan: PlannedTx) => Promise<SubmitResult>} submit
 */

/**
 * @typedef {object} Case
 * @property {string} description
 * @property {(accounts: Accounts, helpers: CaseHelpers) => Promise<void>} setup
 * @property {(accounts: Accounts, helpers: CaseHelpers) => Promise<void>} teardown
 */

function assetLabel(asset) {
  return asset.isNative() ? 'XLM' : `${asset.getCode()}-${asset.getIssuer()}`;
}

function paymentOp(destination, asset, amount) {
  return Operation.payment({
    destination,
    asset,
    amount,
  });
}

function pathSendOp(destination, asset, amount) {
  return Operation.pathPaymentStrictSend({
    sendAsset: asset,
    sendAmount: amount,
    destination,
    destAsset: asset,
    destMin: amount,
    path: [],
  });
}

function pathReceiveOp(destination, asset, amount) {
  return Operation.pathPaymentStrictReceive({
    sendAsset: asset,
    sendMax: amount,
    destination,
    destAsset: asset,
    destAmount: amount,
    path: [],
  });
}

function nativePayment(destination, amount = XLM_AMOUNT) {
  return paymentOp(destination, Asset.native(), amount);
}

function heldTrustline(account) {
  const row = account.balances.find(
    (entry) =>
      (entry.asset_type === 'credit_alphanum4' ||
        entry.asset_type === 'credit_alphanum12') &&
      Number(entry.balance) > 0,
  );
  if (!row) {
    throw new Error('account1 has no trustline asset with a balance');
  }
  const amount =
    Number(row.balance) < Number(TRUSTLINE_AMOUNT)
      ? row.balance
      : TRUSTLINE_AMOUNT;
  return {
    asset: new Asset(row.asset_code, row.asset_issuer),
    amount,
  };
}

function findTrustline(account, asset) {
  if (asset.isNative()) {
    const row = account.balances.find((entry) => entry.asset_type === 'native');
    return { exists: true, balance: row?.balance ?? '0' };
  }
  const row = account.balances.find(
    (entry) =>
      entry.asset_code === asset.getCode() &&
      entry.asset_issuer === asset.getIssuer(),
  );
  return row
    ? {
        exists: true,
        balance: row.balance,
        limit: row.limit,
        sponsor: row.sponsor,
      }
    : { exists: false, balance: '0' };
}

function nonZeroLimitAtLeastBalance(line, requested) {
  const requestedN = Number(requested);
  const balanceN = line.exists ? Number(line.balance) : 0;
  let limit = Number.isFinite(requestedN) && requestedN > 0 ? requestedN : 1000;
  if (limit < balanceN) {
    limit = balanceN;
  }
  if (line.exists && Number(line.limit) === limit) {
    limit += 1;
  }
  return String(limit);
}

function requestedLimit(requested, line, label) {
  const value = Number(requested);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid limit "${requested}". Use a number greater than 0.`,
    );
  }
  if (value < Number(line.balance)) {
    throw new Error(
      `limit ${requested} is below ${label} balance ${line.balance}`,
    );
  }
  return requested;
}

function isIssuer(binding, asset) {
  return !asset.isNative() && binding.keypair.publicKey() === asset.getIssuer();
}

async function ensureTrustlineIfNeeded(binding, asset, submit, label) {
  if (asset.isNative() || isIssuer(binding, asset)) {
    return;
  }
  const { exists } = findTrustline(binding.account, asset);
  if (exists) {
    return;
  }
  await submit({
    label: `${label}: changeTrust ${assetLabel(asset)}`,
    signer: binding.keypair,
    operations: [Operation.changeTrust({ asset })],
  });
  binding.account = await server.loadAccount(binding.keypair.publicKey());
}

function assertSpendable(binding, asset, amount) {
  if (isIssuer(binding, asset)) {
    return;
  }
  const needed = Number(amount) * 4;
  const { exists, balance } = findTrustline(binding.account, asset);
  if (!exists) {
    throw new Error(
      `account1 has no trustline for ${assetLabel(
        asset,
      )}; enable it first or run setup so it is added`,
    );
  }
  if (Number(balance) < needed) {
    throw new Error(
      `account1 ${assetLabel(
        asset,
      )} balance ${balance} < ${needed} needed (4× ${amount})`,
    );
  }
}

async function runBalanceMoveSetup({
  account1,
  account2,
  submit,
  asset,
  amount,
}) {
  const dest2 = account2.keypair.publicKey();
  const label = assetLabel(asset);

  await ensureTrustlineIfNeeded(account2, asset, submit, 'account2');
  await ensureTrustlineIfNeeded(account1, asset, submit, 'account1');
  account1.account = await server.loadAccount(account1.keypair.publicKey());
  assertSpendable(account1, asset, amount);

  const tx1 = await submit({
    label: `account1: payment, pathSend, pathReceive, createClaimable (${label})`,
    signer: account1.keypair,
    operations: [
      paymentOp(dest2, asset, amount),
      pathSendOp(dest2, asset, amount),
      pathReceiveOp(dest2, asset, amount),
      Operation.createClaimableBalance({
        asset,
        amount,
        claimants: [new Claimant(dest2, Claimant.predicateUnconditional())],
      }),
    ],
  });

  if (DRY_RUN) {
    console.log('  DRY_RUN: skip claimClaimableBalance');
    return;
  }

  const claimableBalanceId = await claimableBalanceIdFromTx(tx1.hash);
  console.log(`  claimable ${claimableBalanceId}`);

  await submit({
    label: `account2: claimClaimableBalance (${label})`,
    signer: account2.keypair,
    operations: [
      Operation.claimClaimableBalance({
        balanceId: claimableBalanceId,
      }),
    ],
  });
}

async function runBalanceMoveTeardown({
  account1,
  account2,
  submit,
  asset,
  amount,
}) {
  const label = assetLabel(asset);
  const dest1 = account1.keypair.publicKey();

  if (asset.isNative()) {
    const returned = String(Number(amount) * 4);
    await submit({
      label: `account2: return ${returned} ${label} (4× ${amount})`,
      signer: account2.keypair,
      operations: [paymentOp(dest1, asset, returned)],
    });
    return;
  }

  account2.account = await server.loadAccount(account2.keypair.publicKey());
  const line = findTrustline(account2.account, asset);
  if (!line.exists) {
    console.log(`  account2 has no ${label} trustline; nothing to remove`);
    return;
  }

  const operations = [];
  if (Number(line.balance) > 0) {
    operations.push(paymentOp(dest1, asset, line.balance));
  }
  operations.push(Operation.changeTrust({ asset, limit: '0' }));

  await submit({
    label:
      Number(line.balance) > 0
        ? `account2: send remaining ${line.balance} ${label} to account1, then remove trustline`
        : `account2: remove ${label} trustline (balance already 0)`,
    signer: account2.keypair,
    operations,
  });
}

async function claimableBalanceIdFromTx(hash) {
  const page = await server.effects().forTransaction(hash).limit(50).call();
  const created = page.records.find(
    (row) => row.type === 'claimable_balance_created',
  );
  if (!created?.balance_id) {
    throw new Error(
      `No claimable_balance_created effect on ${hash}. Set DRY_RUN=0 and submit setup tx1 first.`,
    );
  }
  return created.balance_id;
}

const STATE_PATH = new URL('./.horizon-fixture-state.mjson', import.meta.url);

function readStateFile() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function writeCaseState(caseName, value) {
  const state = readStateFile();
  if (value === undefined) {
    delete state[caseName];
  } else {
    state[caseName] = value;
  }
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function remember(caseName, value) {
  if (DRY_RUN) {
    console.log(`  DRY_RUN: not saving state for ${caseName}`);
    return;
  }
  writeCaseState(caseName, value);
}

function recall(caseName) {
  const value = readStateFile()[caseName];
  if (!value) {
    throw new Error(
      `No saved state for ${caseName}. Run setup before teardown.`,
    );
  }
  return value;
}

function forget(caseName) {
  if (!DRY_RUN) {
    writeCaseState(caseName, undefined);
  }
}

function requireAccount(binding, label) {
  if (!binding.account) {
    throw new Error(`${label} ${binding.keypair.publicKey()} does not exist`);
  }
}

/**
 * @param {AccountBinding | undefined} binding
 * @returns {asserts binding is AccountBinding}
 */
function requireSponsoredAccount(binding) {
  if (!binding) {
    throw new Error(
      'Missing STELLAR_SECRET_SPONSORED (or STELLAR_PK_SPONSORED)',
    );
  }
}

function assertBalanceAtLeast(binding, asset, amount) {
  if (isIssuer(binding, asset)) {
    return;
  }
  const { exists, balance } = findTrustline(binding.account, asset);
  if (!exists) {
    throw new Error(`${assetLabel(asset)} trustline is missing`);
  }
  if (Number(balance) < Number(amount)) {
    throw new Error(
      `${assetLabel(asset)} balance ${balance} < ${amount} required`,
    );
  }
}

function effectMatchesAsset(entry, asset) {
  if (asset.isNative()) {
    return entry.asset_type === 'native';
  }
  return (
    entry.asset_code === asset.getCode() &&
    entry.asset_issuer === asset.getIssuer()
  );
}

async function creditedAmount(hash, publicKey, asset) {
  const page = await server.effects().forTransaction(hash).limit(100).call();
  const row = page.records.find(
    (entry) =>
      entry.type === 'account_credited' &&
      entry.account === publicKey &&
      effectMatchesAsset(entry, asset),
  );
  if (!row?.amount) {
    throw new Error(
      `No credit of ${assetLabel(asset)} for ${publicKey} on ${hash}`,
    );
  }
  return row.amount;
}

async function listOfferIds(publicKey) {
  const page = await server.offers().forAccount(publicKey).limit(200).call();
  return page.records.map((row) => row.id);
}

/**
 * Offer id created by `hash` that the same transaction did not remove.
 *
 * @param {string} hash - Submitted transaction hash.
 * @returns {Promise<string | null>}
 */
async function restingOfferIdFromTx(hash) {
  const page = await server.effects().forTransaction(hash).limit(50).call();
  const removed = new Set(
    page.records
      .filter((row) => row.type === 'offer_removed')
      .map((row) => String(row.offer_id)),
  );
  const created = page.records.find(
    (row) => row.type === 'offer_created' && !removed.has(String(row.offer_id)),
  );
  return created ? String(created.offer_id) : null;
}

/**
 * @param {string} offerId
 * @returns {Promise<import('@stellar/stellar-sdk').Horizon.ServerApi.OfferRecord | null>}
 */
async function loadOfferIfExists(offerId) {
  try {
    return await server.offers().offer(offerId).call();
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * @param {{ asset_type: string, asset_code?: string, asset_issuer?: string }} asset
 * @returns {import('@stellar/stellar-sdk').Asset}
 */
function horizonAsset(asset) {
  if (asset.asset_type === 'native') {
    return Asset.native();
  }
  return new Asset(asset.asset_code, asset.asset_issuer);
}

function feeXlm(opCount = 1) {
  return (BASE_FEE * opCount) / 10_000_000;
}

function trimDecimal(value) {
  return Number(value).toFixed(7).replace(/0+$/u, '').replace(/\.$/u, '');
}

function amountToStroops(amount) {
  const [whole, frac = ''] = String(amount).split('.');
  if (!/^\d+$/u.test(whole) || !/^\d*$/u.test(frac) || frac.length > 7) {
    throw new Error(`Invalid amount ${amount}`);
  }
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, '0'));
}

function stroopsToAmount(stroops) {
  const negative = stroops < 0n;
  const value = negative ? -stroops : stroops;
  const whole = value / 10_000_000n;
  const frac = (value % 10_000_000n)
    .toString()
    .padStart(7, '0')
    .replace(/0+$/u, '');
  const text = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${text}` : text;
}

function constantProductPool() {
  const native = Asset.native();
  const [assetA, assetB] =
    Asset.compare(native, TRUSTLINE_ASSET) < 0
      ? [native, TRUSTLINE_ASSET]
      : [TRUSTLINE_ASSET, native];
  const fee = LiquidityPoolFeeV18;
  return {
    assetA,
    assetB,
    poolAsset: new LiquidityPoolAsset(assetA, assetB, fee),
    poolId: Buffer.from(
      getLiquidityPoolId('constant_product', { assetA, assetB, fee }),
    ).toString('hex'),
  };
}

function poolShare(account, poolId) {
  const row = account.balances.find(
    (entry) =>
      entry.asset_type === 'liquidity_pool_shares' &&
      entry.liquidity_pool_id === poolId,
  );
  return row
    ? { exists: true, balance: row.balance }
    : { exists: false, balance: '0' };
}

function pathSwapOp(destination, sendAsset, sendAmount, destAsset) {
  return Operation.pathPaymentStrictSend({
    sendAsset,
    sendAmount,
    destination,
    destAsset,
    destMin: '0.0000001',
    path: [],
  });
}

async function bestBid(selling, buying) {
  const book = await server.orderbook(selling, buying).call();
  const bid = book.bids?.[0];
  if (!bid?.price || !bid.amount) {
    throw new Error(
      `No bid on ${assetLabel(selling)}/${assetLabel(
        buying,
      )}; cannot force a fill`,
    );
  }
  return bid;
}

/** @type {Record<string, Case>} */
const CASES = {
  test1: {
    description: `Account 1: payment (XLM → account 2) + changeTrust enable ${TRUSTLINE_ASSET.getCode()} in one tx`,
    async setup({ account1, account2 }, { submit }) {
      await submit({
        label: `account1 payment + enable ${assetLabel(TRUSTLINE_ASSET)}`,
        signer: account1.keypair,
        operations: [
          nativePayment(account2.keypair.publicKey()),
          Operation.changeTrust({ asset: TRUSTLINE_ASSET }),
        ],
      });
    },
    async teardown({ account1, account2 }, { submit }) {
      await submit({
        label: 'account2 return XLM',
        signer: account2.keypair,
        operations: [nativePayment(account1.keypair.publicKey())],
      });
      await submit({
        label: `account1 remove ${assetLabel(TRUSTLINE_ASSET)} trustline`,
        signer: account1.keypair,
        operations: [
          Operation.changeTrust({ asset: TRUSTLINE_ASSET, limit: '0' }),
        ],
      });
    },
  },

  /**
   * Two txs: ops that credit/debit existing native (XLM) balances.
   */
  'balance-move': {
    description:
      '2 txs: native payment + both path-payments + createClaimable, then claim',
    async setup(accounts, helpers) {
      await runBalanceMoveSetup({
        ...accounts,
        ...helpers,
        asset: Asset.native(),
        amount: XLM_AMOUNT,
      });
    },
    async teardown(accounts, helpers) {
      await runBalanceMoveTeardown({
        ...accounts,
        ...helpers,
        asset: Asset.native(),
        amount: XLM_AMOUNT,
      });
    },
  },

  /**
   * Same balance ops as `balance-move`, using a classic trustline asset.
   * Adds changeTrust first if a side is missing the line. Account 1 must already
   * hold at least 4× TRUSTLINE_AMOUNT (unless it is the issuer).
   * Teardown sweeps account2's remaining token to account1 in the same tx as
   * changeTrust limit=0 (Stellar requires a 0 balance to drop a trustline).
   * Account 1 keeps the tokens, so its trustline is left in place.
   */
  'balance-move-trustline': {
    description: `same as balance-move for ${TRUSTLINE_ASSET.getCode()} trustline token`,
    async setup(accounts, helpers) {
      await runBalanceMoveSetup({
        ...accounts,
        ...helpers,
        asset: TRUSTLINE_ASSET,
        amount: TRUSTLINE_AMOUNT,
      });
    },
    async teardown(accounts, helpers) {
      await runBalanceMoveTeardown({
        ...accounts,
        ...helpers,
        asset: TRUSTLINE_ASSET,
        amount: TRUSTLINE_AMOUNT,
      });
    },
  },

  /**
   * One tx (account 1 source, both keys sign):
   * - add EURC trustline on account 1
   * - update TRUSTLINE_ASSET limit (non-zero) on account 1
   * - account 1 sponsors account 2 creating a PYUSD trustline
   *
   * Does not toggle `authorized` (issuer-only).
   */
  'trustline-metadata': {
    description: `1 tx: add EURC, update ${TRUSTLINE_ASSET.getCode()} limit, sponsor PYUSD trustline on account2`,
    async setup({ account1, account2 }, { submit }) {
      const dest2 = account2.keypair.publicKey();
      const eurcLine = findTrustline(account1.account, EURC);
      const heldLine = findTrustline(account1.account, TRUSTLINE_ASSET);
      const pyusdLine = findTrustline(account2.account, PYUSD);

      if (pyusdLine.exists) {
        throw new Error(
          `account2 already has ${assetLabel(
            PYUSD,
          )}; teardown that line (balance 0) before sponsoring a create`,
        );
      }

      const operations = [];
      if (eurcLine.exists) {
        console.log(`  skip add EURC: account1 already has the trustline`);
      } else {
        operations.push(Operation.changeTrust({ asset: EURC }));
      }

      const heldLimit = nonZeroLimitAtLeastBalance(heldLine, TRUSTLINE_LIMIT);
      if (!heldLine.exists) {
        operations.push(Operation.changeTrust({ asset: TRUSTLINE_ASSET }));
        console.log(
          `  ${assetLabel(
            TRUSTLINE_ASSET,
          )} missing: add then set limit ${heldLimit}`,
        );
      }
      operations.push(
        Operation.changeTrust({
          asset: TRUSTLINE_ASSET,
          limit: heldLimit,
        }),
      );

      operations.push(
        Operation.beginSponsoringFutureReserves({ sponsoredId: dest2 }),
        Operation.changeTrust({
          asset: PYUSD,
          source: dest2,
        }),
        Operation.endSponsoringFutureReserves({ source: dest2 }),
      );

      await submit({
        label: `account1+2: add EURC, ${assetLabel(
          TRUSTLINE_ASSET,
        )} limit ${heldLimit}, sponsor PYUSD on account2`,
        signer: account1.keypair,
        signers: [account2.keypair],
        operations,
      });
    },
    async teardown({ account1, account2 }, { submit }) {
      account1.account = await server.loadAccount(account1.keypair.publicKey());
      account2.account = await server.loadAccount(account2.keypair.publicKey());

      const account1Ops = [];
      const eurcLine = findTrustline(account1.account, EURC);
      if (eurcLine.exists && Number(eurcLine.balance) > 0) {
        console.log(
          `  skip remove EURC: balance ${eurcLine.balance} (send it away first)`,
        );
      } else if (eurcLine.exists) {
        account1Ops.push(Operation.changeTrust({ asset: EURC, limit: '0' }));
      }

      const heldLine = findTrustline(account1.account, TRUSTLINE_ASSET);
      if (heldLine.exists) {
        account1Ops.push(Operation.changeTrust({ asset: TRUSTLINE_ASSET }));
      }

      if (account1Ops.length > 0) {
        await submit({
          label: `account1: remove EURC if empty, restore ${assetLabel(
            TRUSTLINE_ASSET,
          )} limit to max`,
          signer: account1.keypair,
          operations: account1Ops,
        });
      }

      const pyusdLine = findTrustline(account2.account, PYUSD);
      if (!pyusdLine.exists) {
        return;
      }

      const pyusdOps = [];
      if (Number(pyusdLine.balance) > 0) {
        const destLine = findTrustline(account1.account, PYUSD);
        if (!destLine.exists) {
          throw new Error(
            `account2 PYUSD balance ${pyusdLine.balance} but account1 has no PYUSD trustline to receive a sweep`,
          );
        }
        pyusdOps.push(
          paymentOp(account1.keypair.publicKey(), PYUSD, pyusdLine.balance),
        );
      }
      pyusdOps.push(Operation.changeTrust({ asset: PYUSD, limit: '0' }));
      await submit({
        label:
          Number(pyusdLine.balance) > 0
            ? 'account2: send remaining PYUSD to account1, then remove sponsored trustline'
            : 'account2: remove sponsored PYUSD trustline',
        signer: account2.keypair,
        operations: pyusdOps,
      });
    },
  },

  /**
   * changeTrust with a new non-zero limit on account1's TRUSTLINE_ASSET.
   * The trustline must already exist.
   * Teardown sets the limit back to the value saved at setup.
   */
  'trustline-limit': {
    description: `change only account1's ${TRUSTLINE_ASSET.getCode()} trustline limit (optional arg, default ${TRUSTLINE_LIMIT}); teardown restores it`,
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const asset = TRUSTLINE_ASSET;
      const label = assetLabel(asset);
      const line = findTrustline(account1.account, asset);
      if (!line.exists) {
        throw new Error(`account1 has no ${label} trustline`);
      }
      const requested = process.argv[4];
      const nextLimit =
        requested === undefined
          ? nonZeroLimitAtLeastBalance(line, TRUSTLINE_LIMIT)
          : requestedLimit(requested, line, label);
      await submit({
        label: `account1: changeTrust ${label} limit ${line.limit} -> ${nextLimit}`,
        signer: account1.keypair,
        operations: [Operation.changeTrust({ asset, limit: nextLimit })],
      });
      remember('trustline-limit', {
        previousLimit: line.limit,
      });
    },
    async teardown({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const { previousLimit } = recall('trustline-limit');
      account1.account = await server.loadAccount(account1.keypair.publicKey());
      const asset = TRUSTLINE_ASSET;
      const label = assetLabel(asset);
      const line = findTrustline(account1.account, asset);
      if (!line.exists) {
        throw new Error(`account1 no longer has ${label}`);
      }
      if (Number(line.balance) > Number(previousLimit)) {
        throw new Error(
          `${label} balance ${line.balance} is above the previous limit ${previousLimit}`,
        );
      }
      await submit({
        label: `account1: restore ${label} limit ${previousLimit}`,
        signer: account1.keypair,
        operations: [Operation.changeTrust({ asset, limit: previousLimit })],
      });
      forget('trustline-limit');
    },
  },

  /**
   * Inner tx source = account 2 (create / remove a trustline).
   * Outer fee-bump source = account 1 (pays the inclusion fee).
   */
  'fee-bump': {
    description: `Fee-bump: account2 changeTrust ${TRUSTLINE_ASSET.getCode()}; account1 pays the fee`,
    async setup({ account1, account2 }, { submit }) {
      const line = findTrustline(account2.account, TRUSTLINE_ASSET);
      if (line.exists) {
        throw new Error(
          `account2 already has ${assetLabel(TRUSTLINE_ASSET)}; teardown first`,
        );
      }
      await submit({
        label: `account2 add ${assetLabel(
          TRUSTLINE_ASSET,
        )} trustline, account1 fee-bump`,
        signer: account2.keypair,
        feeSource: account1.keypair,
        operations: [Operation.changeTrust({ asset: TRUSTLINE_ASSET })],
      });
    },
    async teardown({ account1, account2 }, { submit }) {
      account2.account = await server.loadAccount(account2.keypair.publicKey());
      const line = findTrustline(account2.account, TRUSTLINE_ASSET);
      if (!line.exists) {
        console.log(
          `  account2 has no ${assetLabel(
            TRUSTLINE_ASSET,
          )} trustline; nothing to remove`,
        );
        return;
      }
      if (Number(line.balance) > 0) {
        throw new Error(
          `account2 ${assetLabel(TRUSTLINE_ASSET)} balance ${
            line.balance
          }; send it away before removing the trustline`,
        );
      }
      await submit({
        label: `account2 remove ${assetLabel(
          TRUSTLINE_ASSET,
        )} trustline, account1 fee-bump`,
        signer: account2.keypair,
        feeSource: account1.keypair,
        operations: [
          Operation.changeTrust({ asset: TRUSTLINE_ASSET, limit: '0' }),
        ],
      });
    },
  },

  /**
   * Account 1 pays itself whatever trustline asset it already holds.
   * The token balance does not move. Teardown cannot refund the fee.
   */
  'self-payment': {
    description: 'account1 pays a trustline asset it already holds to itself',
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const { asset, amount } = heldTrustline(account1.account);
      console.log(`  using ${amount} ${assetLabel(asset)}`);
      await submit({
        label: `account1 self-payment ${amount} ${assetLabel(asset)}`,
        signer: account1.keypair,
        operations: [paymentOp(account1.keypair.publicKey(), asset, amount)],
      });
    },
    async teardown() {
      console.log('  token balance is unchanged; the fee is not refundable');
    },
  },

  /**
   * Account 1 spends XLM. Account 2 receives the trustline asset.
   * Teardown path-swaps that received amount back to XLM on account 1.
   */
  'path-payment': {
    description: `account1 path-pays ${XLM_AMOUNT} XLM; account2 receives ${TRUSTLINE_ASSET.getCode()}`,
    async setup({ account1, account2 }, { submit }) {
      requireAccount(account1, 'account1');
      requireAccount(account2, 'account2');
      if (isIssuer(account2, TRUSTLINE_ASSET)) {
        throw new Error(
          `account2 issues ${assetLabel(
            TRUSTLINE_ASSET,
          )} and cannot receive it`,
        );
      }
      await ensureTrustlineIfNeeded(
        account2,
        TRUSTLINE_ASSET,
        submit,
        'account2',
      );
      const tx = await submit({
        label: `account1 path-pay ${XLM_AMOUNT} XLM -> ${assetLabel(
          TRUSTLINE_ASSET,
        )} to account2`,
        signer: account1.keypair,
        operations: [
          pathSwapOp(
            account2.keypair.publicKey(),
            Asset.native(),
            XLM_AMOUNT,
            TRUSTLINE_ASSET,
          ),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      const received = await creditedAmount(
        tx.hash,
        account2.keypair.publicKey(),
        TRUSTLINE_ASSET,
      );
      console.log(
        `  account2 received ${received} ${assetLabel(TRUSTLINE_ASSET)}`,
      );
      remember('path-payment', { received });
    },
    async teardown({ account1, account2 }, { submit }) {
      const { received } = recall('path-payment');
      await submit({
        label: `account2 path-swap ${received} ${assetLabel(
          TRUSTLINE_ASSET,
        )} back to account1 as XLM`,
        signer: account2.keypair,
        operations: [
          pathSwapOp(
            account1.keypair.publicKey(),
            TRUSTLINE_ASSET,
            received,
            Asset.native(),
          ),
        ],
      });
      forget('path-payment');
    },
  },

  /**
   * Setup locks an asset in a claimable balance and stops.
   * Optional argv asset id; omitted means XLM.
   * Teardown is account 2 claiming it.
   */
  claimable: {
    description: `account1 locks ${XLM_AMOUNT} of an asset (default XLM; optional asset id) as a claimable balance for account2; teardown claims it`,
    async setup({ account1, account2 }, { submit }) {
      requireAccount(account1, 'account1');
      requireAccount(account2, 'account2');
      const asset = assetFromOptionalId(process.argv[4]);
      const amount = asset.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT;
      const label = assetLabel(asset);
      if (!asset.isNative() && !isIssuer(account1, asset)) {
        const line = findTrustline(account1.account, asset);
        if (!line.exists) {
          throw new Error(`account1 has no trustline for ${label}`);
        }
        if (Number(line.balance) < Number(amount)) {
          throw new Error(
            `account1 ${label} balance ${line.balance} < ${amount}`,
          );
        }
      }
      await ensureTrustlineIfNeeded(account2, asset, submit, 'account2');
      const tx = await submit({
        label: `account1 createClaimableBalance ${amount} ${label} for account2`,
        signer: account1.keypair,
        operations: [
          Operation.createClaimableBalance({
            asset,
            amount,
            claimants: [
              new Claimant(
                account2.keypair.publicKey(),
                Claimant.predicateUnconditional(),
              ),
            ],
          }),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      const balanceId = await claimableBalanceIdFromTx(tx.hash);
      console.log(`  claimable ${balanceId}`);
      remember('claimable', { balanceId });
    },
    async teardown({ account2 }, { submit }) {
      const { balanceId } = recall('claimable');
      await submit({
        label: 'account2 claimClaimableBalance',
        signer: account2.keypair,
        operations: [Operation.claimClaimableBalance({ balanceId })],
      });
      forget('claimable');
    },
  },

  /**
   * Issuer-only. Setup mints a claimable balance of TRUSTLINE_ASSET.
   * Teardown claws it back, which burns the locked amount.
   */
  'claimable-clawback': {
    description: `issuer account1 creates a ${TRUSTLINE_ASSET.getCode()} claimable balance; teardown claws it back`,
    async setup({ account1, account2 }, { submit }) {
      requireAccount(account1, 'account1');
      requireAccount(account2, 'account2');
      if (!isIssuer(account1, TRUSTLINE_ASSET)) {
        throw new Error(
          `account1 is not the issuer of ${assetLabel(
            TRUSTLINE_ASSET,
          )}. Clawback is issuer-only.`,
        );
      }
      const tx = await submit({
        label: `account1 createClaimableBalance ${TRUSTLINE_AMOUNT} ${assetLabel(
          TRUSTLINE_ASSET,
        )}`,
        signer: account1.keypair,
        operations: [
          Operation.createClaimableBalance({
            asset: TRUSTLINE_ASSET,
            amount: TRUSTLINE_AMOUNT,
            claimants: [
              new Claimant(
                account2.keypair.publicKey(),
                Claimant.predicateUnconditional(),
              ),
            ],
          }),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      const balanceId = await claimableBalanceIdFromTx(tx.hash);
      console.log(`  claimable ${balanceId}`);
      remember('claimable-clawback', { balanceId });
    },
    async teardown({ account1 }, { submit }) {
      const { balanceId } = recall('claimable-clawback');
      await submit({
        label: 'account1 clawbackClaimableBalance',
        signer: account1.keypair,
        operations: [Operation.clawbackClaimableBalance({ balanceId })],
      });
      forget('claimable-clawback');
    },
  },

  /**
   * Merges `STELLAR_SECRET_SPONSORED` into account 1. Refuses when that
   * account has subentries, sponsorships, extra signers, or less than 1 XLM
   * left after the fee (teardown could not recreate it).
   * Teardown is createAccount with the XLM account 1 received.
   */
  'account-merge': {
    description:
      'STELLAR_SECRET_SPONSORED merges into account1; teardown recreates it with the merged XLM',
    async setup({ account1, sponsoredAccount }, { submit }) {
      requireAccount(account1, 'account1');
      requireSponsoredAccount(sponsoredAccount);
      requireAccount(sponsoredAccount, 'sponsored account');
      const { account } = sponsoredAccount;
      if (Number(account.subentry_count) !== 0) {
        throw new Error(
          `sponsored account subentry_count is ${account.subentry_count}; remove trustlines, offers, and data entries first`,
        );
      }
      if (
        Number(account.num_sponsoring) !== 0 ||
        Number(account.num_sponsored) !== 0
      ) {
        throw new Error(
          'sponsored account is sponsoring or sponsored; merge would not restore cleanly',
        );
      }
      const extraSigners = account.signers.filter(
        (signer) =>
          signer.weight > 0 &&
          signer.key !== sponsoredAccount.keypair.publicKey(),
      );
      if (extraSigners.length > 0) {
        throw new Error('sponsored account has extra signers');
      }
      const native = findTrustline(account, Asset.native());
      const restoreBalance = trimDecimal(Number(native.balance) - feeXlm(1));
      if (Number(restoreBalance) < 1) {
        throw new Error(
          `sponsored account XLM ${native.balance} is below 1 XLM after the fee, so teardown could not recreate it`,
        );
      }
      console.log(
        `  teardown will recreate sponsored account with ${restoreBalance} XLM`,
      );
      await submit({
        label: 'sponsored account accountMerge into account1',
        signer: sponsoredAccount.keypair,
        operations: [
          Operation.accountMerge({
            destination: account1.keypair.publicKey(),
          }),
        ],
      });
      remember('account-merge', { restoreBalance });
    },
    async teardown({ account1, sponsoredAccount }, { submit }) {
      requireSponsoredAccount(sponsoredAccount);
      if (sponsoredAccount.account) {
        throw new Error(
          'sponsored account still exists; setup did not merge it',
        );
      }
      const { restoreBalance } = recall('account-merge');
      await submit({
        label: `account1 createAccount sponsored account startingBalance ${restoreBalance}`,
        signer: account1.keypair,
        operations: [
          Operation.createAccount({
            destination: sponsoredAccount.keypair.publicKey(),
            startingBalance: restoreBalance,
          }),
        ],
      });
      forget('account-merge');
    },
  },

  /**
   * Account 1 sponsors a brand-new account with starting balance 2.
   * Uses `sponsoredAccount` when `STELLAR_SECRET_SPONSORED` (or
   * `STELLAR_PK_SPONSORED`) is set; otherwise a random keypair.
   * The provided account must not already exist.
   * Teardown fee-bumps an accountMerge of that account back into account 1.
   */
  'sponsored-account': {
    description:
      'account1 sponsors a new account with 2 XLM (optional STELLAR_SECRET_SPONSORED); teardown fee-bumps a merge back',
    async setup({ account1, sponsoredAccount }, { submit }) {
      requireAccount(account1, 'account1');
      if (sponsoredAccount?.account) {
        throw new Error(
          `sponsored account ${sponsoredAccount.keypair.publicKey()} already exists`,
        );
      }
      const ephemeral = sponsoredAccount?.keypair ?? Keypair.random();
      console.log(
        `  sponsored account ${ephemeral.publicKey()}${
          sponsoredAccount ? '' : ' (random)'
        }`,
      );
      await submit({
        label: 'account1 sponsor createAccount startingBalance 2',
        signer: account1.keypair,
        signers: [ephemeral],
        operations: [
          Operation.beginSponsoringFutureReserves({
            sponsoredId: ephemeral.publicKey(),
          }),
          Operation.createAccount({
            destination: ephemeral.publicKey(),
            startingBalance: '2',
          }),
          Operation.endSponsoringFutureReserves({
            source: ephemeral.publicKey(),
          }),
        ],
      });
      remember('sponsored-account', { secret: ephemeral.secret() });
    },
    async teardown({ account1 }, { submit }) {
      const { secret } = recall('sponsored-account');
      const ephemeral = Keypair.fromSecret(secret);
      await submit({
        label: 'fee-bump accountMerge sponsored account into account1',
        signer: ephemeral,
        feeSource: account1.keypair,
        operations: [
          Operation.accountMerge({
            destination: account1.keypair.publicKey(),
          }),
        ],
      });
      forget('sponsored-account');
    },
  },

  /**
   * Inner payment source is account 2. Account 1 pays the fee via fee-bump.
   * Teardown is a normal payment of the same amount back.
   */
  'fee-bump-payment': {
    description: `fee-bump: account2 pays ${XLM_AMOUNT} XLM to account1; account1 pays the fee`,
    async setup({ account1, account2 }, { submit }) {
      requireAccount(account1, 'account1');
      requireAccount(account2, 'account2');
      assertBalanceAtLeast(account2, Asset.native(), XLM_AMOUNT);
      await submit({
        label: `account2 pays ${XLM_AMOUNT} XLM to account1, account1 fee-bump`,
        signer: account2.keypair,
        feeSource: account1.keypair,
        operations: [nativePayment(account1.keypair.publicKey())],
      });
    },
    async teardown({ account1, account2 }, { submit }) {
      await submit({
        label: `account1 returns ${XLM_AMOUNT} XLM to account2`,
        signer: account1.keypair,
        operations: [nativePayment(account2.keypair.publicKey())],
      });
    },
  },

  /**
   * One transaction pays XLM to two existing addresses.
   * Both addresses are required. There is no sponsorship and no rollback.
   */
  'two-receivers': {
    description: `one tx: account1 pays ${XLM_AMOUNT} XLM to two addresses (setup two-receivers <address> <address>)`,
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const [receiver1, receiver2] = [process.argv[4], process.argv[5]];
      if (!receiver1 || !receiver2) {
        throw new Error('Usage: setup two-receivers <address> <address>');
      }
      for (const address of [receiver1, receiver2]) {
        if (!StrKey.isValidEd25519PublicKey(address)) {
          throw new Error(`Invalid account address "${address}"`);
        }
      }
      const [onChain1, onChain2] = await Promise.all([
        loadAccountIfExists(receiver1),
        loadAccountIfExists(receiver2),
      ]);
      if (!onChain1) {
        throw new Error(`${receiver1} is not on chain`);
      }
      if (!onChain2) {
        throw new Error(`${receiver2} is not on chain`);
      }
      assertBalanceAtLeast(
        account1,
        Asset.native(),
        String(Number(XLM_AMOUNT) * 2),
      );
      await submit({
        label: `account1 pays ${XLM_AMOUNT} XLM to ${receiver1} and ${receiver2}`,
        signer: account1.keypair,
        operations: [nativePayment(receiver1), nativePayment(receiver2)],
      });
    },
    async teardown() {
      throw new Error(
        'two-receivers does not roll back. The payments went to the addresses you passed.',
      );
    },
  },

  /**
   * Transaction source is account 1 (pays the fee).
   * Payment source is account 2 (loses the XLM).
   * Teardown pays the same amount back.
   */
  'op-source': {
    description: `tx source account1 pays the fee; op source account2 pays ${XLM_AMOUNT} XLM to account1`,
    async setup({ account1, account2 }, { submit }) {
      requireAccount(account1, 'account1');
      requireAccount(account2, 'account2');
      assertBalanceAtLeast(account2, Asset.native(), XLM_AMOUNT);
      await submit({
        label: `account2 pays ${XLM_AMOUNT} XLM inside an account1 transaction`,
        signer: account1.keypair,
        signers: [account2.keypair],
        operations: [
          Operation.payment({
            destination: account1.keypair.publicKey(),
            asset: Asset.native(),
            amount: XLM_AMOUNT,
            source: account2.keypair.publicKey(),
          }),
        ],
      });
    },
    async teardown({ account1, account2 }, { submit }) {
      await submit({
        label: `account1 returns ${XLM_AMOUNT} XLM to account2`,
        signer: account1.keypair,
        operations: [nativePayment(account2.keypair.publicKey())],
      });
    },
  },

  /**
   * Sells the trustline asset for XLM at a price that will not cross.
   * Teardown cancels that offer.
   */
  'resting-offer': {
    description: `account1 rests a ${TRUSTLINE_ASSET.getCode()} sell that does not fill; teardown cancels it`,
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      assertBalanceAtLeast(account1, TRUSTLINE_ASSET, TRUSTLINE_AMOUNT);
      const before = new Set(await listOfferIds(account1.keypair.publicKey()));
      await submit({
        label: `account1 rest sell ${TRUSTLINE_AMOUNT} ${assetLabel(
          TRUSTLINE_ASSET,
        )} at 1000000 XLM`,
        signer: account1.keypair,
        operations: [
          Operation.manageSellOffer({
            selling: TRUSTLINE_ASSET,
            buying: Asset.native(),
            amount: TRUSTLINE_AMOUNT,
            price: '1000000',
            offerId: '0',
          }),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      const created = (await listOfferIds(account1.keypair.publicKey())).filter(
        (id) => !before.has(id),
      );
      if (created.length !== 1) {
        throw new Error(
          `Expected 1 new offer, found ${created.length} (${created.join(
            ', ',
          )})`,
        );
      }
      console.log(`  offer ${created[0]}`);
      remember('resting-offer', { offerId: created[0] });
    },
    async teardown({ account1 }, { submit }) {
      const { offerId } = recall('resting-offer');
      await submit({
        label: `account1 cancel offer ${offerId}`,
        signer: account1.keypair,
        operations: [
          Operation.manageSellOffer({
            selling: TRUSTLINE_ASSET,
            buying: Asset.native(),
            amount: '0',
            price: '1',
            offerId,
          }),
        ],
      });
      forget('resting-offer');
    },
  },

  /**
   * Sells XLM into the best bid for the trustline asset so the offer fills.
   * An unfilled remainder is left on the book and its offer id is saved.
   * Teardown path-swaps the received tokens back to XLM and keeps that id.
   * `offer-fill-cancel` cancels the remainder when it is still open.
   */
  'offer-fill': {
    description: `account1 sells XLM into the best ${TRUSTLINE_ASSET.getCode()} bid; teardown swaps it back`,
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      if (isIssuer(account1, TRUSTLINE_ASSET)) {
        throw new Error(
          `account1 issues ${assetLabel(
            TRUSTLINE_ASSET,
          )} and cannot receive it`,
        );
      }
      const line = findTrustline(account1.account, TRUSTLINE_ASSET);
      if (!line.exists) {
        await ensureTrustlineIfNeeded(
          account1,
          TRUSTLINE_ASSET,
          submit,
          'account1',
        );
      }
      const bid = await bestBid(Asset.native(), TRUSTLINE_ASSET);
      const sellAmount =
        Number(XLM_AMOUNT) <= Number(bid.amount) ? XLM_AMOUNT : bid.amount;
      const tx = await submit({
        label: `account1 sell ${sellAmount} XLM at bid ${bid.price}`,
        signer: account1.keypair,
        operations: [
          Operation.manageSellOffer({
            selling: Asset.native(),
            buying: TRUSTLINE_ASSET,
            amount: sellAmount,
            price: bid.price,
            offerId: '0',
          }),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      const received = await creditedAmount(
        tx.hash,
        account1.keypair.publicKey(),
        TRUSTLINE_ASSET,
      );
      const offerId = await restingOfferIdFromTx(tx.hash);
      const leftover = offerId ? await loadOfferIfExists(offerId) : null;
      if (leftover) {
        console.log(`  leftover offer ${offerId} selling ${leftover.amount}`);
      } else {
        console.log('  no leftover offer');
      }
      console.log(`  filled ${received} ${assetLabel(TRUSTLINE_ASSET)}`);
      remember('offer-fill', {
        received,
        ...(leftover ? { offerId } : {}),
      });
    },
    async teardown({ account1 }, { submit }) {
      const saved = recall('offer-fill');
      if (saved.received) {
        await submit({
          label: `account1 path-swap ${saved.received} ${assetLabel(
            TRUSTLINE_ASSET,
          )} back to XLM`,
          signer: account1.keypair,
          operations: [
            pathSwapOp(
              account1.keypair.publicKey(),
              TRUSTLINE_ASSET,
              saved.received,
              Asset.native(),
            ),
          ],
        });
      }
      if (saved.offerId) {
        remember('offer-fill', { offerId: saved.offerId });
        return;
      }
      forget('offer-fill');
    },
  },

  /**
   * Cancels the resting offer id saved by `offer-fill`, when that offer is
   * still open. A full fill, or an offer already gone from the book, is a no-op.
   * Cancelling returns the unsold XLM to account 1. There is nothing to roll back.
   */
  'offer-fill-cancel': {
    description:
      'cancels the leftover offer id saved by offer-fill, if that offer is still open',
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const saved = recall('offer-fill');
      if (!saved.offerId) {
        console.log('  offer-fill has no leftover offer id');
        return;
      }
      const leftover = await loadOfferIfExists(saved.offerId);
      if (!leftover) {
        console.log(`  offer ${saved.offerId} is already closed`);
        if (saved.received) {
          remember('offer-fill', { received: saved.received });
        } else {
          forget('offer-fill');
        }
        return;
      }
      console.log(
        `  offer ${saved.offerId} still open, selling ${leftover.amount}`,
      );
      await submit({
        label: `account1 cancel leftover offer ${saved.offerId}`,
        signer: account1.keypair,
        operations: [
          Operation.manageSellOffer({
            selling: horizonAsset(leftover.selling),
            buying: horizonAsset(leftover.buying),
            amount: '0',
            price: leftover.price,
            offerId: saved.offerId,
          }),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      if (saved.received) {
        remember('offer-fill', { received: saved.received });
      } else {
        forget('offer-fill');
      }
    },
    async teardown() {
      console.log(
        '  nothing to roll back; cancelling an offer returns the unsold XLM',
      );
    },
  },

  /**
   * Deposits XLM and the trustline asset into their constant-product pool.
   * Teardown withdraws every share from that pool and removes the share trustline.
   * Refuses when account 1 already holds shares.
   */
  'liquidity-pool': {
    description: `account1 deposits into the XLM/${TRUSTLINE_ASSET.getCode()} pool; teardown withdraws all shares`,
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const pool = constantProductPool();
      const existing = poolShare(account1.account, pool.poolId);
      if (Number(existing.balance) > 0) {
        throw new Error(
          `account1 already holds ${existing.balance} shares of ${pool.poolId}; withdraw them first`,
        );
      }
      assertBalanceAtLeast(
        account1,
        pool.assetA,
        pool.assetA.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
      );
      assertBalanceAtLeast(
        account1,
        pool.assetB,
        pool.assetB.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
      );
      const operations = [];
      if (!existing.exists) {
        operations.push(Operation.changeTrust({ asset: pool.poolAsset }));
      }
      operations.push(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: pool.poolId,
          maxAmountA: pool.assetA.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
          maxAmountB: pool.assetB.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
          minPrice: '0.0000001',
          maxPrice: '1000000',
        }),
      );
      await submit({
        label: `account1 deposit into pool ${pool.poolId}`,
        signer: account1.keypair,
        operations,
      });
      remember('liquidity-pool', { poolId: pool.poolId });
    },
    async teardown({ account1 }, { submit }) {
      const { poolId } = recall('liquidity-pool');
      const pool = constantProductPool();
      if (pool.poolId !== poolId) {
        throw new Error(
          `Saved pool ${poolId} does not match current TRUSTLINE asset pool ${pool.poolId}`,
        );
      }
      account1.account = await server.loadAccount(account1.keypair.publicKey());
      const shares = poolShare(account1.account, poolId);
      if (!shares.exists) {
        console.log('  no pool-share trustline; nothing to withdraw');
        forget('liquidity-pool');
        return;
      }
      const operations = [];
      if (Number(shares.balance) > 0) {
        operations.push(
          Operation.liquidityPoolWithdraw({
            liquidityPoolId: poolId,
            amount: shares.balance,
            minAmountA: '0',
            minAmountB: '0',
          }),
        );
      }
      operations.push(
        Operation.changeTrust({ asset: pool.poolAsset, limit: '0' }),
      );
      await submit({
        label: 'account1 withdraw pool shares and remove the trustline',
        signer: account1.keypair,
        operations,
      });
      forget('liquidity-pool');
    },
  },

  /**
   * Adds another deposit on an existing pool-share trustline.
   * Errors when that trustline is missing.
   * Teardown withdraws only the shares this setup added.
   */
  'liquidity-pool-increase': {
    description: `account1 deposits more into the XLM/${TRUSTLINE_ASSET.getCode()} pool; the share trustline must already exist`,
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const pool = constantProductPool();
      const existing = poolShare(account1.account, pool.poolId);
      if (!existing.exists) {
        throw new Error(
          `account1 has no pool-share trustline for ${pool.poolId}; create it before increasing the deposit`,
        );
      }
      assertBalanceAtLeast(
        account1,
        pool.assetA,
        pool.assetA.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
      );
      assertBalanceAtLeast(
        account1,
        pool.assetB,
        pool.assetB.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
      );
      const sharesBefore = amountToStroops(existing.balance);
      await submit({
        label: `account1 increase deposit in pool ${pool.poolId}`,
        signer: account1.keypair,
        operations: [
          Operation.liquidityPoolDeposit({
            liquidityPoolId: pool.poolId,
            maxAmountA: pool.assetA.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
            maxAmountB: pool.assetB.isNative() ? XLM_AMOUNT : TRUSTLINE_AMOUNT,
            minPrice: '0.0000001',
            maxPrice: '1000000',
          }),
        ],
      });
      if (DRY_RUN) {
        return;
      }
      account1.account = await server.loadAccount(account1.keypair.publicKey());
      const after = poolShare(account1.account, pool.poolId);
      const added = amountToStroops(after.balance) - sharesBefore;
      if (added <= 0n) {
        throw new Error('deposit did not increase pool shares');
      }
      const addedAmount = stroopsToAmount(added);
      console.log(`  added ${addedAmount} shares`);
      remember('liquidity-pool-increase', {
        poolId: pool.poolId,
        added: addedAmount,
      });
    },
    async teardown({ account1 }, { submit }) {
      const { poolId, added } = recall('liquidity-pool-increase');
      const pool = constantProductPool();
      if (pool.poolId !== poolId) {
        throw new Error(
          `Saved pool ${poolId} does not match current TRUSTLINE asset pool ${pool.poolId}`,
        );
      }
      await submit({
        label: `account1 withdraw ${added} shares added by liquidity-pool-increase`,
        signer: account1.keypair,
        operations: [
          Operation.liquidityPoolWithdraw({
            liquidityPoolId: poolId,
            amount: added,
            minAmountA: '0',
            minAmountB: '0',
          }),
        ],
      });
      forget('liquidity-pool-increase');
    },
  },

  /**
   * Writes one account data entry. Errors when that name is already set.
   * Teardown deletes the entry.
   */
  'data-entry': {
    description: 'account1 sets data entry mm-fixture; teardown deletes it',
    async setup({ account1 }, { submit }) {
      requireAccount(account1, 'account1');
      const name = 'mm-fixture';
      const existing = account1.account.data_attr ?? {};
      if (Object.prototype.hasOwnProperty.call(existing, name)) {
        throw new Error(`account1 already has data entry ${name}`);
      }
      await submit({
        label: `account1 manageData ${name}`,
        signer: account1.keypair,
        operations: [
          Operation.manageData({
            name,
            value: '1',
          }),
        ],
      });
      remember('data-entry', { name });
    },
    async teardown({ account1 }, { submit }) {
      const { name } = recall('data-entry');
      await submit({
        label: `account1 delete data entry ${name}`,
        signer: account1.keypair,
        operations: [
          Operation.manageData({
            name,
            value: null,
          }),
        ],
      });
      forget('data-entry');
    },
  },
};

function secretFromEnv(index) {
  const value =
    process.env[`STELLAR_SECRET_${index}`] ??
    process.env[`STELLAR_PK_${index}`];
  if (!value) {
    throw new Error(
      `Missing STELLAR_SECRET_${index} (or STELLAR_PK_${index}) in env`,
    );
  }
  return value.trim();
}

function optionalSecret(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function isNotFound(error) {
  return error.response?.status === 404;
}

async function loadAccountIfExists(publicKey) {
  try {
    return await server.loadAccount(publicKey);
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function loadAccounts() {
  const kp1 = Keypair.fromSecret(secretFromEnv(1));
  const kp2 = Keypair.fromSecret(secretFromEnv(2));
  const sponsoredSecret = optionalSecret(
    'STELLAR_SECRET_SPONSORED',
    'STELLAR_PK_SPONSORED',
  );
  const sponsoredKeypair = sponsoredSecret
    ? Keypair.fromSecret(sponsoredSecret)
    : undefined;
  const [acc1, acc2, sponsored] = await Promise.all([
    server.loadAccount(kp1.publicKey()),
    loadAccountIfExists(kp2.publicKey()),
    sponsoredKeypair
      ? loadAccountIfExists(sponsoredKeypair.publicKey())
      : undefined,
  ]);
  return {
    account1: { keypair: kp1, account: acc1 },
    account2: { keypair: kp2, account: acc2 },
    ...(sponsoredKeypair
      ? { sponsoredAccount: { keypair: sponsoredKeypair, account: sponsored } }
      : {}),
  };
}

function formatBalances(account) {
  return account.balances
    .map((row) => {
      if (row.asset_type === 'native') {
        return `  XLM ${row.balance}`;
      }
      if (row.asset_type === 'liquidity_pool_shares') {
        return `  LP ${row.liquidity_pool_id} ${row.balance}`;
      }
      return `  ${row.asset_code}-${row.asset_issuer} ${row.balance} (limit ${
        row.limit
      }${row.sponsor ? `; sponsor ${row.sponsor}` : ''}${
        row.is_authorized === false ? '; unauthorized' : ''
      })`;
    })
    .join('\n');
}

async function printStatus(accounts) {
  for (const [name, { keypair, account }] of Object.entries(accounts)) {
    console.log(`\n${name} ${keypair.publicKey()}`);
    if (!account) {
      console.log('  (account does not exist)');
      continue;
    }
    console.log(formatBalances(account));
  }
}

function buildAndSign({ signer, signers = [], source, operations }) {
  const tx = new TransactionBuilder(source, {
    fee: String(BASE_FEE),
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  for (const op of operations) {
    tx.addOperation(op);
  }
  const built = tx.setTimeout(180).build();
  const seen = new Set();
  for (const key of [signer, ...signers]) {
    if (seen.has(key.publicKey())) {
      continue;
    }
    seen.add(key.publicKey());
    built.sign(key);
  }
  return built;
}

async function confirmMainnet(command, caseName, description) {
  if (SKIP_CONFIRM || DRY_RUN) {
    return;
  }
  console.log(
    `\nMAINNET ${command} ${caseName}: ${description}\nType "mainnet" to broadcast.`,
  );
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question('> ');
  rl.close();
  if (answer.trim() !== 'mainnet') {
    throw new Error('Aborted');
  }
}

/**
 * @param {PlannedTx} plan
 * @returns {Promise<SubmitResult>}
 */
async function submitPlan(plan) {
  const source = await server.loadAccount(plan.signer.publicKey());
  const inner = buildAndSign({ ...plan, source });
  const tx = plan.feeSource ? wrapFeeBump(inner, plan.feeSource) : inner;
  console.log(`\n${plan.label}`);
  console.log(`  source ${plan.signer.publicKey()}`);
  if (plan.feeSource) {
    console.log(`  fee    ${plan.feeSource.publicKey()} (fee-bump)`);
  }
  if (plan.signers?.length) {
    console.log(
      `  extra  ${plan.signers.map((key) => key.publicKey()).join(', ')}`,
    );
  }
  console.log(`  ops    ${plan.operations.length}`);
  console.log(`  hash   ${tx.hash().toString('hex')}`);
  console.log(`  xdr    ${tx.toXDR()}`);
  if (DRY_RUN) {
    console.log('  DRY_RUN: not submitted');
    return { hash: tx.hash().toString('hex') };
  }
  const result = await server.submitTransaction(tx);
  console.log(`  submitted ${result.hash}`);
  console.log(`  ${EXPLORER_TX}/${result.hash}`);
  return { hash: result.hash, raw: result };
}

/**
 * @param {import('@stellar/stellar-sdk').Transaction} inner
 * @param {import('@stellar/stellar-sdk').Keypair} feeSource
 * @returns {import('@stellar/stellar-sdk').FeeBumpTransaction}
 */
function wrapFeeBump(inner, feeSource) {
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    feeSource,
    String(BASE_FEE),
    inner,
    NETWORK_PASSPHRASE,
  );
  feeBump.sign(feeSource);
  return feeBump;
}

/**
 * @param {string} assetId - `stellar:<network>/asset:CODE-ISSUER` or `CODE-ISSUER`.
 * @returns {import('@stellar/stellar-sdk').Asset}
 */
function assetFromId(assetId) {
  const slash = assetId.lastIndexOf('/');
  let reference = slash === -1 ? assetId : assetId.slice(slash + 1);
  if (reference.startsWith('asset:')) {
    reference = reference.slice('asset:'.length);
  }
  const separator = reference.includes(':') ? ':' : '-';
  const splitAt = reference.indexOf(separator);
  const code = splitAt > 0 ? reference.slice(0, splitAt) : '';
  const issuer = splitAt > 0 ? reference.slice(splitAt + 1) : '';
  if (!code || code.length > 12 || !issuer.startsWith('G')) {
    throw new Error(
      `Invalid asset id "${assetId}". Use stellar:pubnet/asset:CODE-ISSUER or CODE-ISSUER`,
    );
  }
  return new Asset(code, issuer);
}

/**
 * @param {string} [assetId] - Omitted, `XLM`, slip44:148, or a classic asset id.
 * @returns {import('@stellar/stellar-sdk').Asset}
 */
function assetFromOptionalId(assetId) {
  if (
    assetId === undefined ||
    assetId === 'XLM' ||
    assetId === 'native' ||
    assetId === 'slip44:148' ||
    assetId.endsWith('/slip44:148')
  ) {
    return Asset.native();
  }
  return assetFromId(assetId);
}

/**
 * @param {Accounts} accounts
 * @param {string} address
 * @returns {AccountBinding}
 */
function bindingForAddress(accounts, address) {
  const binding = Object.values(accounts).find(
    (entry) => entry?.keypair.publicKey() === address,
  );
  if (!binding) {
    throw new Error(
      `No secret for ${address}. It must be STELLAR_SECRET_1, STELLAR_SECRET_2, or STELLAR_SECRET_SPONSORED.`,
    );
  }
  if (!binding.account) {
    throw new Error(`${address} is not on chain`);
  }
  return binding;
}

/**
 * Submits changeTrust limit 0. Does not move a remaining balance.
 *
 * @param {object} params
 * @param {Accounts} params.accounts
 * @param {string} params.accountAddress
 * @param {string} params.assetId
 */
async function removeTrustline({ accounts, accountAddress, assetId }) {
  const binding = bindingForAddress(accounts, accountAddress);
  const asset = assetFromId(assetId);
  const label = assetLabel(asset);
  const line = findTrustline(binding.account, asset);
  if (!line.exists) {
    console.log(
      `  ${accountAddress} has no ${label} trustline; nothing to remove`,
    );
    return;
  }
  if (Number(line.balance) > 0) {
    throw new Error(
      `${label} balance is ${line.balance}. Remove the trustline only when the balance is 0.`,
    );
  }

  await confirmMainnet(
    'remove-trustline',
    accountAddress,
    `changeTrust ${label} limit 0`,
  );
  await submitPlan({
    label: `${accountAddress}: remove ${label} trustline`,
    signer: binding.keypair,
    operations: [Operation.changeTrust({ asset, limit: '0' })],
  });
}

function getCase(name) {
  const testCase = CASES[name];
  if (!testCase) {
    throw new Error(
      `Unknown case "${name}". Known: ${Object.keys(CASES).join(', ')}`,
    );
  }
  return testCase;
}

function printCases() {
  for (const [id, testCase] of Object.entries(CASES)) {
    console.log(`${id}: ${testCase.description}`);
  }
}

async function main() {
  const [command, caseName] = process.argv.slice(2);

  if (!command || command === 'help' || command === '-h') {
    console.log(`Commands:
  list
  status
  setup <case>
  teardown <case>
  remove-trustline <account-address> <asset-id>`);
    printCases();
    return;
  }

  if (command === 'list') {
    printCases();
    return;
  }

  const accounts = await loadAccounts();

  if (command === 'status') {
    await printStatus(accounts);
    return;
  }

  if (command === 'remove-trustline') {
    const [accountAddress, assetId] = process.argv.slice(3);
    if (!accountAddress || !assetId) {
      throw new Error('Usage: remove-trustline <account-address> <asset-id>');
    }
    await removeTrustline({ accounts, accountAddress, assetId });
    return;
  }

  if (!caseName) {
    throw new Error(
      `Case name required. Known: ${Object.keys(CASES).join(', ')}`,
    );
  }

  const testCase = getCase(caseName);
  console.log(`${command} ${caseName}: ${testCase.description}`);
  await printStatus(accounts);
  await confirmMainnet(command, caseName, testCase.description);

  const helpers = { submit: submitPlan };
  if (command === 'setup') {
    await testCase.setup(accounts, helpers);
  } else if (command === 'teardown') {
    await testCase.teardown(accounts, helpers);
  } else {
    throw new Error(`Unknown command "${command}"`);
  }

  const after = await loadAccounts();
  console.log('\nAfter:');
  await printStatus(after);
}

main().catch((error) => {
  const extras = error.response?.data ?? error.data;
  if (extras) {
    console.error(JSON.stringify(extras, null, 2));
  }
  console.error(error.message ?? error);
  process.exitCode = 1;
});
