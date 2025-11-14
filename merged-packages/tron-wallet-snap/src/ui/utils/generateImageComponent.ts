import { getImageComponent } from '@metamask/snaps-sdk';

import questionMarkSvg from '../../../images/question-mark.svg';

/**
 * Generate an SVG image component for a given image URL, with fallback.
 *
 * @param imageUrl - The image URL to render.
 * @param width - The desired width.
 * @param height - The desired height.
 * @returns A promise resolving to an SVG string.
 */
export async function generateImageComponent(
  imageUrl?: string,
  width = 48,
  height = 48,
): Promise<string> {
  if (!imageUrl) {
    return questionMarkSvg;
  }

  try {
    const image = await getImageComponent(imageUrl, { width, height });
    return image.value;
  } catch {
    return questionMarkSvg;
  }
}
