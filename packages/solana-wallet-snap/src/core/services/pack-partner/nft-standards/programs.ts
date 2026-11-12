import { address } from '@solana/kit';

// Protocol identities, not provider trust policy. Pack Partner addresses live
// in ../constants.ts. Standards import this module, never another validator.
export const CORE_PROGRAM_ADDRESS = address(
  'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d',
);

export const TOKEN_METADATA_PROGRAM_ADDRESS = address(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

export const BUBBLEGUM_PROGRAM_ADDRESS = address(
  'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY',
);

export const COMPRESSION_PROGRAM_ADDRESS = address(
  'mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW',
);

export const NOOP_PROGRAM_ADDRESS = address(
  'mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3',
);

export const AUTHORIZATION_RULES_PROGRAM_ADDRESS = address(
  'auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg',
);
