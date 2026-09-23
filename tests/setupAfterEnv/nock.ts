import { disableNetConnect, cleanAll, enableNetConnect } from 'nock';

// `disableNetConnect` blocks *all* outbound connections, including hosts that
// test suites intentionally run themselves. Allow loopback so suites that
// start a local server (e.g. a mock RPC) still work; external hosts stay
// blocked, which is the protection this setup exists for.
const LOCALHOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;

beforeEach(() => {
  disableNetConnect();
  enableNetConnect(LOCALHOST);
});

afterEach(() => {
  cleanAll();
  enableNetConnect();
});
