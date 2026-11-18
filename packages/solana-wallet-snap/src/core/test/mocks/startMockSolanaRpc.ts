import type { Json } from '@metamask/utils';
import { hasProperty } from '@metamask/utils';
import express from 'express';
import type { Request, Response } from 'express';

import logger from '../../utils/logger';
import { Stack } from '../../utils/stack';

/**
 * The HTTP server returned by `express.Application.listen`.
 */
type HttpServer = ReturnType<express.Application['listen']>;

export type MockedResolvedResult = {
  method: string;
  result: Json;
};

export type MockedRejectedError = {
  method: string;
  error: {
    code: number;
    message: string;
  };
};

// Add new types for implementation functions
export type MockImplementationFn = (
  params: Json | undefined,
) => Json | Promise<Json>;

export type MockSolanaRpc = {
  mockResolvedResult: (mock: MockedResolvedResult) => void;
  mockResolvedResultOnce: (mock: MockedResolvedResult) => void;
  mockRejectedError: (mock: MockedRejectedError) => void;
  mockRejectedErrorOnce: (mock: MockedRejectedError) => void;
  mockImplementation: (
    method: string,
    implementation: MockImplementationFn,
  ) => void;
  mockImplementationOnce: (
    method: string,
    implementation: MockImplementationFn,
  ) => void;
  shutdown: () => void;
  server: express.Application | null;
};

/**
 * Shape of the JSON-RPC request body sent to the mock server.
 */
type MockRpcRequestBody = {
  method: string;
  params?: Json;
  id?: string | number;
};

// Singleton server instance
const FIXED_PORT = 8899;
let app: express.Application | null = null;
let server: HttpServer;

/**
 * The entries that can be stored on a mock stack for a single RPC method.
 */
type MockStackEntry =
  | Omit<MockedResolvedResult, 'method'>
  | Omit<MockedRejectedError, 'method'>
  | { implementation: MockImplementationFn };

/**
 * Narrows a mock stack entry to a mocked error entry.
 *
 * @param mock - The mock stack entry to check.
 * @returns Whether the entry is a mocked error.
 */
const isRejectedErrorMock = (
  mock: MockStackEntry,
): mock is Omit<MockedRejectedError, 'method'> => hasProperty(mock, 'error');

/**
 * Narrows a mock stack entry to an implementation entry.
 *
 * @param mock - The mock stack entry to check.
 * @returns Whether the entry holds an implementation function.
 */
const isImplementationMock = (
  mock: MockStackEntry,
): mock is { implementation: MockImplementationFn } =>
  hasProperty(mock, 'implementation');

/**
 * We store mocks in a Map where the key is the method name and the value is a
 * Stack of responses.
 *
 * The stack is a convenient data structure that allows us to mimick the
 * "Jest style syntax" with `mockResolvedResponseOnce` and `mockResolvedResponse`.
 *
 * Every call to `mockResolvedResponseOnce` adds an item to the stack.
 * Every call to `mockResolvedResponse` adds a NON DESTACKABLE item to the stack.
 *
 * Every time the mock responds, if the item is destackable, it is removed from
 * the stack. If the item is not destackable, it is returned without removing it
 * from the stack.
 */
const mocks = new Map<string, Stack<MockStackEntry>>();

/**
 * Singleton express app: creates it if it does not exist, otherwise returns
 * the existing one.
 */
const createAppIfNotExists = (): void => {
  if (!app) {
    app = express();
    app.use(express.json());

    app.post('/', async (req: Request, res: Response): Promise<void> => {
      const { method, params, id: requestId } = req.body as MockRpcRequestBody;
      const id = requestId ?? '0';

      const mockStack = mocks.get(method);
      if (!mockStack) {
        res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'No mock registered for this method',
          },
        });
        return;
      }

      const mock = mockStack.pop();
      if (!mock) {
        res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'No mock registered for this method',
          },
        });
        return;
      }

      if (isRejectedErrorMock(mock)) {
        res.status(400).json({
          jsonrpc: '2.0',
          id,
          error: mock.error,
        });
        return;
      }

      if (isImplementationMock(mock)) {
        try {
          console.log(
            'Calling implementation with params:',
            JSON.stringify(params, null, 2),
          );
          const result = await mock.implementation(params);
          res.json({
            jsonrpc: '2.0',
            id,
            result,
          });
          return;
        } catch (error) {
          res.status(400).json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message:
                error instanceof Error ? error.message : 'Implementation error',
            },
          });
          return;
        }
      }

      res.json({
        jsonrpc: '2.0',
        id,
        result: mock.result,
      });
    });

    server = app.listen(FIXED_PORT);
    logger.info(`Mock Solana RPC listening on port ${FIXED_PORT}`);
  }
};

/**
 * Starts a mock Solana RPC server on local port 8899, and returns utility
 * methods to mock Solana RPC responses and errors.
 *
 * @returns An object with utility methods to mock Solana RPC responses and errors.
 * @example
 * ```ts
 * const { mockResolvedResult, mockRejectedError, shutdown } = startMockSolanaRpc();
 *
 * // Mock a resolved result once
 * mockResolvedResultOnce({ method: 'getBalance', result: { balance: 1000 } });
 * mockResolvedResultOnce({ method: 'getBalance', result: { balance: 2000 } });
 *
 * // Mock a rejected error
 * mockRejectedError({ method: 'sendTransaction', error: { code: -32000, message: 'Insufficient funds' } });
 * ```
 */
export const startMockSolanaRpc = (): MockSolanaRpc => {
  createAppIfNotExists();

  const mockResolvedResult = ({
    method,
    result,
  }: MockedResolvedResult): void => {
    const stack = mocks.get(method) ?? new Stack();
    stack.push({ result }, false); // Non destackable
    mocks.set(method, stack);
  };

  const mockResolvedResultOnce = ({
    method,
    result,
  }: MockedResolvedResult): void => {
    const stack = mocks.get(method) ?? new Stack();
    stack.push({ result }, true); // Destackable
    mocks.set(method, stack);
  };

  const mockRejectedError = ({ method, error }: MockedRejectedError): void => {
    const stack = mocks.get(method) ?? new Stack();
    stack.push({ error }, false); // Non destackable
    mocks.set(method, stack);
  };

  const mockRejectedErrorOnce = ({
    method,
    error,
  }: MockedRejectedError): void => {
    const stack = mocks.get(method) ?? new Stack();
    stack.push({ error }, true); // Destackable
    mocks.set(method, stack);
  };

  const mockImplementation = (
    method: string,
    implementation: MockImplementationFn,
  ): void => {
    const stack = mocks.get(method) ?? new Stack();
    stack.push({ implementation }, false); // Non destackable
    mocks.set(method, stack);
  };

  const mockImplementationOnce = (
    method: string,
    implementation: MockImplementationFn,
  ): void => {
    const stack = mocks.get(method) ?? new Stack();
    stack.push({ implementation }, true); // Destackable
    mocks.set(method, stack);
  };

  const shutdown = (): void => {
    server.close();
  };

  return {
    mockResolvedResult,
    mockResolvedResultOnce,
    mockRejectedError,
    mockRejectedErrorOnce,
    mockImplementation,
    mockImplementationOnce,
    shutdown,
    server: app,
  };
};
