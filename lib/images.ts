export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Kind = 'png' | 'webp' | 'jpeg';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Identify the real format from the first bytes, not from the file name or reported type. */
export function sniff(b: Buffer): Kind | null {
  if (b.length > 8 && b.subarray(0, 8).equals(PNG_MAGIC)) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  return null;
}

export class ImageError extends Error {}

/** Returns PNG bytes. WebP and JPEG are converted (transparency kept, EXIF rotation applied). */
export async function toPng(input: Buffer): Promise<{ png: Buffer; converted: 'WebP' | 'JPEG' | null }> {
  const kind = sniff(input);
  if (!kind) throw new ImageError('Only PNG, WebP and JPEG images are supported.');
  let png = input;
  let converted: 'WebP' | 'JPEG' | null = null;
  if (kind !== 'png') {
    try {
      const sharp = (await import('sharp')).default;
      png = await sharp(input).rotate().png({ compressionLevel: 9 }).toBuffer();
      converted = kind === 'webp' ? 'WebP' : 'JPEG';
    } catch {
      throw new ImageError(`Could not read that ${kind === 'webp' ? 'WebP' : 'JPEG'} file. It may be damaged.`);
    }
  }
  if (png.length > MAX_IMAGE_BYTES) throw new ImageError('The PNG is larger than 5 MB. Use a smaller image.');
  return { png, converted };
}
