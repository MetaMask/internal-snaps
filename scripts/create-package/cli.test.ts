import cli from './cli';
import { commands, commandMap } from './commands';
import * as utils from './utils';

jest.mock('./utils');

/**
 * Returns a mock `process.argv` array with the provided arguments. Includes
 * default values for `process.argv[0]` and `process.argv[1]`.
 *
 * @param args - The arguments to include in the mock argv array.
 * @returns The mock argv array.
 */
function getMockArgv(...args: string[]): string[] {
  return ['/mock/path', '/mock/entry/path', ...args];
}

/**
 * Returns the parsed `yargs.Arguments` object for a given package name,
 * description, and type.
 *
 * @param name - The package name.
 * @param description - The package description.
 * @param type - The package type.
 * @returns The parsed argv object.
 */
function getParsedArgv(
  name: string,
  description: string,
  type: string,
): {
  _: [];
  $0: 'create-package';
  name: `@metamask/${string}`;
  description: string;
  type: string;
} {
  return {
    _: [],
    $0: 'create-package',
    name: `@metamask/${name}`,
    description,
    type,
  };
}

describe('create-package/cli', () => {
  beforeEach(() => {
    // yargs calls process.exit() with 1 on failure and sometimes 0 on success.
    // We have to intercept it.
    jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null) => {
        if (code === 1) {
          throw new Error('exit: 1');
        } else {
          return undefined as never;
        }
      });

    // We actually check these.
    jest.spyOn(console, 'error');
    jest.spyOn(console, 'log');
  });

  afterEach(() => {
    delete process.exitCode;
  });

  it('should error if a string option contains only whitespace', async () => {
    const defaultCommand = commandMap.$0;
    jest.spyOn(defaultCommand, 'handler').mockImplementation();

    await expect(
      cli(getMockArgv('--name', '  ', '--type', 'snap'), commands),
    ).rejects.toThrow('exit: 1');

    expect(console.error).toHaveBeenCalledWith(
      'The argument "name" was processed to an empty string. Please provide a value with non-whitespace characters.',
    );
  });

  describe('command: $0', () => {
    it('should call the command handler with the correct arguments', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler');

      jest.spyOn(utils, 'readMonorepoFiles').mockResolvedValue({
        nodeVersions: '>=18.0.0',
      });
      jest.spyOn(utils, 'finalizeAndWriteData').mockResolvedValue();

      expect(
        await cli(
          getMockArgv('--name', 'foo', '--description', 'bar', '--type', 'lib'),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar', 'library')),
      );
    });

    it('should handle names already prefixed with "@metamask/"', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler');

      jest.spyOn(utils, 'readMonorepoFiles').mockResolvedValue({
        nodeVersions: '>=18.0.0',
      });
      jest.spyOn(utils, 'finalizeAndWriteData').mockResolvedValue();

      expect(
        await cli(
          getMockArgv(
            '--name',
            '@metamask/foo',
            '--description',
            'bar',
            '--type',
            'snap',
          ),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar', 'snap')),
      );
    });

    it('should normalize the "lib" shorthand to "library"', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler').mockImplementation();

      expect(
        await cli(
          getMockArgv('--name', 'foo', '--description', 'bar', '--type', 'lib'),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar', 'library')),
      );
    });

    it('should create a new package', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler').mockImplementation();

      expect(
        await cli(
          getMockArgv(
            '--name',
            'foo',
            '--description',
            'bar',
            '--type',
            'library',
          ),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar', 'library')),
      );
    });

    it('should error if the package name is missing', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler').mockImplementation();

      await expect(
        cli(getMockArgv('--description', 'bar', '--type', 'snap'), commands),
      ).rejects.toThrow('exit: 1');

      expect(console.error).toHaveBeenCalledWith(
        'Missing required argument: "name"',
      );
    });

    it('should error if the package description is missing', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler').mockImplementation();

      await expect(
        cli(getMockArgv('--name', 'foo', '--type', 'snap'), commands),
      ).rejects.toThrow('exit: 1');

      expect(console.error).toHaveBeenCalledWith(
        'Missing required argument: "description"',
      );
    });

    it('should default the package type to "snap"', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler').mockImplementation();

      expect(
        await cli(
          getMockArgv('--name', 'foo', '--description', 'bar'),
          commands,
        ),
      ).toBeUndefined();

      expect(defaultCommand.handler).toHaveBeenCalledTimes(1);
      expect(defaultCommand.handler).toHaveBeenCalledWith(
        expect.objectContaining(getParsedArgv('foo', 'bar', 'snap')),
      );
    });

    it('should error if the package type is invalid', async () => {
      const defaultCommand = commandMap.$0;
      jest.spyOn(defaultCommand, 'handler').mockImplementation();

      await expect(
        cli(
          getMockArgv('--name', 'foo', '--description', 'bar', '--type', 'foo'),
          commands,
        ),
      ).rejects.toThrow('exit: 1');

      expect(console.error).toHaveBeenCalledWith(
        'Invalid package type: "foo". Valid types are: "snap", "library", "lib".',
      );
    });
  });
});
