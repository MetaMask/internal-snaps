import execa from 'execa';
import { promises as fs } from 'fs';
import path from 'path';

import type { PackageType } from './constants';
import { MonorepoFiles, Placeholders, TemplateDirectories } from './constants';
import type { FileMap } from './fs-utils';
import { readAllFiles, writeFiles } from './fs-utils';

const REPO_ROOT = path.join(__dirname, '..', '..');
const REPO_PACKAGE_JSON = path.join(REPO_ROOT, MonorepoFiles.PackageJson);
const PACKAGES_PATH = path.join(REPO_ROOT, 'packages');

const allPlaceholdersRegex = new RegExp(
  Object.values(Placeholders).join('|'),
  'gu',
);

/**
 * The data necessary to create a new package.
 */
export type PackageData = Readonly<{
  name: string;
  description: string;
  type: PackageType;
  directoryName: string;
  nodeVersions: string;
  currentYear: string;
}>;

/**
 * Data parsed from relevant monorepo files.
 */
type MonorepoFileData = {
  nodeVersions: string;
};

/**
 * A parsed package.json file.
 */
type PackageJson = {
  engines: { node: string };
  [key: string]: unknown;
};

/**
 * Reads the monorepo files that need to be parsed or modified.
 *
 * @returns A map of file paths to file contents.
 */
export async function readMonorepoFiles(): Promise<MonorepoFileData> {
  const packageJson = await fs.readFile(REPO_PACKAGE_JSON, 'utf-8');

  return {
    nodeVersions: (JSON.parse(packageJson) as PackageJson).engines.node,
  };
}

/**
 * Finalizes package and repo files, writes them to disk, and performs necessary
 * postprocessing (e.g. running `yarn install`).
 *
 * @param packageData - The package data.
 * @param monorepoFileData - The monorepo file data.
 */
export async function finalizeAndWriteData(
  packageData: PackageData,
  monorepoFileData: MonorepoFileData,
): Promise<void> {
  const packagePath = path.join(PACKAGES_PATH, packageData.directoryName);
  try {
    await fs.stat(packagePath);
    throw new Error(`The package directory already exists: ${packagePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  console.log('Writing package files...');

  // Read and write package files
  await writeFiles(
    packagePath,
    await processTemplateFiles(packageData, monorepoFileData),
  );

  // Postprocess
  // Add the new package to the lockfile.
  console.log('Running "yarn install"...');
  await execa('yarn', ['install'], { cwd: REPO_ROOT });

  // Add the new package to the root readme content
  console.log('Running "yarn readme-content:update"...');
  await execa('yarn', ['readme-content:update'], { cwd: REPO_ROOT });
}

/**
 * Reads the template files for the package type and updates them with the
 * specified package data.
 *
 * @param packageData - The package data.
 * @param monorepoFileData - The monorepo file data.
 * @returns A map of file paths to processed template file contents.
 */
async function processTemplateFiles(
  packageData: PackageData,
  monorepoFileData: MonorepoFileData,
): Promise<FileMap> {
  const result: FileMap = {};
  const templateDir = path.join(
    __dirname,
    TemplateDirectories[packageData.type],
  );
  const templateFiles = await readAllFiles(templateDir);

  for (const [relativePath, content] of Object.entries(templateFiles)) {
    result[relativePath] = processTemplateContent(
      packageData,
      monorepoFileData,
      content,
    );
  }

  return result;
}

/**
 * Processes the template file content by replacing placeholders with relevant values
 * from the specified package data.
 *
 * @param packageData - The package data.
 * @param monorepoFileData - The monorepo file data.
 * @param content - The template file content.
 * @returns The processed template file content.
 */
function processTemplateContent(
  packageData: PackageData,
  monorepoFileData: MonorepoFileData,
  content: string,
): string {
  const { name, description, currentYear } = packageData;
  const { nodeVersions } = monorepoFileData;

  return content.replace(allPlaceholdersRegex, (match) => {
    switch (match) {
      case Placeholders.CurrentYear:
        return currentYear;
      case Placeholders.NodeVersions:
        return nodeVersions;
      case Placeholders.PackageName:
        return name;
      case Placeholders.PackageDescription:
        return description;
      case Placeholders.PackageDirectoryName:
        return packageData.directoryName;
      /* istanbul ignore next: should be impossible */
      default:
        throw new Error(`Unknown placeholder: ${match}`);
    }
  });
}
