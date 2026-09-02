export const CronjobMethod = {} as const;

export type CronjobMethod = (typeof CronjobMethod)[keyof typeof CronjobMethod];
