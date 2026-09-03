import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { Box, Text as SnapText, Bold } from '@metamask/snaps-sdk/jsx';

/**
 * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that
 * invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * @returns The result of `snap_dialog`.
 * @throws If the request method is not valid for this snap.
 */
export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  switch (request.method) {
    case 'hello':
      return snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: (
            <Box>
              <SnapText>
                Hello, <Bold>{origin}</Bold>!
              </SnapText>
              <SnapText>
                This custom confirmation is just for display purposes.
              </SnapText>
              <SnapText>
                But you can edit the snap source code to make it do something,
                if you want to!
              </SnapText>
            </Box>
          ),
        },
      });
    default:
      throw new Error('Method not found.');
  }
};
