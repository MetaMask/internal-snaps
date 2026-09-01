import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { Box, Text, Bold } from '@metamask/snaps-sdk/jsx';

/** Handle incoming JSON-RPC requests sent to the Snap. */
export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  if (request.method !== 'hello') {
    throw new Error('Method not found.');
  }

  return snap.request({
    method: 'snap_dialog',
    params: {
      type: 'confirmation',
      content: (
        <Box>
          <Text>
            Hello, <Bold>{origin}</Bold>!
          </Text>
        </Box>
      ),
    },
  });
};
