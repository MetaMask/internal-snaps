export const DEFAULT_PROD_ORIGINS = ['https://portfolio.metamask.io'] as const;

export const DEFAULT_DEV_ORIGINS = ['http://localhost:3000'] as const;

export const DEFAULT_METAMASK_ORIGIN = 'metamask';

export type CreateOriginPermissionsParams = {
  isDev: boolean;
  dappMethods: Iterable<string>;
  metamaskMethods: Iterable<string>;
  prodOrigins?: readonly string[];
  devOrigins?: readonly string[];
  metamaskOrigin?: string;
};

/**
 * Builds the origin-to-method permission map used by network snaps.
 *
 * In development, `devOrigins` receive `dappMethods`. In production, `prodOrigins`
 * are still registered but with an empty method set, so dapp calls are rejected.
 * The MetaMask origin always receives `metamaskMethods`.
 *
 * @param params - Origin and method lists for the snap.
 * @param params.isDev - Whether to use development origins and dapp methods.
 * @param params.dappMethods - Methods allowed for connected dapps in development.
 * @param params.metamaskMethods - Methods allowed for the MetaMask origin.
 * @param params.prodOrigins - Origins registered in production. Defaults to Portfolio.
 * @param params.devOrigins - Origins registered in development. Defaults to localhost.
 * @param params.metamaskOrigin - Origin key for MetaMask. Defaults to `metamask`.
 * @returns A map of origin to allowed RPC methods.
 */
export const createOriginPermissions = ({
  isDev,
  dappMethods,
  metamaskMethods,
  prodOrigins = DEFAULT_PROD_ORIGINS,
  devOrigins = DEFAULT_DEV_ORIGINS,
  metamaskOrigin = DEFAULT_METAMASK_ORIGIN,
}: CreateOriginPermissionsParams): Map<string, Set<string>> => {
  const originPermissions = new Map<string, Set<string>>();
  const allowedOrigins = isDev ? devOrigins : prodOrigins;
  const dappPermissions = isDev ? new Set(dappMethods) : new Set<string>();

  for (const origin of allowedOrigins) {
    originPermissions.set(origin, dappPermissions);
  }
  originPermissions.set(metamaskOrigin, new Set(metamaskMethods));

  return originPermissions;
};
