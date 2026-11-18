import type { Network } from '@metamask/bitcoindevkit';

export type ChainConfig = {
  parallelRequests: number;
  stopGap: { discovery: number; scan: number };
  url: {
    [network in Network]: string;
  };
  explorerUrl: {
    [network in Network]: string;
  };
};

export type PriceApiConfig = {
  url: string;
};
