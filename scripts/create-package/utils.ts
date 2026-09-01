import execa from 'execa';
import { promises as fs } from 'fs';
import path from 'path';

import { MonorepoFiles, Placeholders } from './constants';
import type { FileMap } from './fs-utils';
import { readAllFiles, writeFiles } from './fs-utils';

const PACKAGE_TEMPLATE_DIR = path.join(__dirname, 'package-template');
const SNAP_PACKAGE_TEMPLATE_DIR = path.join(__dirname, 'snap-package-template');
const REPO_ROOT = path.join(__dirname, '..', '..');
const REPO_PACKAGE_JSON = path.join(REPO_ROOT, MonorepoFiles.PackageJson);
const PACKAGES_PATH = path.join(REPO_ROOT, 'packages');

const allPlaceholdersRegex = new RegExp(
  Object.values(Placeholders).join('|'),
  'gu',
);

export type PackageType = 'library' | 'snap';

/**
 * The data necessary to create a new package.
 */
export type PackageData = Readonly<{
  name: string;
  description: string;
  type: PackageType;
  proposedName?: string;
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
 */
export async function finalizeAndWriteData(
  packageData: PackageData,
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

  console.log('Writing package and monorepo files...');

  // Read and write package files
  await writeFiles(packagePath, await processTemplateFiles(packageData));

  // Postprocess
  // Add the new package to the lockfile.
  console.log('Running "yarn install"...');
  await execa('yarn', ['install'], { cwd: REPO_ROOT });

  // Add the new package to the root readme content
  console.log('Running "yarn readme-content:update"...');
  await execa('yarn', ['readme-content:update'], { cwd: REPO_ROOT });
}

/**
 * Reads the template files and updates them with the specified package data.
 *
 * @param packageData - The package data.
 * @returns A map of file paths to processed template file contents.
 */
async function processTemplateFiles(
  packageData: PackageData,
): Promise<FileMap> {
  const result: FileMap = {};
  const templateFiles = await readAllFiles(PACKAGE_TEMPLATE_DIR);

  if (packageData.type === 'snap') {
    delete templateFiles['src/index.test.ts'];
    delete templateFiles['src/index.ts'];
    delete templateFiles['tsconfig.build.json'];
    delete templateFiles['typedoc.json'];
    Object.assign(templateFiles, await readAllFiles(SNAP_PACKAGE_TEMPLATE_DIR));
  }

  for (const [relativePath, content] of Object.entries(templateFiles)) {
    result[relativePath] = processTemplateContent(packageData, content);
  }

  return result;
}

/**
 * Processes the template file content by replacing placeholders with relevant values
 * from the specified package data.
 *
 * @param packageData - The package data.
 * @param content - The template file content.
 * @returns The processed template file content.
 */
function processTemplateContent(
  packageData: PackageData,
  content: string,
): string {
  const { name, description, nodeVersions, currentYear } = packageData;

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
      case Placeholders.ProposedName:
        if (packageData.type !== 'snap' || !packageData.proposedName) {
          throw new Error('Snap package data must include a proposed name.');
        }
        return packageData.proposedName;
      /* istanbul ignore next: should be impossible */
      default:
        throw new Error(`Unknown placeholder: ${match}`);
    }
  });
}
