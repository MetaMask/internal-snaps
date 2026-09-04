import type {
  Argv,
  CommandModule as YargsCommandModule,
  Arguments,
} from 'yargs';

import type { PackageType } from './constants';
import { PackageTypeChoices, PackageTypes } from './constants';
import type { PackageData } from './utils';
import { finalizeAndWriteData, readMonorepoFiles } from './utils';

export type CreatePackageOptions = {
  name: string;
  description: string;
  type: PackageType;
};

export type CommandModule = YargsCommandModule<object, CreatePackageOptions> & {
  command: string;
  handler: (args: Arguments<CreatePackageOptions>) => Promise<void>;
};

/**
 * The yargs command for creating a new monorepo package.
 */
const defaultCommand: CommandModule = {
  command: '$0',
  describe: 'Create a new monorepo package.',
  builder: (argv: Argv<object>) => {
    argv
      .options({
        name: {
          alias: 'n',
          describe: 'The package name. Will be prefixed with "@metamask/".',
          type: 'string',
          requiresArg: true,
        },

        description: {
          alias: 'd',
          describe:
            'A short description of the package, as used in package.json.',
          type: 'string',
          requiresArg: true,
        },

        type: {
          alias: 't',
          describe:
            'The type of package to create, either "snap" or "library". "lib" is a shorthand for "library". Defaults to "snap".',
          type: 'string',
          requiresArg: true,
          default: PackageTypes.Snap,
        },
      })
      .example(
        '$0 --name fabulous-snap --description "A fabulous snap."',
        'Create a new Snap package with the given name and description. Snaps are the default package type.',
      )
      .example(
        '$0 -t lib -n fabulous-package -d "A fabulous package."',
        'Create a new library package using shorthand options.',
      )
      .check((args) => {
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('Missing required argument: "name"');
        }
        if (!args.description || typeof args.description !== 'string') {
          throw new Error('Missing required argument: "description"');
        }

        if (!PackageTypeChoices.includes(args.type as PackageType | 'lib')) {
          throw new Error(
            `Invalid package type: "${args.type}". Valid types are: ${[
              ...PackageTypeChoices,
            ]
              .map((type) => `"${type}"`)
              .join(', ')}.`,
          );
        }

        if (!args.name.startsWith('@metamask/')) {
          args.name = `@metamask/${args.name}`;
        }

        // Normalize the "lib" shorthand to "library".
        if (args.type === 'lib') {
          args.type = PackageTypes.Library;
        }

        return true;
      });

    return argv as Argv<CreatePackageOptions>;
  },
  handler: async (args: Arguments<CreatePackageOptions>) =>
    await createPackageHandler(args),
};

export const commands = [defaultCommand];
export const commandMap = {
  $0: defaultCommand,
};

/**
 * Creates a new monorepo package.
 *
 * @param args - The yargs arguments.
 */
export async function createPackageHandler(
  args: Arguments<CreatePackageOptions>,
): Promise<void> {
  console.log(`Attempting to create package "${args.name}"...`);

  const monorepoFileData = await readMonorepoFiles();
  const packageData: PackageData = {
    name: args.name,
    description: args.description,
    type: args.type,
    directoryName: args.name.slice('@metamask/'.length),
    nodeVersions: monorepoFileData.nodeVersions,
    currentYear: new Date().getFullYear().toString(),
  };

  await finalizeAndWriteData(packageData, monorepoFileData);
  console.log(`Created package "${packageData.name}"!`);
}
