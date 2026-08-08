import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {boolean} snapsOnly - When true, select snap workspaces; otherwise libraries.
 * @returns {string[]} Workspace names
 */
function listWorkspaceNames(snapsOnly) {
  const list = spawnSync('yarn', ['workspaces', 'list', '--json'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  });

  if (list.status !== 0) {
    console.error(list.stderr || list.stdout);
    process.exit(list.status ?? 1);
  }

  return list.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((workspace) => workspace.location !== '.')
    .filter((workspace) => {
      const isSnap = existsSync(
        join(root, workspace.location, 'snap.manifest.json'),
      );
      return snapsOnly ? isSnap : !isSnap;
    })
    .map((workspace) => workspace.name);
}

const snapsOnly = process.argv.includes('--snaps');
const names = listWorkspaceNames(snapsOnly);
const label = snapsOnly ? 'snaps' : 'libraries';

if (names.length === 0) {
  console.log(`No ${label} workspaces to build.`);
  process.exit(0);
}

console.log(`Building ${label}: ${names.join(', ')}`);

const result = spawnSync(
  'yarn',
  [
    'workspaces',
    'foreach',
    '--all',
    '--topological-dev',
    '--parallel',
    '--interlaced',
    '--verbose',
    ...names.flatMap((name) => ['--include', name]),
    'run',
    'build',
  ],
  { cwd: root, stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 1);
