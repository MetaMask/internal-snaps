/* eslint-disable import-x/no-nodejs-modules */
import { execSync } from 'child_process';
import process from 'process';

/* eslint-enable import-x/no-nodejs-modules */

/**
 * Minimal utility for Bitcoin regtest operations in integration tests
 */
const POLL_INTERVAL_MS = 50;

const POLL_MAX_RETRIES = 200;

export class BlockchainTestUtils {
  readonly #containerName: string;

  readonly #esploraHost: string;

  readonly #esploraPort: number;

  readonly #esploraBaseUrl: string;

  #minerAddress: string | undefined;

  constructor(options?: {
    containerName?: string;
    esploraHost?: string;
    esploraPort?: number;
  }) {
    this.#containerName =
      options?.containerName ?? process.env.ESPLORA_CONTAINER ?? 'esplora';

    this.#esploraHost =
      options?.esploraHost ?? process.env.ESPLORA_HOST ?? 'localhost';

    this.#esploraPort =
      options?.esploraPort ??
      (process.env.ESPLORA_PORT
        ? parseInt(process.env.ESPLORA_PORT, 10)
        : 8094);

    this.#esploraBaseUrl = `http://${this.#esploraHost}:${this.#esploraPort}/regtest/api`;
  }

  /**
   * Execute a bitcoin-cli command in the Docker container
   *
   * @param command - The bitcoin-cli command to execute
   * @returns The command output as a string
   */
  #execCli(command: string): string {
    const fullCommand = `docker exec ${this.#containerName} cli -regtest ${command}`;
    try {
      return execSync(fullCommand, { encoding: 'utf8' }).trim();
    } catch (error) {
      throw new Error(
        `Failed to execute CLI command: ${command}\n${String(error)}`,
      );
    }
  }

  /**
   * Poll until Esplora has indexed up to a specific block height
   *
   * @param targetHeight - The block height to wait for
   * @param maxRetries - Maximum number of polling attempts
   */
  async #waitForEsploraHeight(
    targetHeight: number,
    maxRetries = POLL_MAX_RETRIES,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(
          `${this.#esploraBaseUrl}/blocks/tip/height`,
        );
        if (response.ok) {
          const height = parseInt(await response.text(), 10);
          if (height >= targetHeight) {
            return;
          }
        }
      } catch {
        // Esplora not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `Esplora did not reach height ${targetHeight} after ${maxRetries} attempts`,
    );
  }

  /**
   * Wait for Esplora to see a transaction
   *
   * @param txid - The transaction ID to wait for
   * @param maxRetries - Maximum number of polling attempts
   */
  async #waitForEsploraTx(
    txid: string,
    maxRetries = POLL_MAX_RETRIES,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.#esploraBaseUrl}/tx/${txid}`);
        if (response.ok) {
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `Esplora did not index transaction ${txid} after ${maxRetries} attempts`,
    );
  }

  /**
   * Send Bitcoin to an address and wait for Esplora to see it
   *
   * @param address - The Bitcoin address to send to
   * @param amount - The amount of BTC to send
   * @param waitForIndexer - Whether to wait for Esplora to index the transaction. Skip when
   * `mineBlocks` follows, since that already waits for the indexed height.
   * @returns The transaction ID
   */
  async sendToAddress(
    address: string,
    amount: number,
    waitForIndexer = true,
  ): Promise<string> {
    const txid = this.#execCli(
      `-rpcwallet=default sendtoaddress "${address}" ${amount}`,
    );

    if (waitForIndexer) {
      await this.#waitForEsploraTx(txid);
    }
    return txid;
  }

  /**
   * Mine blocks and wait for Esplora to index them
   *
   * @param count - The number of blocks to mine
   */
  async mineBlocks(count: number): Promise<void> {
    this.#minerAddress ??= this.#execCli('getnewaddress');
    this.#execCli(`generatetoaddress ${count} ${this.#minerAddress}`);

    const targetHeight = parseInt(this.#execCli('getblockcount'), 10);
    await this.#waitForEsploraHeight(targetHeight);
  }

  /**
   * Get the balance of a Bitcoin address in satoshis
   *
   * @param address - The Bitcoin address to query
   * @returns The balance in satoshis
   */
  async getBalance(address: string): Promise<bigint> {
    try {
      const response = await fetch(
        `${this.#esploraBaseUrl}/address/${address}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to get address info: ${response.statusText}`);
      }

      const addressInfo = await response.json();
      const funded = BigInt(addressInfo.chain_stats.funded_txo_sum ?? 0);
      const spent = BigInt(addressInfo.chain_stats.spent_txo_sum ?? 0);
      return funded - spent;
    } catch (error) {
      throw new Error(
        `Failed to get balance for address ${address}: ${String(error)}`,
      );
    }
  }

  /**
   * Get the balance of a Bitcoin address in BTC
   *
   * @param address - The Bitcoin address to query
   * @returns The balance in BTC as a number
   */
  async getBalanceInBTC(address: string): Promise<number> {
    const balanceSats = await this.getBalance(address);
    return Number(balanceSats) / 100_000_000;
  }
}
