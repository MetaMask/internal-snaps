import type { OnNameLookupHandler } from '@metamask/snaps-sdk';
import { assert } from '@metamask/superstruct';

import { nameResolutionService } from '../../../snapContext';
import { SolanaNameLookupRequestStruct } from './structs';

const SOLANA_NAME_SERVICE_PROTOCOL = 'Solana Name Service';
const SOLANA_NAME_SERVICE_TLDS = ['.sns', '.sol'];

export const onNameLookupHandler: OnNameLookupHandler = async (request) => {
  assert(request, SolanaNameLookupRequestStruct);

  const { chainId, domain, address } = request;

  // regex to match valid SNS domains (at least one character before the TLD)
  const validDomainRegex = new RegExp(
    `^.+(${SOLANA_NAME_SERVICE_TLDS.map((tld) => `\\${tld}`).join('|')})$`,
    'u',
  );

  if (domain && validDomainRegex.test(domain)) {
    const resolvedAddress = await nameResolutionService.resolveDomain(
      chainId,
      domain,
    );

    if (resolvedAddress) {
      return {
        resolvedAddresses: [
          {
            resolvedAddress,
            protocol: SOLANA_NAME_SERVICE_PROTOCOL,
            domainName: domain,
          },
        ],
      };
    }
  }

  if (address) {
    const resolvedDomain = await nameResolutionService.resolveAddress(
      chainId,
      address,
    );

    if (resolvedDomain) {
      return {
        resolvedDomains: [
          {
            resolvedDomain,
            protocol: SOLANA_NAME_SERVICE_PROTOCOL,
          },
        ],
      };
    }
  }

  return null;
};
