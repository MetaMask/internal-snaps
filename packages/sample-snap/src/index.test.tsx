import type { SnapConfirmationInterface } from '@metamask/snaps-jest';
import { installSnap } from '@metamask/snaps-jest';
import { Box, Text as SnapText, Bold } from '@metamask/snaps-sdk/jsx';

describe('onRpcRequest', () => {
  describe('hello', () => {
    it('shows a confirmation dialog', async () => {
      const snap = await installSnap();

      const origin = 'Jest';
      const response = snap.request({
        method: 'hello',
        origin,
      });

      const ui = (await response.getInterface()) as SnapConfirmationInterface;
      expect(ui.type).toBe('confirmation');
      expect(ui).toRender(
        <Box>
          <SnapText>
            Hello, <Bold>{origin}</Bold>!
          </SnapText>
          <SnapText>
            This custom confirmation is just for display purposes.
          </SnapText>
          <SnapText>
            But you can edit the snap source code to make it do something, if
            you want to!
          </SnapText>
        </Box>,
      );

      await ui.ok();

      expect(await response).toRespondWith(true);
    });
  });

  it('throws an error if the requested method does not exist', async () => {
    const snap = await installSnap();

    const response = await snap.request({
      method: 'foo',
    });

    expect(response).toRespondWithError({
      code: -32603,
      message: 'Method not found.',
      stack: expect.any(String),
    });
  });
});
