import { getDefaultConfiguration } from '@metamask/snaps-cli';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import webpack from 'webpack';

import snapConfig from '../snap.config';

const packageDir = resolve(__dirname, '..');
const sesEntry = createRequire(import.meta.url).resolve('ses');

/**
 * Compile `src/index.ts` with Webpack + `snap.config.ts` into a temporary
 * directory without modifying `dist/` or `snap.manifest.json`.
 *
 * @returns The compiled bundle source and a cleanup callback.
 */
async function buildTempBundle(): Promise<{
  bundleCode: string;
  cleanup: () => void;
}> {
  const tempDir = mkdtempSync(join(tmpdir(), 'braze-snap-ses-'));

  try {
    const baseConfig = await getDefaultConfiguration(
      {
        input: resolve(packageDir, 'src/index.ts'),
        sourceMap: false,
        evaluate: false,
        output: {
          path: tempDir,
          filename: 'bundle.js',
          clean: false,
          minimize: true,
        },
        manifest: {
          path: resolve(packageDir, 'snap.manifest.json'),
          update: false,
        },
        server: { enabled: false, root: packageDir, port: 8080 },
        environment: {},
        stats: {
          verbose: false,
          builtIns: false,
          buffer: false,
        },
        polyfills: false,
        preinstalled: {
          hideSnapBranding: true,
          hidden: true,
          removable: false,
        },
        typescript: {
          enabled: false,
          configFile: resolve(packageDir, 'tsconfig.json'),
        },
        features: { images: false },
        experimental: { wasm: false },
        customizeWebpackConfig: snapConfig.customizeWebpackConfig,
      } as unknown as Parameters<typeof getDefaultConfiguration>[0],
      { evaluate: false },
    );

    const finalConfig = snapConfig.customizeWebpackConfig
      ? snapConfig.customizeWebpackConfig(baseConfig)
      : baseConfig;

    await new Promise<void>((resolveBuild, rejectBuild) => {
      webpack(finalConfig).run((error, stats) => {
        if (error) {
          rejectBuild(error);
          return;
        }
        if (stats?.hasErrors()) {
          rejectBuild(new Error(stats.toString()));
          return;
        }
        resolveBuild();
      });
    });

    const bundleCode = readFileSync(join(tempDir, 'bundle.js'), 'utf8');
    return {
      bundleCode,
      cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Execute an inline ESM script in a fresh Node process with `bundleCode` piped
 * on stdin so SES `lockdown()` stays isolated from Vitest's worker heap.
 *
 * @param runnerScript - The script to evaluate.
 * @param bundleCode - The compiled Snap bundle passed via stdin.
 * @returns The stdout output of the runner script.
 */
async function runInIsolatedNode(
  runnerScript: string,
  bundleCode: string,
): Promise<string> {
  return new Promise((resolveExec, rejectExec) => {
    const child = execFile(
      process.execPath,
      ['--input-type=module', '-e', runnerScript],
      { env: { ...process.env } },
      (error, stdout, stderr) => {
        if (error) {
          rejectExec(new Error(`${error.message}\n${stderr}`));
          return;
        }
        resolveExec(stdout);
      },
    );
    child.stdin?.end(bundleCode);
  });
}

describe('SES Compartment runtime', () => {
  it('runs the bundled snap inside SES lockdown and across simulated idle teardowns', async () => {
    const { bundleCode, cleanup } = await buildTempBundle();

    try {
      const runnerScript = `
        import { pathToFileURL } from 'node:url';
        import { webcrypto } from 'node:crypto';
        import fs from 'node:fs';

        await import(pathToFileURL(${JSON.stringify(sesEntry)}).href);
        lockdown();

        const bundleCode = fs.readFileSync(0, 'utf8');
        const state = new Map();
        const requests = [];

        function runInCompartment(runFn) {
          const activeTimeouts = new Set();
          const activeIntervals = new Set();

          const attenuatedSetTimeout = harden((handler, ms, ...args) => {
            const id = setTimeout(() => {
              activeTimeouts.delete(id);
              handler(...args);
            }, Math.max(10, ms ?? 0));
            activeTimeouts.add(id);
            return id;
          });
          const attenuatedClearTimeout = harden((id) => {
            activeTimeouts.delete(id);
            clearTimeout(id);
          });
          const attenuatedSetInterval = harden((handler, ms, ...args) => {
            const id = setInterval(handler, Math.max(10, ms ?? 0), ...args);
            activeIntervals.add(id);
            return id;
          });
          const attenuatedClearInterval = harden((id) => {
            activeIntervals.delete(id);
            clearInterval(id);
          });
          const idleTeardown = () => {
            for (const id of activeTimeouts) clearTimeout(id);
            activeTimeouts.clear();
            for (const id of activeIntervals) clearInterval(id);
            activeIntervals.clear();
          };

          const endowments = {
            console,
            crypto: harden(webcrypto),
            SubtleCrypto: harden(webcrypto.SubtleCrypto),
            Date,
            Math,
            BigInt,
            URL,
            URLSearchParams,
            TextEncoder,
            TextDecoder,
            AbortController,
            AbortSignal,
            Blob,
            ArrayBuffer,
            DataView,
            Uint8Array,
            Uint16Array,
            Uint32Array,
            Int8Array,
            Int16Array,
            Int32Array,
            Float32Array,
            Float64Array,
            Uint8ClampedArray,
            BigInt64Array,
            BigUint64Array,
            Intl,
            isSecureContext: true,
            atob: harden((value) => globalThis.atob(value)),
            btoa: harden((value) => globalThis.btoa(value)),
            setTimeout: attenuatedSetTimeout,
            clearTimeout: attenuatedClearTimeout,
            setInterval: attenuatedSetInterval,
            clearInterval: attenuatedClearInterval,
            fetch: harden(async (url, init) => {
              requests.push({
                url: String(url),
                method: init?.method,
                body: JSON.parse(String(init?.body ?? '{}')),
              });
              return new Response('{}', { status: 200 });
            }),
            snap: harden({
              request: async ({ method, params }) => {
                if (method === 'snap_getState') {
                  return state.get(params.key) ?? null;
                }
                if (method === 'snap_setState') {
                  state.set(params.key, params.value);
                  return null;
                }
                throw new Error('Unexpected snap method: ' + method);
              },
            }),
          };

          const snapModule = { exports: {} };
          const compartment = new Compartment({
            ...endowments,
            module: snapModule,
            exports: snapModule.exports,
          });
          compartment.globalThis.self = compartment.globalThis;
          compartment.globalThis.global = compartment.globalThis;
          compartment.globalThis.window = compartment.globalThis;
          compartment.evaluate(bundleCode);

          return runFn(snapModule.exports.onClientRequest, idleTeardown);
        }

        const params = {
          profileId: 'profile-ses',
          language: 'fr',
          config: {
            apiKey: '00000000-0000-0000-0000-000000000000',
            endpoint: 'sdk.iad-01.braze.com',
            appVersion: '13.0.0',
          },
        };

        const results = [];
        await runInCompartment(async (onClientRequest, idleTeardown) => {
          results.push(
            await onClientRequest({
              request: { jsonrpc: '2.0', id: 1, method: 'syncUser', params },
            }),
          );
          idleTeardown();
          results.push(
            await onClientRequest({
              request: { jsonrpc: '2.0', id: 2, method: 'syncUser', params },
            }),
          );
          idleTeardown();
        });

        await runInCompartment(async (onClientRequest, idleTeardown) => {
          results.push(
            await onClientRequest({
              request: { jsonrpc: '2.0', id: 3, method: 'syncUser', params },
            }),
          );
          idleTeardown();
        });

        process.stdout.write(
          JSON.stringify({
            results,
            requests,
            persisted: state.get('braze'),
          }),
        );
      `;

      const stdout = await runInIsolatedNode(runnerScript, bundleCode);
      const output = JSON.parse(stdout) as {
        results: { flushed: boolean }[];
        requests: {
          url: string;
          method: string;
          body: { attributes?: unknown[]; events?: { name: string }[] };
        }[];
        persisted: {
          version: number;
          items: Record<string, string>;
          appliedLanguage?: { profileId: string; language: string };
        };
      };

      expect(output.results).toStrictEqual([
        { flushed: true },
        { flushed: true },
        { flushed: true },
      ]);
      expect(output.requests).toHaveLength(1);
      expect(output.requests[0]?.url).toBe(
        'https://sdk.iad-01.braze.com/api/v3/data/',
      );
      expect(
        output.requests[0]?.body.events?.map((event) => event.name),
      ).toContain('ss');
      expect(output.requests[0]?.body.attributes).toStrictEqual([
        { user_id: 'profile-ses', language: 'fr' },
      ]);
      expect(output.persisted.appliedLanguage).toStrictEqual({
        profileId: 'profile-ses',
        language: 'fr',
      });
      expect(Object.keys(output.persisted.items)).toStrictEqual(
        expect.arrayContaining([
          'ab.storage.deviceId.00000000-0000-0000-0000-000000000000',
          'ab.storage.userId.00000000-0000-0000-0000-000000000000',
          'ab.storage.sessionId.00000000-0000-0000-0000-000000000000',
        ]),
      );
    } finally {
      cleanup();
    }
  }, 30_000);
});
