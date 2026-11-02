const MAX_FRAME_BYTES = 3 * 1024 * 1024;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function validateFrame(payload) {
  if (!payload || typeof payload.image !== 'string') {
    return { valid: false, error: 'Frame must include a base64 JPEG image.' };
  }

  const match = payload.image.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/);
  if (!match || !BASE64_PATTERN.test(match[2])) {
    return { valid: false, error: 'Frame must be a valid JPEG or PNG data URL.' };
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_FRAME_BYTES) {
    return { valid: false, error: 'Frame is empty or exceeds the 3 MB limit.' };
  }
  const isJpeg = match[1] === 'image/jpeg'
    && buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = match[1] === 'image/png'
    && buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isJpeg && !isPng) {
    return { valid: false, error: 'Frame content does not match its image type.' };
  }

  return { valid: true, buffer };
}
