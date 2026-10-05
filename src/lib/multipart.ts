import type { FastifyRequest } from 'fastify';
import { fileTooLarge, validation } from './errors';

export interface UploadedFile {
  data: Buffer;
  mimeType: string;
  fields: Record<string, string>;
}

/** Reads the single file part of a multipart request into memory, enforcing a size limit. */
export const readUpload = async (request: FastifyRequest, maxMb: number): Promise<UploadedFile> => {
  if (!request.isMultipart()) throw validation('Expected a multipart upload with a "file" field');

  const part = await request.file({ limits: { fileSize: maxMb * 1024 * 1024, files: 1 } });
  if (!part) throw validation('No file was uploaded');

  let data: Buffer;
  try {
    data = await part.toBuffer();
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw fileTooLarge(maxMb);
    throw err;
  }
  if (data.length === 0) throw validation('The uploaded file is empty');

  const fields: Record<string, string> = {};
  for (const [name, field] of Object.entries(part.fields)) {
    if (field && !Array.isArray(field) && field.type === 'field') fields[name] = String(field.value);
  }
  return { data, mimeType: part.mimetype, fields };
};
