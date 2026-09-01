import type {
  Argv,
  CommandModule as YargsCommandModule,
  Arguments,
} from 'yargs';

import type { PackageData, PackageType } from './utils';
import { finalizeAndWriteData, readMonorepoFiles } from './utils';

export type CreatePackageOptions = {
  name: string;
  description: string;
  type: PackageType;
  proposedName?: string;
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
          choices: ['library', 'snap'] as const,
          default: 'library' as const,
          describe: 'The type of package to create.',
        },

        proposedName: {
          describe: 'The human-readable name shown for a Snap.',
          type: 'string',
          requiresArg: true,
        },
      })
      .example(
        '$0 --name fabulous-package --description "A fabulous package."',
        'Create a new library package with the given name and description.',
      )
      .example(
        '$0 --type snap --name fabulous-snap --description "A fabulous Snap." --proposed-name "Fabulous Snap"',
        'Create a new Snap package.',
      )
      .check((args) => {
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('Missing required argument: "name"');
        }
        if (!args.description || typeof args.description !== 'string') {
          throw new Error('Missing required argument: "description"');
        }
        if (args.type === 'snap' && !args.proposedName) {
          throw new Error(
            'Missing required argument for Snap packages: "proposed-name"',
          );
        }
        if (args.type === 'library' && args.proposedName) {
          throw new Error(
            'The argument "proposed-name" is only valid for Snap packages.',
          );
        }

        if (!args.name.startsWith('@metamask/')) {
          args.name = `@metamask/${args.name}`;
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
    ...(args.type === 'snap' && { proposedName: args.proposedName as string }),
    directoryName: args.name.slice('@metamask/'.length),
    nodeVersions: monorepoFileData.nodeVersions,
    currentYear: new Date().getFullYear().toString(),
  };

  await finalizeAndWriteData(packageData);
  console.log(`Created package "${packageData.name}"!`);
}
