import execa from 'execa';
import fs from 'fs';

import { PackageTypes, TemplateDirectories } from './constants';
import * as fsUtils from './fs-utils';
import type { PackageData } from './utils';
import { finalizeAndWriteData, readMonorepoFiles } from './utils';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.mock('execa', () => jest.fn());

jest.mock('./fs-utils', () => ({
  readAllFiles: jest.fn(),
  writeFiles: jest.fn(),
}));

describe('create-package/utils', () => {
  describe('readMonorepoFiles', () => {
    const packageJson = JSON.stringify({
      engines: { node: '>=18.0.0' },
    });

    it('should read the expected monorepo files', async () => {
      (fs.promises.readFile as jest.Mock).mockResolvedValue(packageJson);

      const monorepoFileData = await readMonorepoFiles();

      expect(monorepoFileData).toStrictEqual({
        nodeVersions: '>=18.0.0',
      });
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringMatching(/package\.json$/u),
        'utf-8',
      );
    });
  });

  describe('finalizeAndWriteData', () => {
    it('should write the expected files for a library package', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        type: PackageTypes.Library,
        directoryName: 'foo',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        nodeVersions: '>=18.0.0',
      };

      const mockError = new Error('Not found') as NodeJS.ErrnoException;
      mockError.code = 'ENOENT';

      jest.spyOn(fs.promises, 'stat').mockRejectedValue(mockError);

      (fsUtils.readAllFiles as jest.Mock).mockResolvedValueOnce({
        'src/index.ts': 'export default 42;',
        'src/index.test.ts': 'export default 42;',
        'mock1.file':
          'CURRENT_YEAR NODE_VERSIONS PACKAGE_NAME PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
        'mock2.file': 'CURRENT_YEAR NODE_VERSIONS PACKAGE_NAME',
        'mock3.file': 'PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
      });

      await finalizeAndWriteData(packageData, monorepoFileData);

      // processTemplateFiles and writeFiles
      expect(fsUtils.readAllFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.readAllFiles).toHaveBeenCalledWith(
        expect.stringMatching(/\/library-template$/u),
      );

      expect(fsUtils.writeFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.writeFiles).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/foo$/u),
        {
          'src/index.ts': 'export default 42;',
          'src/index.test.ts': 'export default 42;',
          'mock1.file': '2023 >=18.0.0 @metamask/foo A foo package. foo',
          'mock2.file': '2023 >=18.0.0 @metamask/foo',
          'mock3.file': 'A foo package. foo',
        },
      );

      // Postprocessing
      expect(execa).toHaveBeenCalledTimes(2);
      expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
        cwd: expect.any(String),
      });
      expect(execa).toHaveBeenCalledWith('yarn', ['readme-content:update'], {
        cwd: expect.any(String),
      });
    });

    it('should read the template files for a snap package from the snap template', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo-snap',
        description: 'A foo snap.',
        type: PackageTypes.Snap,
        directoryName: 'foo-snap',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        nodeVersions: '>=18.0.0',
      };

      const mockError = new Error('Not found') as NodeJS.ErrnoException;
      mockError.code = 'ENOENT';

      jest.spyOn(fs.promises, 'stat').mockRejectedValue(mockError);

      (fsUtils.readAllFiles as jest.Mock).mockResolvedValueOnce({
        'src/index.tsx': 'export default 42;',
      });

      await finalizeAndWriteData(packageData, monorepoFileData);

      expect(fsUtils.readAllFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.readAllFiles).toHaveBeenCalledWith(
        expect.stringMatching(/\/snap-template$/u),
      );
      expect(fsUtils.writeFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.writeFiles).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/foo-snap$/u),
        {
          'src/index.tsx': 'export default 42;',
        },
      );
    });

    it('throws if the package directory already exists', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        type: PackageTypes.Library,
        directoryName: 'foo',
        nodeVersions: '20.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        nodeVersions: '20.0.0',
      };

      (fs.promises.stat as jest.Mock).mockResolvedValue({});

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow(/^The package directory already exists:/u);

      expect(fs.promises.mkdir).not.toHaveBeenCalled();
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('throws if fs.stat fails with an error other than ENOENT', async () => {
      const mockError = new Error('Permission denied') as NodeJS.ErrnoException;
      mockError.code = 'EACCES';

      jest.spyOn(fs.promises, 'stat').mockRejectedValue(mockError);

      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        type: PackageTypes.Library,
        directoryName: 'foo',
        nodeVersions: '20.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        nodeVersions: '20.0.0',
      };

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow('Permission denied');
    });
  });
});

describe('create-package/constants', () => {
  it('should have a template directory for every package type', () => {
    expect(TemplateDirectories).toStrictEqual({
      snap: 'snap-template',
      library: 'library-template',
    });
  });
});
