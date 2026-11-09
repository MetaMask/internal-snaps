import { InMemoryState } from '@metamask/snap-networks-utils';
import type {
  AnalyticsService,
  IStateManager,
} from '@metamask/snap-networks-utils';

import type { WebSocketConnection } from '../../../entities';
import { EventEmitter } from '../../../infrastructure';
import { Network } from '../../constants/solana';
import * as Errors from '../../utils/errors';
import { trackError } from '../../utils/errors';
import { mockLogger } from '../__mocks__/logger';
import type { ConfigProvider } from '../config';
import type { NetworkConfig } from '../config/ConfigProvider';
import { DEFAULT_UNENCRYPTED_STATE } from '../state/stateTypes';
import type { UnencryptedStateValue } from '../state/stateTypes';
import type { WebSocketConnectionRepository } from './WebSocketConnectionRepository';
import { WebSocketConnectionService } from './WebSocketConnectionService';

const mockWebSocketUrl = 'wss://some-mock-url.com/ws/v3/some-id';
const mockConnectionId = 'mock-connection-id';

const createMockWebSocketConnection = (
  id = mockConnectionId,
  url = mockWebSocketUrl,
  network: Network = Network.Mainnet,
): WebSocketConnection => ({
  id,
  url,
  protocols: [],
  network,
});

describe('WebSocketConnectionService', () => {
  let service: WebSocketConnectionService;
  let mockWebSocketConnectionRepository: WebSocketConnectionRepository;
  let mockAnalyticsService: AnalyticsService;
  let mockConfigProvider: ConfigProvider;
  let mockState: IStateManager<UnencryptedStateValue>;
  let mockEventEmitter: EventEmitter;

  const mockNetworksConfig = [
    {
      caip2Id: Network.Mainnet,
      webSocketUrl: mockWebSocketUrl,
    },
    {
      caip2Id: Network.Devnet,
      webSocketUrl: 'wss://some-mock-url2.com/ws/v3/some-id',
    },
    {
      caip2Id: Network.Testnet,
      webSocketUrl: 'wss://some-mock-url3.com/ws/v3/some-id',
    },
    {
      caip2Id: Network.Localnet,
      webSocketUrl: 'wss://some-mock-url4.com/ws/v3/some-id',
    },
  ] as NetworkConfig[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Errors, 'trackError').mockResolvedValue('tracked-error-id');

    (globalThis as any).snap = {
      request: vi.fn(),
    };

    mockWebSocketConnectionRepository = {
      getAll: vi.fn(),
      getById: vi.fn(),
      findByNetwork: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    } as unknown as WebSocketConnectionRepository;

    mockAnalyticsService = {
      trackWebSocketConnectionClosedNotCleanly: vi.fn(),
    } as unknown as AnalyticsService;

    mockConfigProvider = {
      config: {
        networks: mockNetworksConfig,
        subscriptions: {
          maxReconnectAttempts: 5,
          reconnectDelayMilliseconds: 1, // To speed up the tests
          closeConnectionsGracePeriodMilliseconds: 5000, // 5 seconds for testing
        },
      },
      getActiveNetworks: vi
        .fn()
        .mockResolvedValue([Network.Mainnet, Network.Devnet]),
      getNetworkBy: vi.fn().mockImplementation((key, value) => {
        return mockNetworksConfig.find(
          (item) => item[key as keyof NetworkConfig] === value,
        );
      }),
    } as unknown as ConfigProvider;

    mockState = new InMemoryState(DEFAULT_UNENCRYPTED_STATE);

    mockEventEmitter = new EventEmitter(mockLogger);

    service = new WebSocketConnectionService(
      mockWebSocketConnectionRepository,
      mockAnalyticsService,
      mockConfigProvider,
      mockState,
      mockEventEmitter,
      mockLogger,
    );
  });

  describe('#setupConnections', () => {
    it('opens the connections for all active networks when the client is active', async () => {
      vi.spyOn(mockConfigProvider, 'getActiveNetworks').mockResolvedValue([
        Network.Mainnet,
        Network.Devnet,
      ]);

      vi.spyOn(snap, 'request').mockResolvedValueOnce({
        active: true,
      });

      // Simulate a client start event
      await mockEventEmitter.emitSync('onStart');

      expect(mockWebSocketConnectionRepository.save).toHaveBeenCalledTimes(2);
    });

    it('closes the connections for all active networks when the client is inactive', async () => {
      vi.spyOn(mockConfigProvider, 'getActiveNetworks').mockResolvedValue([
        Network.Mainnet,
        Network.Devnet,
      ]);

      vi.spyOn(snap, 'request').mockResolvedValueOnce({
        active: false,
      });

      const mockConnection0 = createMockWebSocketConnection(
        'conn1',
        'wss://some-url.com',
        Network.Mainnet,
      );

      const mockConnection1 = createMockWebSocketConnection(
        'conn2',
        'wss://other-url.com',
        Network.Devnet,
      );

      vi.spyOn(
        mockWebSocketConnectionRepository,
        'getAll',
      ).mockResolvedValueOnce([mockConnection0, mockConnection1]);

      // Simulate a client start event
      await mockEventEmitter.emitSync('onStart');

      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('#openConnectionsForActiveNetworks', () => {
    it('opens the connections for all active networks', async () => {
      vi.spyOn(mockConfigProvider, 'getActiveNetworks').mockResolvedValue([
        Network.Mainnet,
        Network.Devnet,
      ]);

      vi.spyOn(service, 'openConnection').mockResolvedValueOnce(undefined);

      // Simulate the snap becoming active
      await mockEventEmitter.emitSync('onActive');

      expect(service.openConnection).toHaveBeenCalledTimes(2);
    });

    it('clears existing retry attempts', async () => {
      // We register a recovery handler for Mainnet. We expect it to be cleared when the method is executed.
      const recoveryHandler = vi.fn();
      service.onConnectionRecovery(Network.Mainnet, recoveryHandler);

      /**
       * Setup Mainnet as active network, but it has no connection, so calling openConnectionsForActiveNetworks will:
       * - clear the retry attempts
       * - open the connection
       * - upon opening, we will trigger all recovery handlers
       * - but since retry attempts have been cleared, they should not have been called
       */
      vi.spyOn(mockConfigProvider, 'getActiveNetworks').mockResolvedValue([
        Network.Mainnet,
      ]);
      vi.spyOn(
        mockWebSocketConnectionRepository,
        'getAll',
      ).mockResolvedValueOnce([]);
      vi.spyOn(
        mockWebSocketConnectionRepository,
        'findByNetwork',
      ).mockResolvedValueOnce(null);

      // Simulate the snap start event
      await mockEventEmitter.emitSync('onStart');

      // The connection has recovered, but the recovery handler should not have been called because retry attempts were cleared
      expect(recoveryHandler).not.toHaveBeenCalled();
    });
  });

  describe('closeAllConnections', () => {
    it('closes all connections when called directly', async () => {
      const mockConnections = [
        createMockWebSocketConnection(
          'conn1',
          mockWebSocketUrl,
          Network.Mainnet,
        ),
        createMockWebSocketConnection(
          'conn2',
          'wss://other-url.com',
          Network.Devnet,
        ),
      ];

      vi.spyOn(mockWebSocketConnectionRepository, 'getAll').mockResolvedValue(
        mockConnections,
      );

      // Call closeAllConnections directly
      await service.closeAllConnections();

      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledTimes(2);
      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledWith(
        'conn1',
      );
      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledWith(
        'conn2',
      );
    });

    it('continues closing other connections even if one fails', async () => {
      const mockConnections = [
        createMockWebSocketConnection(
          'conn1',
          mockWebSocketUrl,
          Network.Mainnet,
        ),
        createMockWebSocketConnection(
          'conn2',
          'wss://other-url.com',
          Network.Devnet,
        ),
        createMockWebSocketConnection(
          'conn3',
          'wss://third-url.com',
          Network.Testnet,
        ),
      ];

      vi.spyOn(mockWebSocketConnectionRepository, 'getAll').mockResolvedValue(
        mockConnections,
      );

      // Mock one connection to fail deletion
      vi.spyOn(mockWebSocketConnectionRepository, 'delete')
        .mockRejectedValueOnce(new Error('Failed to delete connection'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      // Call closeAllConnections directly
      await service.closeAllConnections();

      // Should attempt to delete all connections despite one failing
      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledTimes(3);
      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledWith(
        'conn1',
      );
      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledWith(
        'conn2',
      );
      expect(mockWebSocketConnectionRepository.delete).toHaveBeenCalledWith(
        'conn3',
      );
    });
  });

  describe('openConnection', () => {
    it('opens the connection for the network', async () => {
      vi.spyOn(
        mockWebSocketConnectionRepository,
        'findByNetwork',
      ).mockResolvedValue(null);

      await service.openConnection(Network.Mainnet);

      expect(mockWebSocketConnectionRepository.save).toHaveBeenCalledTimes(1);
    });

    it('does nothing if the connection already exists', async () => {
      vi.spyOn(
        mockWebSocketConnectionRepository,
        'findByNetwork',
      ).mockResolvedValue(createMockWebSocketConnection());

      await service.openConnection(Network.Mainnet);

      expect(mockWebSocketConnectionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('#handleWebSocketEvent', () => {
    describe('when the event is a connect', () => {
      beforeEach(async () => {
        const mockConnection = createMockWebSocketConnection();

        vi.spyOn(
          mockWebSocketConnectionRepository,
          'getById',
        ).mockResolvedValue(mockConnection);

        vi.spyOn(
          mockWebSocketConnectionRepository,
          'findByNetwork',
        ).mockResolvedValueOnce(mockConnection);
      });

      it('triggers all the recovery handlers', async () => {
        const recoveryHandler0 = vi.fn();
        const recoveryHandler1 = vi.fn();

        service.onConnectionRecovery(Network.Mainnet, recoveryHandler0);
        service.onConnectionRecovery(Network.Mainnet, recoveryHandler1);

        // Send the connect event
        await mockEventEmitter.emitSync('onWebSocketEvent', {
          id: mockConnectionId,
          type: 'open',
        });

        expect(recoveryHandler0).toHaveBeenCalled();
        expect(recoveryHandler1).toHaveBeenCalled();
      });
    });

    describe('when the event is a disconnect', () => {
      beforeEach(async () => {
        const mockConnection = createMockWebSocketConnection();

        vi.spyOn(
          mockWebSocketConnectionRepository,
          'getAll',
        ).mockResolvedValueOnce([mockConnection]);

        vi.spyOn(
          mockWebSocketConnectionRepository,
          'getById',
        ).mockResolvedValueOnce(mockConnection);
      });

      describe('when the connection is closed cleanly', () => {
        it('does not attempt to reconnect', async () => {
          // Send a clean disconnect event
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: true,
            origin: 'wss://some-mock-url.com',
          });

          // Should not attempt to reconnect for clean closures
          expect(mockWebSocketConnectionRepository.save).not.toHaveBeenCalled();
        });

        it('does not track an event', async () => {
          // Send a clean disconnect event
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: true,
            origin: 'wss://some-mock-url.com',
          });

          expect(
            mockAnalyticsService.trackWebSocketConnectionClosedNotCleanly,
          ).not.toHaveBeenCalled();
        });
      });

      describe('when the connection is closed not cleanly', () => {
        it('attempts to reconnect until it succeeds, up to max attempts', async () => {
          // 1st and 2nd calls are the fail attempts, 3rd is the success attempt
          vi.spyOn(mockWebSocketConnectionRepository, 'save')
            .mockRejectedValueOnce(new Error('Connection failed'))
            .mockRejectedValueOnce(new Error('Connection failed'))
            .mockResolvedValueOnce(createMockWebSocketConnection());

          // Send the initial disconnect event
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: false,
            origin: 'wss://some-mock-url.com',
          });

          // The first 2 attemps at reconnecting will fail. Each failure will emit its own disconnect event.
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: false,
            origin: 'wss://some-mock-url.com',
          });
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: false,
            origin: 'wss://some-mock-url.com',
          });
          // The 3rd attempt at reconnecting will succeed. This will emit a connect event.
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'open',
            origin: 'wss://some-mock-url.com',
          });

          expect(mockWebSocketConnectionRepository.save).toHaveBeenCalledTimes(
            3,
          );
        });

        it('retries up to the max number of attempts', async () => {
          vi.spyOn(mockWebSocketConnectionRepository, 'save').mockRejectedValue(
            new Error('Connection failed'),
          );

          // Send the initial disconnect event
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: false,
            origin: 'wss://some-mock-url.com',
          });

          // Send many disconnect events, more than the max number of attempts
          for (let i = 0; i < 10; i++) {
            await mockEventEmitter.emitSync('onWebSocketEvent', {
              id: mockConnectionId,
              type: 'close',
              wasClean: false,
              origin: 'wss://some-mock-url.com',
            });
          }

          // Check that we do not retry more than the max
          expect(mockWebSocketConnectionRepository.save).toHaveBeenCalledTimes(
            5,
          );
        });

        it('tracks an event', async () => {
          await mockEventEmitter.emitSync('onWebSocketEvent', {
            id: mockConnectionId,
            type: 'close',
            wasClean: false,
            origin: 'wss://some-mock-url.com',
          });

          expect(
            mockAnalyticsService.trackWebSocketConnectionClosedNotCleanly,
          ).toHaveBeenCalledWith({
            origin: 'wss://some-mock-url.com',
            code: 0,
            reason: null,
          });
        });
      });
    });
  });

  describe('findByNetwork', () => {
    it('returns the connection ID for the network', async () => {
      const mockConnection = createMockWebSocketConnection();
      vi.spyOn(
        mockWebSocketConnectionRepository,
        'findByNetwork',
      ).mockResolvedValueOnce(mockConnection);

      const connection = await service.findByNetwork(Network.Mainnet);

      expect(connection).toStrictEqual(mockConnection);
    });
  });

  describe('background event scheduling', () => {
    it.each([
      { event: 'onActive', asRpcError: false },
      { event: 'onActive', asRpcError: true },
      { event: 'onInactive', asRpcError: false },
      { event: 'onInactive', asRpcError: true },
    ])(
      'does not track an already-removed background event on $event (RPC error: $asRpcError)',
      async ({ event, asRpcError }) => {
        const existingEventId = 'existing-event-id';
        const message = `A background event with the id of "${existingEventId}" does not exist.`;
        const error = asRpcError
          ? { code: -32603, message }
          : new Error(message);

        vi.spyOn(mockState, 'getKey').mockResolvedValueOnce(existingEventId);
        vi.spyOn(snap, 'request')
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce('new-event-id');
        vi.spyOn(mockState, 'setKey').mockResolvedValue(undefined);
        vi.spyOn(service, 'openConnection').mockResolvedValue(undefined);

        // eslint-disable-next-line n/no-sync -- emitSync awaits asynchronous event handlers.
        await mockEventEmitter.emitSync(event);

        expect(trackError).not.toHaveBeenCalled();
        expect(mockState.setKey).toHaveBeenCalledWith(
          'webSocketConnections.closeWebSocketConnectionsBackgroundEventId',
          null,
        );
        expect(service.openConnection).toHaveBeenCalledTimes(
          event === 'onActive' ? 2 : 0,
        );
        expect(snap.request).toHaveBeenCalledTimes(
          event === 'onActive' ? 1 : 2,
        );
      },
    );

    describe('when client becomes inactive', () => {
      it('schedules a background event to close connections after grace period', async () => {
        const mockEventId = 'test-event-id-123';
        vi.spyOn(snap, 'request').mockResolvedValueOnce(mockEventId);
        vi.spyOn(mockState, 'setKey').mockResolvedValueOnce(undefined);

        await mockEventEmitter.emitSync('onInactive');

        expect(snap.request).toHaveBeenCalledWith({
          method: 'snap_scheduleBackgroundEvent',
          params: {
            duration: 'PT5S', // 5 seconds based on test config
            request: { method: 'closeWebSocketConnections' },
          },
        });

        expect(mockState.setKey).toHaveBeenCalledWith(
          'webSocketConnections.closeWebSocketConnectionsBackgroundEventId',
          mockEventId,
        );
      });

      it('cancels existing background event before scheduling new one', async () => {
        const existingEventId = 'existing-event-id';
        const newEventId = 'new-event-id';

        vi.spyOn(mockState, 'getKey').mockResolvedValueOnce(existingEventId);
        vi.spyOn(snap, 'request')
          .mockResolvedValueOnce(null) // cancel call
          .mockResolvedValueOnce(newEventId); // schedule call
        vi.spyOn(mockState, 'setKey').mockResolvedValue(undefined);

        await mockEventEmitter.emitSync('onInactive');

        expect(snap.request).toHaveBeenCalledWith({
          method: 'snap_cancelBackgroundEvent',
          params: { id: existingEventId },
        });
        expect(mockLogger.log).not.toHaveBeenCalledWith(
          '🫸 Cancelled background event to close connections',
          existingEventId,
        );

        expect(mockState.setKey).toHaveBeenCalledWith(
          'webSocketConnections.closeWebSocketConnectionsBackgroundEventId',
          null,
        );
      });

      it('handles cancellation errors gracefully', async () => {
        const existingEventId = 'existing-event-id';
        const newEventId = 'new-event-id';
        const error = new Error('Cancel failed');

        vi.spyOn(mockState, 'getKey').mockResolvedValueOnce(existingEventId);
        vi.spyOn(snap, 'request')
          .mockRejectedValueOnce(error)
          .mockResolvedValueOnce(newEventId);
        vi.spyOn(mockState, 'setKey').mockResolvedValue(undefined);

        await mockEventEmitter.emitSync('onInactive');

        // Should still schedule new event despite cancellation failure
        expect(snap.request).toHaveBeenCalledWith({
          method: 'snap_scheduleBackgroundEvent',
          params: {
            duration: 'PT5S',
            request: { method: 'closeWebSocketConnections' },
          },
        });
        expect(trackError).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalledWith(
          'Failed to cancel background event',
          error,
        );
        expect(mockLogger.log).not.toHaveBeenCalledWith(
          '🫸 Cancelled background event to close connections',
          existingEventId,
        );
      });
    });

    describe('when client becomes active', () => {
      it('cancels existing background event and opens connections', async () => {
        const existingEventId = 'existing-event-id';

        vi.spyOn(mockState, 'getKey').mockResolvedValueOnce(existingEventId);
        vi.spyOn(snap, 'request').mockResolvedValueOnce(null);
        vi.spyOn(mockState, 'setKey').mockResolvedValueOnce(undefined);
        vi.spyOn(service, 'openConnection').mockResolvedValue(undefined);

        await mockEventEmitter.emitSync('onActive');

        expect(snap.request).toHaveBeenCalledWith({
          method: 'snap_cancelBackgroundEvent',
          params: { id: existingEventId },
        });

        expect(mockState.setKey).toHaveBeenCalledWith(
          'webSocketConnections.closeWebSocketConnectionsBackgroundEventId',
          null,
        );

        expect(service.openConnection).toHaveBeenCalledTimes(2); // For Mainnet and Devnet
      });

      it('handles missing background event ID gracefully', async () => {
        vi.spyOn(mockState, 'getKey').mockResolvedValueOnce(null);
        vi.spyOn(service, 'openConnection').mockResolvedValue(undefined);

        await mockEventEmitter.emitSync('onActive');

        expect(snap.request).not.toHaveBeenCalledWith({
          method: 'snap_cancelBackgroundEvent',
          params: expect.anything(),
        });

        expect(service.openConnection).toHaveBeenCalledTimes(2);
      });

      it('continues opening connections even if cancellation fails', async () => {
        const existingEventId = 'existing-event-id';

        vi.spyOn(mockState, 'getKey').mockResolvedValueOnce(existingEventId);
        vi.spyOn(snap, 'request').mockRejectedValueOnce(
          new Error('Cancel failed'),
        );
        vi.spyOn(mockState, 'setKey').mockResolvedValueOnce(undefined);
        vi.spyOn(service, 'openConnection').mockResolvedValue(undefined);

        await mockEventEmitter.emitSync('onActive');

        expect(service.openConnection).toHaveBeenCalledTimes(2);
      });
    });
  });
});
