import { DEFAULT_METAMASK_ORIGIN } from '../originPermissions/createOriginPermissions';

/**
 * Metadata that accompanies a request whose origin the client cannot verify,
 * e.g. a request relayed over WalletConnect or the SDK.
 *
 * Mirrors `OriginMetadata` from `@metamask/snaps-sdk` / `@metamask/keyring-api`,
 * redeclared here so this package does not have to pick one of the two.
 */
export type SelfReportedOriginMetadata = {
  transport: string;
  selfReportedOrigin: string;
};

export type ResolvedOrigin = {
  /**
   * Hostname safe to display, or `null` when there is nothing meaningful to
   * show (e.g. the origin is a WalletConnect channel ID and the request came
   * with no metadata). Callers should hide the origin row when `null`.
   */
  displayOrigin: string | null;
  /**
   * Whether `displayOrigin` was reported by the requester and could not be
   * verified. Such an origin may only be displayed, and must be framed as
   * unverified.
   */
  isSelfReported: boolean;
  /**
   * The origin URL when it is verifiable, `null` otherwise. This is the only
   * value that may feed security logic (transaction scans, SIWS domain
   * checks): a self-reported origin is attacker-controlled and would let a
   * dapp influence the checks meant to catch it.
   */
  verifiedOrigin: string | null;
};

const httpsHostname = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname
      : null;
  } catch {
    return null;
  }
};

/**
 * Resolves what a snap is allowed to do with the origin of a request.
 *
 * Remote transports (WalletConnect, SDK) pass an unspoofable connection ID as
 * `origin` and carry the dapp's self-reported URL in `originMetadata`. Only an
 * origin that is an HTTP(S) URL is verifiable; everything else is either
 * internal (`metamask`), self-reported, or opaque.
 *
 * @param origin - The request origin, as received by the snap.
 * @param originMetadata - Metadata for origins the client could not verify.
 * @returns How to display the origin, and the origin that may feed security logic.
 */
export function resolveOrigin(
  origin: string | undefined,
  originMetadata?: SelfReportedOriginMetadata | null,
): ResolvedOrigin {
  const verifiedHostname = origin ? httpsHostname(origin) : null;

  if (verifiedHostname && origin) {
    return {
      displayOrigin: verifiedHostname,
      isSelfReported: false,
      verifiedOrigin: origin,
    };
  }

  if (origin?.toLowerCase() === DEFAULT_METAMASK_ORIGIN) {
    return {
      displayOrigin: 'MetaMask',
      isSelfReported: false,
      verifiedOrigin: null,
    };
  }

  const selfReportedHostname = originMetadata?.selfReportedOrigin
    ? httpsHostname(originMetadata.selfReportedOrigin)
    : null;

  return {
    displayOrigin: selfReportedHostname,
    isSelfReported: selfReportedHostname !== null,
    verifiedOrigin: null,
  };
}
