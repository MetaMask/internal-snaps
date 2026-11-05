import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bump Vitest coverage thresholds up to the measured floor.
 *
 * `jest-it-up` only understands Jest config. The package `coverage:ratchet`
 * script skips this in CI, and this never lowers a threshold.
 */

const packageRoot = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(packageRoot, '../vitest.config.mts');
const summaryPath = resolve(packageRoot, '../coverage/coverage-summary.json');
const metrics = ['branches', 'functions', 'lines', 'statements'];

const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
let config = await readFile(configPath, 'utf8');
const thresholdsMatch = config.match(/thresholds:\s*\{[^}]+\}/u);

if (!thresholdsMatch) {
  throw new Error(`Could not find coverage thresholds in ${configPath}`);
}

let thresholdsBlock = thresholdsMatch[0];
let changed = false;

for (const metric of metrics) {
  const measured = summary.total?.[metric]?.pct;
  if (typeof measured !== 'number') {
    throw new Error(`Coverage summary is missing total.${metric}.pct`);
  }

  const floor = Math.floor(measured * 100) / 100;
  const metricPattern = new RegExp(`(${metric}:\\s*)(\\d+(?:\\.\\d+)?)`, 'u');
  const currentMatch = thresholdsBlock.match(metricPattern);
  if (!currentMatch) {
    throw new Error(`Could not find ${metric} in coverage thresholds`);
  }

  const current = Number(currentMatch[2]);
  if (floor > current) {
    thresholdsBlock = thresholdsBlock.replace(
      metricPattern,
      `$1${String(floor)}`,
    );
    changed = true;
  }
}

if (changed) {
  config = config.replace(thresholdsMatch[0], thresholdsBlock);
  await writeFile(configPath, config);
}
