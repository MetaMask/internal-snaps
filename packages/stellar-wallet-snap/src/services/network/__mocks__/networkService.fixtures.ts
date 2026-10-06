import {
  Account,
  Contract,
  Horizon as StellarHorizon,
  Networks,
  nativeToScVal,
  rpc as StellarRpc,
  TransactionBuilder as StellarTransactionBuilder,
} from '@stellar/stellar-sdk';

import {
  buildMockClassicTransaction,
  buildMockInvokeHostFunctionTransaction,
} from '../../transaction/__mocks__/transaction.fixtures';
import { Transaction } from '../../transaction/Transaction';
import { generateStellarAddress } from '../../wallet/__mocks__/wallet.fixtures';

export const getHorizonClientSpies = (): {
  fetchBaseFeeSpy: jest.SpyInstance;
  loadAccountSpy: jest.SpyInstance;
} => ({
  fetchBaseFeeSpy: jest.spyOn(StellarHorizon.Server.prototype, 'fetchBaseFee'),
  loadAccountSpy: jest.spyOn(StellarHorizon.Server.prototype, 'loadAccount'),
});

export const getRpcServerSpies = (): {
  pollTransactionSpy: jest.SpyInstance;
  sendTransactionSpy: jest.SpyInstance;
  getAccountSpy: jest.SpyInstance;
  getAccountEntrySpy: jest.SpyInstance;
  getLedgerEntriesSpy: jest.SpyInstance;
  simulateTransactionSpy: jest.SpyInstance;
} => ({
  pollTransactionSpy: jest.spyOn(
    StellarRpc.Server.prototype,
    'pollTransaction',
  ),
  sendTransactionSpy: jest.spyOn(
    StellarRpc.Server.prototype,
    'sendTransaction',
  ),
  getAccountSpy: jest.spyOn(StellarRpc.Server.prototype, 'getAccount'),
  getAccountEntrySpy: jest.spyOn(
    StellarRpc.Server.prototype,
    'getAccountEntry',
  ),
  getLedgerEntriesSpy: jest.spyOn(
    StellarRpc.Server.prototype,
    'getLedgerEntries',
  ),
  simulateTransactionSpy: jest.spyOn(
    StellarRpc.Server.prototype,
    'simulateTransaction',
  ),
});

export const createMockTransaction = (accountId?: string): Transaction => {
  return buildMockClassicTransaction(
    [
      {
        type: 'payment',
        params: {
          destination: accountId ?? generateStellarAddress(),
          asset: 'native',
          amount: '1',
        },
      },
    ],
    {
      networkPassphrase: Networks.PUBLIC,
    },
  );
};

export const mockHorizonAccountTransactions = (
  call: jest.Mock,
): jest.SpyInstance => {
  return jest
    .spyOn(StellarHorizon.Server.prototype, 'transactions')
    .mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          cursor: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              includeFailed: jest.fn().mockReturnValue({ call }),
            }),
          }),
        }),
      }),
    } as never);
};

export const createMockInvokeHostFunctionTransaction = (
  accountId?: string,
): Transaction => {
  return buildMockInvokeHostFunctionTransaction('invokeHostFunction', [], {
    contractId: 'CASUP2OPFVEHCWGP2XLBXOV7DQIQIT42AQISG4MXAZGNLVFFN63X7WRT',
    source: {
      accountId: accountId ?? generateStellarAddress(),
      sequence: '1',
    },
  });
};

export const buildTransactionWithTwoInvokeHostFunctionOps = (): Transaction => {
  const source = 'GB5QOHJZ6RACA26NFDIEHD7I7SLROLC5P4NATSG43OJV2C5WUR4VEUKG';
  const stellarAccount = new Account(source, '1');
  const contract = new Contract(
    'CASUP2OPFVEHCWGP2XLBXOV7DQIQIT42AQISG4MXAZGNLVFFN63X7WRT',
  );
  const builder = new StellarTransactionBuilder(stellarAccount, {
    fee: '200',
    networkPassphrase: Networks.PUBLIC,
  });
  builder.addOperation(contract.call('fnA', nativeToScVal(1)));
  builder.addOperation(contract.call('fnB', nativeToScVal(2)));
  return new Transaction(builder.setTimeout(60).build());
};

type MockAccountEntry = {
  numSubEntries: () => number;
  seqNum: () => { toString: () => string };
  balance: () => { toString: () => string };
  ext: () => {
    switch: () => number;
    v1: () => {
      ext: () => {
        switch: () => number;
        v2: () => {
          numSponsoring: () => number;
          numSponsored: () => number;
        };
      };
    };
  };
};

export const createMockAccountEntry = ({
  numSubEntries = 4,
  sequenceNumber = '262764252333343491',
  rawNativeBalance = '351010623',
  numSponsoring = 1,
  numSponsored = 0,
  accountExtSwitch = 1,
  v1ExtSwitch = 2,
}: {
  numSubEntries?: number;
  sequenceNumber?: string;
  rawNativeBalance?: string;
  numSponsoring?: number;
  numSponsored?: number;
  accountExtSwitch?: number;
  v1ExtSwitch?: number;
} = {}): MockAccountEntry => ({
  numSubEntries: () => numSubEntries,
  seqNum: () => ({
    toString: () => sequenceNumber,
  }),
  balance: () => ({
    toString: () => rawNativeBalance,
  }),
  ext: () => ({
    switch: () => accountExtSwitch,
    v1: () => ({
      ext: () => ({
        switch: () => v1ExtSwitch,
        v2: () => ({
          numSponsoring: () => numSponsoring,
          numSponsored: () => numSponsored,
        }),
      }),
    }),
  }),
});
