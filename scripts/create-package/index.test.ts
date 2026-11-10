import cli from './cli';
import { commands } from './commands';

vi.mock('./cli');

describe('create-package/index', () => {
  let originalProcess: typeof globalThis.process;
  beforeEach(() => {
    originalProcess = globalThis.process;
    globalThis.process = { ...globalThis.process };
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  it('executes the CLI application', async () => {
    const mock = vi.mocked(cli);
    mock.mockRejectedValue('foo');

    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Node16 resolution requires the `.js` specifier for this dynamic import.
    // eslint-disable-next-line import-x/no-useless-path-segments
    await import('./index.js');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cli).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledWith(process.argv, commands);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('foo');
    expect(process.exitCode).toBe(1);
  });
});
