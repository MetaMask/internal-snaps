const UNSUPPORTED_CALL_TYPE_PATTERN = /unsupported call type/iu;

/**
 * Detects Security Alerts simulator capability errors (unsupported Tron system
 * ops such as DelegateResource / FreezeBalanceV2) as opposed to genuine
 * simulation reverts.
 *
 * @param message - The raw simulation.error string from the API, if any.
 * @returns Whether the error is an unsupported-call-type simulator gap.
 */
export function isUnsupportedSimulationError(
  message: string | null | undefined,
): boolean {
  return Boolean(message && UNSUPPORTED_CALL_TYPE_PATTERN.test(message));
}
