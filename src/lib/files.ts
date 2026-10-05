/**
 * Content sniffing by magic bytes. Client-sent Content-Type headers and file
 * extensions are hints, not facts — these checks decide what a file really is.
 */

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export const detectImageType = (buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | undefined => {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return undefined;
};

export const isPdf = (buf: Buffer) => startsWith(buf, [0x25, 0x50, 0x44, 0x46]); // %PDF

/** Encrypted PDFs carry an /Encrypt dictionary in the trailer; the model can't read them. */
export const isEncryptedPdf = (buf: Buffer) => isPdf(buf) && buf.includes('/Encrypt');

const HEIC_BRANDS = ['heic', 'heix', 'mif1', 'msf1'];
export const isHeic = (buf: Buffer) =>
  buf.subarray(4, 8).toString('latin1') === 'ftyp' && HEIC_BRANDS.includes(buf.subarray(8, 12).toString('latin1'));

/** Audio formats Gemini accepts, mapped from what phones and browsers record. */
export const detectAudioType = (buf: Buffer, declared: string): string | undefined => {
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4'; // m4a / aac in mp4
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm'; // Chrome MediaRecorder
  if (startsWith(buf, [0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46])) return 'audio/wav';
  if (startsWith(buf, [0x49, 0x44, 0x33]) || startsWith(buf, [0xff, 0xfb])) return 'audio/mp3';
  if (startsWith(buf, [0x23, 0x21, 0x41, 0x4d, 0x52])) return 'audio/amr'; // #!AMR
  return declared.startsWith('audio/') ? declared : undefined;
};
