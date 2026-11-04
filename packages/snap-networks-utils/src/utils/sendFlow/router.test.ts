import type { JsonRpcRequest } from '@metamask/snaps-sdk';
import { InvalidParamsError, MethodNotFoundError } from '@metamask/snaps-sdk';
import { object, string } from '@metamask/superstruct';

import { SendFlowRequestRouter, isSendFlowMethod } from './router';
import { createSendFlowStructs } from './structs';
import { SendFlowErrorCodes, SendFlowMethod } from './types';

const ACCOUNT_ID = '0e6a1f4a-6f6c-4a1e-9f3d-1a2b3c4d5e6f';
const ADDRESS = 'address';
const ASSET_ID = 'tron:728126428/slip44:195';

const structs = createSendFlowStructs({
  address: string(),
  overrides: {
    ComputeFeeParams: object({
      transaction: string(),
      accountId: string(),
      scope: string(),
    }),
    OnAmountInputParams: object({
      accountId: string(),
      assetId: string(),
      value: string(),
    }),
    ConfirmSendParams: object({
      fromAccountId: string(),
      toAddress: string(),
      amount: string(),
      assetId: string(),
    }),
  },
});

function request(params: Record<string, unknown>): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: SendFlowMethod.OnAmountInput,
    params,
  } as JsonRpcRequest;
}

describe('SendFlowRequestRouter', () => {
  describe('isSendFlowMethod', () => {
    it.each(Object.values(SendFlowMethod))('accepts %s', (method) => {
      expect(isSendFlowMethod(method)).toBe(true);
    });

    it('rejects other methods', () => {
      expect(isSendFlowMethod('signAndSendTransaction')).toBe(false);
    });
  });

  describe('handle', () => {
    it('returns undefined for methods outside the unified send flow', async () => {
      const router = new SendFlowRequestRouter({
        structs,
        handlers: {},
      });

      expect(
        await router.handle({
          ...request({}),
          method: 'signAndSendTransaction',
        }),
      ).toBeUndefined();
    });

    it('dispatches onAddressInput with validated params', async () => {
      const handler = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
      });
      const router = new SendFlowRequestRouter({
        structs,
        handlers: { onAddressInput: handler },
      });

      const result = await router.handle({
        ...request({ value: ADDRESS }),
        method: SendFlowMethod.OnAddressInput,
      });

      expect(result).toStrictEqual({ valid: true, errors: [] });
      expect(handler).toHaveBeenCalledWith(
        { value: ADDRESS },
        expect.objectContaining({ method: SendFlowMethod.OnAddressInput }),
      );
    });

    it('dispatches onAmountInput and validates its response', async () => {
      const handler = jest.fn().mockResolvedValue({
        valid: false,
        errors: [{ code: SendFlowErrorCodes.InsufficientBalance }],
      });
      const router = new SendFlowRequestRouter({
        structs,
        handlers: { onAmountInput: handler },
      });

      expect(
        await router.handle(
          request({
            accountId: ACCOUNT_ID,
            assetId: ASSET_ID,
            value: '1',
          }),
        ),
      ).toStrictEqual({
        valid: false,
        errors: [{ code: SendFlowErrorCodes.InsufficientBalance }],
      });
      expect(handler).toHaveBeenCalledWith(
        { accountId: ACCOUNT_ID, assetId: ASSET_ID, value: '1' },
        expect.any(Object),
      );
    });

    it('rejects invalid responses', async () => {
      const router = new SendFlowRequestRouter({
        structs,
        handlers: {
          onAmountInput: jest.fn().mockResolvedValue({ valid: 'yes' }),
        },
      });

      await expect(
        router.handle(
          request({
            accountId: ACCOUNT_ID,
            assetId: ASSET_ID,
            value: '1',
          }),
        ),
      ).rejects.toThrow('Expected');
    });

    it('dispatches getMaxSendableAmount and validates its response', async () => {
      const handler = jest.fn().mockResolvedValue({ amount: '1.5' });
      const router = new SendFlowRequestRouter({
        structs,
        handlers: { getMaxSendableAmount: handler },
      });

      expect(
        await router.handle({
          ...request({ accountId: ACCOUNT_ID, assetId: ASSET_ID }),
          method: SendFlowMethod.GetMaxSendableAmount,
        }),
      ).toStrictEqual({ amount: '1.5' });
    });

    it('dispatches confirmSend and computeFee without reshaping them', async () => {
      const confirmSend = jest.fn().mockResolvedValue({ transactionId: 'tx' });
      const computeFee = jest.fn().mockResolvedValue([]);
      const router = new SendFlowRequestRouter({
        structs,
        handlers: { confirmSend, computeFee },
      });

      expect(
        await router.handle({
          ...request({
            fromAccountId: ACCOUNT_ID,
            toAddress: ADDRESS,
            amount: '1',
            assetId: ASSET_ID,
          }),
          method: SendFlowMethod.ConfirmSend,
        }),
      ).toStrictEqual({ transactionId: 'tx' });

      expect(
        await router.handle({
          ...request({
            transaction: 'aGVsbG8=',
            accountId: ACCOUNT_ID,
            scope: 'tron:728126428',
          }),
          method: SendFlowMethod.ComputeFee,
        }),
      ).toStrictEqual([]);
    });

    it('returns null when confirmSend or computeFee handlers return nothing', async () => {
      const router = new SendFlowRequestRouter({
        structs,
        handlers: {
          confirmSend: jest.fn().mockResolvedValue(undefined),
          computeFee: jest.fn().mockResolvedValue(undefined),
        },
      });

      expect(
        await router.handle({
          ...request({
            fromAccountId: ACCOUNT_ID,
            toAddress: ADDRESS,
            amount: '1',
            assetId: ASSET_ID,
          }),
          method: SendFlowMethod.ConfirmSend,
        }),
      ).toBeNull();

      expect(
        await router.handle({
          ...request({
            transaction: 'aGVsbG8=',
            accountId: ACCOUNT_ID,
            scope: 'tron:728126428',
          }),
          method: SendFlowMethod.ComputeFee,
        }),
      ).toBeNull();
    });

    it('throws MethodNotFoundError for unsupported send flow methods', async () => {
      const router = new SendFlowRequestRouter({
        structs,
        handlers: {},
      });

      await expect(
        router.handle(
          request({
            accountId: ACCOUNT_ID,
            assetId: ASSET_ID,
            value: '1',
          }),
        ),
      ).rejects.toThrow(MethodNotFoundError);
    });

    it('uses the provided invalid params error factory', async () => {
      const customError = new Error('custom validation error');
      const router = new SendFlowRequestRouter({
        structs,
        handlers: { onAmountInput: jest.fn() },
        createInvalidParamsError: (): Error => customError,
      });

      await expect(
        router.handle(request({ accountId: ACCOUNT_ID })),
      ).rejects.toBe(customError);
    });

    it('throws InvalidParamsError for invalid params', async () => {
      const router = new SendFlowRequestRouter({
        structs,
        handlers: { onAmountInput: jest.fn() },
      });

      await expect(
        router.handle(request({ accountId: ACCOUNT_ID })),
      ).rejects.toThrow(InvalidParamsError);
    });
  });
});
