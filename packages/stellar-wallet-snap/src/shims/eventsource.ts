/* eslint-disable @typescript-eslint/no-shadow -- EventSource is a shim */
export class EventSource {
  constructor() {
    throw new Error('Horizon streaming is not supported in this Snap');
  }

  close(): void {
    // no-op
  }
}
/* eslint-enable @typescript-eslint/no-shadow */
