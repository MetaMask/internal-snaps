import { BigNumber } from 'bignumber.js';
import type { MPTokenAuthorize, Payment } from 'xrpl';
import { MPTokenAuthorizeFlags } from 'xrpl';

import { KnownCaip2ChainId } from '../../../api';
import { toCaip19IouAssetId, toCaip19MptAssetId } from '../../../utils';
import {
  InsufficientBalanceToCoverBaseReserveException,
  MptHoldingNotFoundException,
  RemoveMptWithNonZeroBalanceException,
  RequiresDestinationTagException,
  TransactionValidationException,
  TrustlineExceedLimitException,
  TrustlineFrozenException,
  TrustlineNotFoundException,
} from '../exceptions';
import type { AccountState, SimulationContext } from './api';
import { MPTokenAuthorizeSimulator, PaymentSimulator } from './simulators';

const holder = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const issuer = 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY';
const assetId = toCaip19IouAssetId(KnownCaip2ChainId.Mainnet, 'USD', issuer);
const mptIssuanceId = '05FAA0DF561E39FA605779B829BB5974E82B40AF173D6AF3';
const mptAssetId = toCaip19MptAssetId(KnownCaip2ChainId.Mainnet, mptIssuanceId);

function account(
  balance: string,
  freeze = false,
  globalFreeze = false,
): AccountState {
  return {
    nativeRawBalance: new BigNumber('10000000'),
    ownerCount: 1,
    sponsoringAccountCount: 0,
    sponsoringOwnerCount: 0,
    sponsoredOwnerCount: 0,
    paysOwnBaseReserve: true,
    requireDestTag: false,
    globalFreeze,
    trustlines: new Map([
      [
        assetId,
        {
          balance: new BigNumber(balance),
          limit: new BigNumber('100'),
          peerAuthorized: true,
          freeze,
        },
      ],
    ]),
    mptokens: new Map(),
  };
}

function context(
  issuerLines = false,
  holderFreeze = false,
  issuerGlobalFreeze = false,
): SimulationContext {
  const issuerAccount = account('0', false, issuerGlobalFreeze);
  if (!issuerLines) {
    issuerAccount.trustlines = new Map();
  }
  return {
    scope: KnownCaip2ChainId.Mainnet,
    state: {
      accounts: new Map([
        [holder, account('5', holderFreeze)],
        [issuer, issuerAccount],
      ]),
    },
  };
}

function redeem(): Payment {
  return {
    TransactionType: 'Payment',
    Account: holder,
    Destination: issuer,
    Amount: { currency: 'USD', issuer, value: '1.5' },
    Fee: '12',
    Sequence: 1,
  };
}

describe('PaymentSimulator IOU', () => {
  const simulator = new PaymentSimulator();

  it('redeems a balance to the issuer without a trust line on the issuer', () => {
    const ctx = context();

    expect(() => simulator.validate(ctx, redeem())).not.toThrow();
    simulator.apply(ctx, redeem());

    const balance = ctx.state.accounts
      .get(holder)
      ?.trustlines.get(assetId)?.balance;
    expect(balance?.toString()).toStrictEqual('3.5');
  });

  it('still requires the holder trust line when paying the issuer', () => {
    const ctx = context();
    ctx.state.accounts.get(holder)?.trustlines.clear();

    expect(() => simulator.validate(ctx, redeem())).toThrow(
      TrustlineNotFoundException,
    );
  });

  it('rejects a payment between holders when the issuer has a global freeze', () => {
    const peer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const ctx = context(true, false, true);
    ctx.state.accounts.set(peer, account('0'));
    const payment: Payment = {
      ...redeem(),
      Destination: peer,
    };

    expect(() => simulator.validate(ctx, payment)).toThrow(
      TrustlineFrozenException,
    );
  });

  it('rejects holder-to-holder payments when the issuer was not preloaded', () => {
    const peer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const ctx = context(true);
    ctx.state.accounts.delete(issuer);
    ctx.state.accounts.set(peer, account('0'));
    const payment: Payment = {
      ...redeem(),
      Destination: peer,
    };

    expect(() => simulator.validate(ctx, payment)).toThrow(
      TransactionValidationException,
    );
  });

  it('allows a redeem to the issuer during a global freeze', () => {
    const ctx = context(false, false, true);

    expect(() => simulator.validate(ctx, redeem())).not.toThrow();
  });

  it('rejects a payment when the holder froze the trust line', () => {
    const ctx = context(false, true);

    expect(() => simulator.validate(ctx, redeem())).toThrow(
      TrustlineFrozenException,
    );
  });

  it('allows a direct payment when both lines have No Ripple set', () => {
    const peer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const ctx = context(true);
    ctx.state.accounts.set(peer, account('0'));
    const payment: Payment = {
      ...redeem(),
      Destination: peer,
    };

    expect(() => simulator.validate(ctx, payment)).not.toThrow();
  });

  it('skips destination-tag checks when RequiresDestinationTagException is listed', () => {
    const peer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const ctx = context(true);
    const peerState = account('0');
    peerState.requireDestTag = true;
    ctx.state.accounts.set(peer, peerState);
    ctx.skipExceptions = [RequiresDestinationTagException];
    const payment: Payment = {
      ...redeem(),
      Destination: peer,
      Amount: { currency: 'USD', issuer, value: '1' },
    };

    expect(() => simulator.validate(ctx, payment)).not.toThrow();
  });

  it('skips trust-line limit checks when TrustlineExceedLimitException is listed', () => {
    const peer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const ctx = context(true);
    ctx.state.accounts.set(peer, account('99'));
    ctx.skipExceptions = [TrustlineExceedLimitException];
    const payment: Payment = {
      ...redeem(),
      Destination: peer,
      Amount: { currency: 'USD', issuer, value: '5' },
    };

    expect(() => simulator.validate(ctx, payment)).not.toThrow();
  });

  it('still throws destination-tag errors when skipExceptions does not include them', () => {
    const peer = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const ctx = context(true);
    const peerState = account('0');
    peerState.requireDestTag = true;
    ctx.state.accounts.set(peer, peerState);
    ctx.skipExceptions = [TrustlineExceedLimitException];
    const payment: Payment = {
      ...redeem(),
      Destination: peer,
      Amount: { currency: 'USD', issuer, value: '1' },
    };

    expect(() => simulator.validate(ctx, payment)).toThrow(
      RequiresDestinationTagException,
    );
  });
});

describe('MPTokenAuthorizeSimulator', () => {
  const simulator = new MPTokenAuthorizeSimulator();

  function mptContext(withHolding = false, balance = '0'): SimulationContext {
    const holderState = account('0');
    holderState.trustlines = new Map();
    holderState.ownerCount = withHolding ? 1 : 0;
    if (withHolding) {
      holderState.mptokens.set(mptAssetId, {
        balance: new BigNumber(balance),
        mptAmount: new BigNumber(balance),
        lockedAmount: new BigNumber(0),
        mptAuthorized: true,
      });
    }
    return {
      scope: KnownCaip2ChainId.Mainnet,
      state: {
        accounts: new Map([[holder, holderState]]),
      },
    };
  }

  function authorizeTx(unauthorize = false): MPTokenAuthorize {
    return {
      TransactionType: 'MPTokenAuthorize',
      Account: holder,
      MPTokenIssuanceID: mptIssuanceId,
      Fee: '12',
      Sequence: 1,
      ...(unauthorize ? { Flags: MPTokenAuthorizeFlags.tfMPTUnauthorize } : {}),
    };
  }

  it('creates an MPT holding and locks an owner reserve on authorize', () => {
    const ctx = mptContext(false);

    expect(() => simulator.validate(ctx, authorizeTx())).not.toThrow();
    simulator.apply(ctx, authorizeTx());

    const holderState = ctx.state.accounts.get(holder);
    expect(holderState?.mptokens.has(mptAssetId)).toBe(true);
    expect(holderState?.ownerCount).toStrictEqual(1);
  });

  it('is a no-op apply when the holding already exists', () => {
    const ctx = mptContext(true);
    const before = ctx.state.accounts.get(holder)?.ownerCount;

    expect(() => simulator.validate(ctx, authorizeTx())).not.toThrow();
    simulator.apply(ctx, authorizeTx());

    expect(ctx.state.accounts.get(holder)?.ownerCount).toStrictEqual(before);
  });

  it('rejects authorize when spendable XRP cannot cover the owner reserve', () => {
    const ctx = mptContext(false);
    const holderState = ctx.state.accounts.get(holder);
    if (holderState) {
      holderState.nativeRawBalance = new BigNumber('1000000');
      holderState.ownerCount = 0;
    }

    expect(() => simulator.validate(ctx, authorizeTx())).toThrow(
      InsufficientBalanceToCoverBaseReserveException,
    );
  });

  it('removes a zero-balance holding on unauthorize', () => {
    const ctx = mptContext(true, '0');

    expect(() => simulator.validate(ctx, authorizeTx(true))).not.toThrow();
    simulator.apply(ctx, authorizeTx(true));

    expect(ctx.state.accounts.get(holder)?.mptokens.has(mptAssetId)).toBe(
      false,
    );
    expect(ctx.state.accounts.get(holder)?.ownerCount).toStrictEqual(0);
  });

  it('rejects unauthorize when the holding is missing', () => {
    const ctx = mptContext(false);

    expect(() => simulator.validate(ctx, authorizeTx(true))).toThrow(
      MptHoldingNotFoundException,
    );
  });

  it('rejects unauthorize when the holding has a non-zero balance', () => {
    const ctx = mptContext(true, '5');

    expect(() => simulator.validate(ctx, authorizeTx(true))).toThrow(
      RemoveMptWithNonZeroBalanceException,
    );
  });
});
