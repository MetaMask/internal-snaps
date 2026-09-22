import { enums } from '@metamask/superstruct';

/**
 * The environments a snap can be built for, matched against the
 * `ENVIRONMENT` build-time injection.
 */
export const Environment = {
  Local: 'local',
  Test: 'test',
  Production: 'production',
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];

/**
 * A struct for parsing the environment a snap was built for from an
 * environment variable. Unknown values are rejected.
 */
export const EnvironmentStruct = enums(
  Object.values(Environment) as [Environment, ...Environment[]],
);
