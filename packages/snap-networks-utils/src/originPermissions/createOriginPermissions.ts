export const DEFAULT_PROD_ORIGINS = ['https://portfolio.metamask.io'] as const;

export const DEFAULT_DEV_ORIGINS = ['http://localhost:3000'] as const;

export const DEFAULT_METAMASK_ORIGIN = 'metamask';

export type CreateOriginPermissionsParams = {
  dappMethods: Iterable<string>;
  metamaskMethods: Iterable<string>;
  origins?: readonly string[];
  metamaskOrigin?: string;
};

/**
 * Builds the origin-to-method permission map used by network snaps.
 *
 * Those origins receive `dappMethods` as provided (pass an empty list to deny
 * dapp calls). The MetaMask origin always receives `metamaskMethods`.
 *
 * @param params - Origin and method lists for the snap.
 * @param params.dappMethods - Methods allowed for connected dapps.
 * @param params.metamaskMethods - Methods allowed for the MetaMask origin.
 * @param params.origins - Dapp origins to register. Defaults to localhost.
 * @param params.metamaskOrigin - Origin key for MetaMask. Defaults to `metamask`.
 * @returns A map of origin to allowed RPC methods.
 */
export const createOriginPermissions = ({
  dappMethods,
  metamaskMethods,
  origins = DEFAULT_DEV_ORIGINS,
  metamaskOrigin = DEFAULT_METAMASK_ORIGIN,
}: CreateOriginPermissionsParams): Map<string, Set<string>> => {
  const originPermissions = new Map<string, Set<string>>();
  const dappPermissions = new Set(dappMethods);

  for (const origin of origins) {
    originPermissions.set(origin, dappPermissions);
  }
  originPermissions.set(metamaskOrigin, new Set(metamaskMethods));

  return originPermissions;
};
