import type { Transaction } from '@metamask/keyring-api';
import {
  TransactionStatus,
  TransactionType,
  TrxAccountType,
} from '@metamask/keyring-api';

import { isSpam } from './isSpam';
import { Network, Networks } from '../../../constants';
import type { TronKeyringAccount } from '../../../entities/keyring-account';

describe('isSpam', () => {
  const account: TronKeyringAccount = {
    id: 'account-id',
    address: 'TGJn1wnUYHJbvN88cynZbsAz2EMeZq73yx',
    type: TrxAccountType.Eoa,
    options: {},
    methods: [],
    scopes: [Network.Mainnet],
    entropySource: 'test-entropy',
    derivationPath: 'm/0/0',
    index: 0,
  };

  const nativeAsset = (amount: string): Transaction['to'][number]['asset'] => ({
    type: Networks[Network.Mainnet].nativeToken.id,
    amount,
    unit: Networks[Network.Mainnet].nativeToken.symbol,
    fungible: true,
  });

  const trc10Asset = (amount: string): Transaction['to'][number]['asset'] => ({
    type: `${Network.Mainnet}/trc10:1005119`,
    amount,
    unit: 'BTT',
    fungible: true,
  });

  const trc20Asset = (amount: string): Transaction['to'][number]['asset'] => ({
    type: `${Network.Mainnet}/trc20:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,
    amount,
    unit: 'USDT',
    fungible: true,
  });

  const stakedForBandwidthAsset = (
    amount: string,
  ): Transaction['to'][number]['asset'] => ({
    type: Networks[Network.Mainnet].stakedForBandwidth.id,
    amount,
    unit: Networks[Network.Mainnet].stakedForBandwidth.symbol,
    fungible: true,
  });

  const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 'tx-id',
    type: TransactionType.Receive,
    account: account.id,
    chain: Network.Mainnet,
    status: TransactionStatus.Confirmed,
    timestamp: 1,
    from: [
      {
        address: 'sender-address',
        asset: nativeAsset('0.0005'),
      },
    ],
    to: [
      {
        address: account.address,
        asset: nativeAsset('0.0005'),
      },
    ],
    events: [],
    fees: [],
    ...overrides,
  });

  describe('Spam transactions', () => {
    it('received native TRX amounts under 0.001 - for any transaction status', () => {
      expect(isSpam(transaction(), account)).toBe(true);

      expect(
        isSpam(
          transaction({
            status: TransactionStatus.Failed,
          }),
          account,
        ),
      ).toBe(true);
    });
  });

  describe('Non-spam transactions', () => {
    it('received native TRX amounts equal to 0.001 - for any transaction status', () => {
      expect(
        isSpam(
          transaction({
            to: [{ address: account.address, asset: nativeAsset('0.001') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            status: TransactionStatus.Failed,
            to: [{ address: account.address, asset: nativeAsset('0.001') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it('received native TRX amounts above 0.001 - for any transaction status', () => {
      expect(
        isSpam(
          transaction({
            to: [{ address: account.address, asset: nativeAsset('0.0011') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            status: TransactionStatus.Failed,
            to: [{ address: account.address, asset: nativeAsset('0.0011') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it('received native TRX amounts summed to 0.001 - for any transaction status', () => {
      expect(
        isSpam(
          transaction({
            to: [
              { address: account.address, asset: nativeAsset('0.0004') },
              { address: account.address, asset: nativeAsset('0.0006') },
            ],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            status: TransactionStatus.Failed,
            to: [
              { address: account.address, asset: nativeAsset('0.0004') },
              { address: account.address, asset: nativeAsset('0.0006') },
            ],
          }),
          account,
        ),
      ).toBe(false);
    });

    it('received TRC10 amounts below threshold - for any transaction status', () => {
      expect(
        isSpam(
          transaction({
            to: [{ address: account.address, asset: trc10Asset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            status: TransactionStatus.Failed,
            to: [{ address: account.address, asset: trc10Asset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it('received TRC20 amounts below threshold - for any transaction status', () => {
      expect(
        isSpam(
          transaction({
            to: [{ address: account.address, asset: trc20Asset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
      expect(
        isSpam(
          transaction({
            status: TransactionStatus.Failed,
            to: [{ address: account.address, asset: trc20Asset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'Send' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.Send,
            from: [{ address: account.address, asset: nativeAsset('0.0005') }],
            to: [
              { address: 'recipient-address', asset: nativeAsset('0.0005') },
            ],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            type: TransactionType.Send,
            status: TransactionStatus.Failed,
            from: [{ address: account.address, asset: nativeAsset('0.0005') }],
            to: [
              { address: 'recipient-address', asset: nativeAsset('0.0005') },
            ],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'BridgeSend' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.BridgeSend,
            from: [{ address: account.address, asset: nativeAsset('0.0005') }],
            to: [{ address: 'bridge-address', asset: nativeAsset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            type: TransactionType.BridgeSend,
            status: TransactionStatus.Failed,
            from: [{ address: account.address, asset: nativeAsset('0.0005') }],
            to: [{ address: 'bridge-address', asset: nativeAsset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'BridgeReceive' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.BridgeReceive,
            to: [{ address: account.address, asset: nativeAsset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            type: TransactionType.BridgeReceive,
            status: TransactionStatus.Failed,
            to: [{ address: account.address, asset: nativeAsset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'StakingDeposit' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.StakeDeposit,
            from: [{ address: account.address, asset: nativeAsset('0.0005') }],
            to: [
              {
                address: account.address,
                asset: stakedForBandwidthAsset('0.0005'),
              },
            ],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            type: TransactionType.StakeDeposit,
            status: TransactionStatus.Failed,
            from: [{ address: account.address, asset: nativeAsset('0.0005') }],
            to: [
              {
                address: account.address,
                asset: stakedForBandwidthAsset('0.0005'),
              },
            ],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'StakingWithdrawal' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.StakeWithdraw,
            to: [{ address: account.address, asset: nativeAsset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            type: TransactionType.StakeWithdraw,
            status: TransactionStatus.Failed,
            from: [
              {
                address: account.address,
                asset: stakedForBandwidthAsset('0.0005'),
              },
            ],
            to: [{ address: account.address, asset: nativeAsset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'Swap' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.Swap,
            to: [{ address: account.address, asset: trc20Asset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);

      expect(
        isSpam(
          transaction({
            type: TransactionType.Swap,
            status: TransactionStatus.Failed,
            to: [{ address: account.address, asset: trc20Asset('0.0005') }],
          }),
          account,
        ),
      ).toBe(false);
    });

    it("any 'Unknown' transaction", () => {
      expect(
        isSpam(
          transaction({
            type: TransactionType.Unknown,
            status: TransactionStatus.Failed,
            from: [],
            to: [],
          }),
          account,
        ),
      ).toBe(false);
    });
  });
});
