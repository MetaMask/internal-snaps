/**
 * The monorepo files that need to be parsed or modified.
 */
export const MonorepoFiles = {
  PackageJson: 'package.json',
} as const;

export type MonorepoFiles = (typeof MonorepoFiles)[keyof typeof MonorepoFiles];

/**
 * The types of packages that can be created.
 */
export const PackageTypes = {
  Snap: 'snap',
  Library: 'library',
} as const;

export type PackageType = (typeof PackageTypes)[keyof typeof PackageTypes];

/**
 * The accepted values for the `--type` option, including shorthands.
 */
export const PackageTypeChoices = [
  PackageTypes.Snap,
  PackageTypes.Library,
  'lib',
] as const;

/**
 * The directories containing the templates for each package type.
 */
export const TemplateDirectories: Record<PackageType, string> = {
  [PackageTypes.Snap]: 'snap-template',
  [PackageTypes.Library]: 'library-template',
};

/**
 * Placeholder values in package template files that need to be replaced with
 * actual values corresponding to the new package.
 */
export const Placeholders = {
  CurrentYear: 'CURRENT_YEAR',
  NodeVersions: 'NODE_VERSIONS',
  PackageName: 'PACKAGE_NAME',
  PackageDescription: 'PACKAGE_DESCRIPTION',
  PackageDirectoryName: 'PACKAGE_DIRECTORY_NAME',
} as const;

export type Placeholders = (typeof Placeholders)[keyof typeof Placeholders];
