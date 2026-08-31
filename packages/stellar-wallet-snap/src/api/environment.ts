export const Environment = {
  Local: 'local',
  Test: 'test',
  Production: 'production',
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];
