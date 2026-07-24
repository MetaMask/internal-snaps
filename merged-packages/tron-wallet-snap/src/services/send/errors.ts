/**
 * Error thrown when Tron transaction fees cannot be determined safely.
 *
 * Thrown by `FeeCalculatorService` when the live chain-parameters fetch fails
 * (TronGrid 429 / timeout / 5xx / network error) AND no last-known cached
 * chain parameters are available to fall back to.
 *
 * Rather than returning a hidden $0 or wrong fee, the service fails gracefully
 * by throwing this error so the MetaMask controller surfaces it and prevents
 * the consumer from submitting a swap without network fees.
 */
export class FeeUnavailableError extends Error {
  constructor() {
    super(
      'Could not estimate Tron network fees: TronGrid is unavailable and no cached fee data is available.',
    );
    this.name = 'FeeUnavailableError';
  }
}
