import execa from 'execa';
import fs from 'fs';
import path from 'path';

import { MonorepoFiles } from './constants';
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
      (fs.promises.readFile as jest.Mock).mockImplementation(
        async (filePath: string) => {
          switch (path.basename(filePath)) {
            case MonorepoFiles.PackageJson:
              return packageJson;
            default:
              throw new Error(`Unexpected file: ${path.basename(filePath)}`);
          }
        },
      );

      const monorepoFileData = await readMonorepoFiles();

      expect(monorepoFileData).toStrictEqual({
        nodeVersions: '>=18.0.0',
      });
    });
  });

  describe('finalizeAndWriteData', () => {
    it('should write the expected files', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        type: 'library',
        directoryName: 'foo',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
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

      await finalizeAndWriteData(packageData);

      // processTemplateFiles and writeFiles
      expect(fsUtils.readAllFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.readAllFiles).toHaveBeenCalledWith(
        expect.stringMatching(/\/package-template$/u),
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

      expect(fs.promises.writeFile).not.toHaveBeenCalled();

      // Postprocessing
      expect(execa).toHaveBeenCalledTimes(2);
      expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
        cwd: expect.any(String),
      });
      expect(execa).toHaveBeenCalledWith('yarn', ['readme-content:update'], {
        cwd: expect.any(String),
      });
    });

    it('throws if the package directory already exists', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        type: 'library',
        directoryName: 'foo',
        nodeVersions: '20.0.0',
        currentYear: '2023',
      };

      (fs.promises.stat as jest.Mock).mockResolvedValue({});

      await expect(finalizeAndWriteData(packageData)).rejects.toThrow(
        /^The package directory already exists:/u,
      );

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
        type: 'library',
        directoryName: 'foo',
        nodeVersions: '20.0.0',
        currentYear: '2023',
      };

      await expect(finalizeAndWriteData(packageData)).rejects.toThrow(
        'Permission denied',
      );
    });

    it('uses the Snap template without library-only files', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo-snap',
        description: 'A foo Snap.',
        type: 'snap',
        proposedName: 'Foo Snap',
        directoryName: 'foo-snap',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
      };
      const notFound = new Error('Not found') as NodeJS.ErrnoException;
      notFound.code = 'ENOENT';
      jest.spyOn(fs.promises, 'stat').mockRejectedValue(notFound);
      (fsUtils.readAllFiles as jest.Mock)
        .mockResolvedValueOnce({
          'src/index.ts': 'library',
          'src/index.test.ts': 'library test',
          'tsconfig.build.json': 'library build',
          'typedoc.json': 'library docs',
          LICENSE: 'CURRENT_YEAR',
        })
        .mockResolvedValueOnce({
          'src/index.tsx': 'snap',
          'src/index.test.tsx': 'snap test',
          'snap.config.ts': 'snap config',
          'snap.manifest.json': 'PROPOSED_NAME PACKAGE_NAME',
        });

      await finalizeAndWriteData(packageData);

      expect(fsUtils.readAllFiles).toHaveBeenCalledTimes(2);
      expect(fsUtils.readAllFiles).toHaveBeenLastCalledWith(
        expect.stringMatching(/\/snap-package-template$/u),
      );
      expect(fsUtils.writeFiles).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/foo-snap$/u),
        {
          LICENSE: '2023',
          'snap.config.ts': 'snap config',
          'snap.manifest.json': 'Foo Snap @metamask/foo-snap',
          'src/index.test.tsx': 'snap test',
          'src/index.tsx': 'snap',
        },
      );
    });

    it('rejects a proposed-name placeholder for non-Snap package data', async () => {
      const notFound = new Error('Not found') as NodeJS.ErrnoException;
      notFound.code = 'ENOENT';
      jest.spyOn(fs.promises, 'stat').mockRejectedValue(notFound);
      (fsUtils.readAllFiles as jest.Mock).mockResolvedValue({
        'invalid.file': 'PROPOSED_NAME',
      });

      await expect(
        finalizeAndWriteData({
          name: '@metamask/foo',
          description: 'A foo library.',
          type: 'library',
          directoryName: 'foo',
          nodeVersions: '>=18.0.0',
          currentYear: '2023',
        }),
      ).rejects.toThrow('Snap package data must include a proposed name.');
    });
  });
});
