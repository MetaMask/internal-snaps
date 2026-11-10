import type { Arguments } from 'yargs';

import type { CreatePackageOptions } from './commands';
import { createPackageHandler } from './commands';
import { PackageTypes } from './constants';
import * as utils from './utils';

vi.mock('./utils', () => ({
  finalizeAndWriteData: vi.fn(),
  readMonorepoFiles: vi.fn(),
}));

// January 2 to avoid time zone issues.
vi.useFakeTimers();
vi.setSystemTime(new Date('2023-01-02'));

describe('create-package/commands', () => {
  afterAll(() => {
    vi.useRealTimers();
  });

  describe('createPackageHandler', () => {
    it('should create the expected library package', async () => {
      vi.mocked(utils.readMonorepoFiles).mockResolvedValue({
        nodeVersions: '>=18.0.0',
      });

      const args: Arguments<CreatePackageOptions> = {
        _: [],
        $0: 'create-package',
        name: '@metamask/new-package',
        description: 'A new MetaMask package.',
        type: PackageTypes.Library,
      };

      await createPackageHandler(args);

      expect(utils.finalizeAndWriteData).toHaveBeenCalledTimes(1);
      expect(utils.finalizeAndWriteData).toHaveBeenCalledWith(
        {
          name: '@metamask/new-package',
          description: 'A new MetaMask package.',
          type: PackageTypes.Library,
          directoryName: 'new-package',
          nodeVersions: '>=18.0.0',
          currentYear: '2023',
        },
        {
          nodeVersions: '>=18.0.0',
        },
      );
    });

    it('should create the expected snap package', async () => {
      vi.mocked(utils.readMonorepoFiles).mockResolvedValue({
        nodeVersions: '>=18.0.0',
      });

      const args: Arguments<CreatePackageOptions> = {
        _: [],
        $0: 'create-package',
        name: '@metamask/new-snap',
        description: 'A new MetaMask snap.',
        type: PackageTypes.Snap,
      };

      await createPackageHandler(args);

      expect(utils.finalizeAndWriteData).toHaveBeenCalledTimes(1);
      expect(utils.finalizeAndWriteData).toHaveBeenCalledWith(
        {
          name: '@metamask/new-snap',
          description: 'A new MetaMask snap.',
          type: PackageTypes.Snap,
          directoryName: 'new-snap',
          nodeVersions: '>=18.0.0',
          currentYear: '2023',
        },
        {
          nodeVersions: '>=18.0.0',
        },
      );
    });
  });
});
