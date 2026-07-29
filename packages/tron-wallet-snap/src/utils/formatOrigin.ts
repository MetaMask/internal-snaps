/**
 * Formats an origin for display purposes.
 *
 * @param origin - The origin string to format (e.g., 'metamask', 'https://example.com').
 * @returns The formatted origin string (e.g., 'MetaMask', 'example.com').
 */
export function formatOrigin(origin: string | undefined): string {
  if (!origin) {
    return 'Unknown';
  }

  // Special case: format 'metamask' as 'MetaMask' (case-insensitive)
  if (origin.toLowerCase() === 'metamask') {
    return 'MetaMask';
  }

  // Try to extract hostname from URL
  try {
    return new URL(origin).hostname;
  } catch {
    // If not a valid URL, return the original value
    // This shouldn't happen if validation is working correctly
    return origin;
  }
}
