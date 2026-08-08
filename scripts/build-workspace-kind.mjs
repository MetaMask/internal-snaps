import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Run a command and resolve with its exit code.
 *
 * @param {string} command - Executable to run.
 * @param {string[]} args - Arguments.
 * @param {{ cwd?: string, stdio?: 'inherit' | 'pipe' }} [options] - Spawn options.
 * @returns {Promise<number>} Exit code.
 */
async function run(command, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      stdio: options.stdio ?? 'inherit',
      shell: true,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise(code ?? 1);
    });
  });
}

/**
 * Returns true when a file exists.
 *
 * @param {string} filePath - Absolute path to check.
 * @returns {Promise<boolean>} Whether the file exists.
 */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List workspace package names filtered to snaps or libraries.
 *
 * @param {boolean} snapsOnly - When true, select snap workspaces; otherwise libraries.
 * @returns {Promise<string[]>} Workspace package names.
 */
async function listWorkspaceNames(snapsOnly) {
  const list = spawn('yarn', ['workspaces', 'list', '--json'], {
    cwd: root,
    shell: true,
  });

  let stdout = '';
  let stderr = '';
  list.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  list.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const status = await new Promise((resolvePromise, reject) => {
    list.on('error', reject);
    list.on('close', (code) => {
      resolvePromise(code ?? 1);
    });
  });

  if (status !== 0) {
    throw new Error(stderr || stdout || 'yarn workspaces list failed');
  }

  const workspaces = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((workspace) => workspace.location !== '.');

  const selected = [];
  for (const workspace of workspaces) {
    const isSnap = await fileExists(
      join(root, workspace.location, 'snap.manifest.json'),
    );
    if (snapsOnly ? isSnap : !isSnap) {
      selected.push(workspace.name);
    }
  }
  return selected;
}

const snapsOnly = process.argv.includes('--snaps');
const label = snapsOnly ? 'snaps' : 'libraries';

const names = await listWorkspaceNames(snapsOnly);

if (names.length === 0) {
  console.log(`No ${label} workspaces to build.`);
} else {
  console.log(`Building ${label}: ${names.join(', ')}`);
  const code = await run('yarn', [
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
  ]);
  if (code !== 0) {
    throw new Error(`Failed to build ${label} (exit ${code})`);
  }
}
