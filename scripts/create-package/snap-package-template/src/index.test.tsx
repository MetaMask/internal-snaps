import type { SnapConfirmationInterface } from '@metamask/snaps-jest';
import { installSnap } from '@metamask/snaps-jest';
import { Box, Text, Bold } from '@metamask/snaps-sdk/jsx';

describe('onRpcRequest', () => {
  it('handles the hello method', async () => {
    const snap = await installSnap();
    const response = snap.request({ method: 'hello', origin: 'Jest' });
    const ui = (await response.getInterface()) as SnapConfirmationInterface;

    expect(ui).toRender(
      <Box>
        <Text>
          Hello, <Bold>Jest</Bold>!
        </Text>
      </Box>,
    );
    await ui.ok();
    expect(await response).toRespondWith(true);
  });
});
