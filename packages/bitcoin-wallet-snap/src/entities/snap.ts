import type { AddressType, Network, WalletTx } from '@metamask/bitcoindevkit';
import type { JsonSLIP10Node, SLIP10Node } from '@metamask/key-tree';
import type {
  ComponentOrElement,
  GetClientStatusResult,
  GetPreferencesResult,
} from '@metamask/snaps-sdk';
import type { Json } from '@metamask/utils';

import type { BitcoinAccount } from './account';
import type { Inscription } from './meta-protocols';

export type SnapState = {
  // accountId -> account state. This is the main state of the snap.
  accounts: Record<string, AccountState | null>;
  // derivationPath -> accountId. Only needed for fast lookup.
  derivationPaths: Record<string, string>;
};

/**
 * In-memory snapshot loaded while resolving derivation paths. The
 * derivation-path map can be reused by a subsequent insert within the same
 * account mutation; the accounts map is retained for lookup results but
 * refreshed before full-map writes to avoid overwriting sync updates.
 */
export type AccountStateSnapshot = {
  accounts: SnapState['accounts'] | null;
  derivationPaths: SnapState['derivationPaths'] | null;
};

export type AccountState = {
  // Split derivation path.
  derivationPath: string[];
  // Wallet data.
  wallet: string;
  // Wallet inscriptions for meta protocols (ordinals, etc.)
  inscriptions: Inscription[];
  // Metadata used by keyring account responses without loading the BDK wallet.
  metadata?: AccountMetadata;
};

export type AccountMetadata = {
  // Public receive address at account address index 0.
  address: string;
  // Account address type.
  addressType: AddressType;
  // Bitcoin network.
  network: Network;
  // Public descriptor for read-only descriptor requests.
  publicDescriptor: string;
};

export type SyncResult = {
  // The synchronized account.
  account: BitcoinAccount;
  // Transactions that changed and should be notified.
  transactionsToNotify: WalletTx[];
  // Funding addresses per txid, resolved by the chain indexer. Only populated
  // for receives; used to display the counterparty.
  transactionSenders?: Map<string, string[]>;
};

export const TrackingSnapEvent = {
  TransactionAdded: 'Transaction Added',
  TransactionApproved: 'Transaction Approved',
  TransactionRejected: 'Transaction Rejected',
  TransactionFinalized: 'Transaction Finalized',
  TransactionReceived: 'Transaction Received',
  TransactionReorged: 'Transaction Reorged',
  TransactionSubmitted: 'Transaction Submitted',
  MissedTransactionsDiscovered: 'Missed Transactions Discovered',
} as const;

export type TrackingSnapEvent =
  (typeof TrackingSnapEvent)[keyof typeof TrackingSnapEvent];

/**
 * Event types emitted from the transaction confirmation flows, before the
 * transaction is broadcast. These carry no transaction ID.
 */
export type TransactionConfirmationEventType =
  | typeof TrackingSnapEvent.TransactionAdded
  | typeof TrackingSnapEvent.TransactionApproved
  | typeof TrackingSnapEvent.TransactionRejected;

/**
 * Event types emitted after a transaction is broadcast. These carry a
 * transaction ID (`tx_id`, or `transaction_hash` for discovery events).
 *
 * Excludes the pre-broadcast confirmation events in
 * `TransactionConfirmationEventType`.
 */
export type TransactionBroadcastEventType = Exclude<
  TrackingSnapEvent,
  TransactionConfirmationEventType
>;

/**
 * The SnapClient represents the MetaMask Snap state and manages the BIP-32 entropy from the Wallet SRP.
 */
export type SnapClient = {
  /**
   * Get the Snap state for a given key.
   *
   * @param key - The key to get the state for. Undefined for the root.
   * @returns The Snap state.
   */
  getState(key?: string): Promise<Json | null>;

  /**
   * Set the Snap state for a given key.
   *
   * @param key - The key to set the state for. Undefined for the root.
   * @param newState - The new state.
   */
  setState(key?: string, newState?: Json): Promise<void>;

  /**
   * Get the private SLIP10 for a given derivation path from the Snap SRP.
   *
   * @param derivationPath - The derivation path.
   * @returns The private SLIP10 node.
   */
  getPrivateEntropy(derivationPath: string[]): Promise<JsonSLIP10Node>;

  /**
   * Get the public SLIP10 for a given derivation path from the Snap SRP.
   *
   * @param derivationPath - The derivation path.
   * @returns The public SLIP10 node.
   */
  getPublicEntropy(derivationPath: string[]): Promise<SLIP10Node>;

  /**
   * Emit an event notifying the extension of updated balances
   *
   * @param accounts - The Bitcoin accounts to emit balances for.
   */
  emitAccountBalancesUpdatedEvent(accounts: BitcoinAccount[]): Promise<void>;

  /**
   * Emit an event notifying the extension of updated transactions
   *
   * @param account - The Bitcoin account.
   * @param txs - The transactions included in the event.
   * @param sendersByTxid - Optional funding addresses per txid, used to
   * populate the counterparty of receive transactions.
   */
  emitAccountTransactionsUpdatedEvent(
    account: BitcoinAccount,
    txs: WalletTx[],
    sendersByTxid?: Map<string, string[]>,
  ): Promise<void>;

  /**
   * Create a User Interface.
   *
   * @param ui - The UI Component.
   * @param context - The Interface context.
   * @returns the interface ID
   */
  createInterface(
    ui: ComponentOrElement,
    context: Record<string, Json>,
  ): Promise<string>;

  /**
   * Update a User Interface.
   *
   * @param id - The interface id.
   * @param ui - The user interface.
   * @param context - The Interface context.
   */
  updateInterface(
    id: string,
    ui: ComponentOrElement,
    context: Record<string, Json>,
  ): Promise<void>;

  /**
   * Display a User Interface.
   *
   * @param id - The interface id.
   * @returns the resolved value or null.
   */
  displayInterface<ResolveType>(id: string): Promise<ResolveType | null>;

  /**
   * Display a Confirmation Dialog.
   *
   * @param id - The interface id.
   * @returns the resolved value or null.
   */
  displayConfirmation<ResolveType>(id: string): Promise<ResolveType | null>;

  /**
   * Display a User Prompt Dialog.
   *
   * @param id - The interface id.
   * @returns the resolved value or null.
   */
  displayUserPrompt<ResolveType>(id: string): Promise<ResolveType | null>;

  /**
   * Resolve a User Interface.
   *
   * @param id - The interface id.
   * @param value - The resolved value.
   */
  resolveInterface(id: string, value: Json): Promise<void>;

  /**
   * Get the state of an interface.
   *
   * @param id - The interface id.
   * @returns the interface state.
   */
  getInterfaceState(id: string): Promise<Record<string, Json> | null>;

  /**
   * Get the context of an interface.
   *
   * @param id - The interface id.
   * @returns the interface context.
   */
  getInterfaceContext(id: string): Promise<Record<string, Json> | null>;

  /**
   * Schedules a background event.
   *
   * @param options - The options for the background event.
   * @param options.method - The method to call.
   * @param options.params - The params to pass to the method.
   * @param options.duration - The duration to wait before the event is scheduled.
   * @returns A promise that resolves to a string.
   */
  scheduleBackgroundEvent({
    method,
    params,
    duration,
  }: {
    method: string;
    params?: Record<string, Json>;
    duration: string;
  }): Promise<string>;

  /**
   * Cancel an already scheduled background event.
   *
   * @param id - The background event id.
   */
  cancelBackgroundEvent(id: string): Promise<void>;

  /**
   * Get user preferences.
   *
   * @returns the user's preferences.
   */
  getPreferences(): Promise<GetPreferencesResult>;

  /**
   * Get user's client status.
   *
   * @returns the user's client status.
   */
  getClientStatus(): Promise<GetClientStatusResult>;

  /**
   * Track events that comply with the SIP-32 spec (https://metamask.github.io/SIPs/SIPS/sip-32)
   *
   * Only accepts post-broadcast event types, since the emitted payload includes
   * the transaction ID. Use the `trackTransaction*` methods for the
   * pre-broadcast confirmation events.
   *
   * @param eventType The event type we want to track
   * @param account The correlated bitcoin account
   * @param tx The transaction we want to capture metrics for
   * @param origin The origin/source that triggered this event
   */
  emitTrackingEvent(
    eventType: TransactionBroadcastEventType,
    account: BitcoinAccount,
    tx: WalletTx,
    origin: string,
  ): Promise<void>;

  /**
   * Track a "Transaction Added" event when a transaction confirmation is shown.
   *
   * Emitted before the transaction is broadcast, so it carries no transaction ID.
   *
   * @param account The account the transaction belongs to.
   * @param origin The origin/source that triggered this event.
   */
  trackTransactionAdded(account: BitcoinAccount, origin: string): Promise<void>;

  /**
   * Track a "Transaction Approved" event when the user approves a transaction.
   *
   * Emitted before the transaction is broadcast, so it carries no transaction ID.
   *
   * @param account The account the transaction belongs to.
   * @param origin The origin/source that triggered this event.
   */
  trackTransactionApproved(
    account: BitcoinAccount,
    origin: string,
  ): Promise<void>;

  /**
   * Track a "Transaction Rejected" event when the user rejects a transaction.
   *
   * Emitted before the transaction is broadcast, so it carries no transaction ID.
   *
   * @param account The account the transaction belongs to.
   * @param origin The origin/source that triggered this event.
   */
  trackTransactionRejected(
    account: BitcoinAccount,
    origin: string,
  ): Promise<void>;

  /**
   * Track errors
   *
   * @param error The error to track
   */
  emitTrackingError(error: Error): Promise<void>;

  /**
   * Start a performance trace.
   *
   * @param name - The name of the trace.
   * @returns boolean whether the trace was started successfully.
   */
  startTrace(name: string): Promise<boolean>;

  /**
   * End a performance trace.
   *
   * @param name - The name of the trace.
   * @returns A promise that resolves when the trace is ended.
   */
  endTrace(name: string): Promise<void>;
};
