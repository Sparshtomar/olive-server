import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CHAT_MESSAGE_MAX, DATE_KEY_REGEX, sendChatMessageSchema } from '@sparshtomar/olive-shared';
import { unsupportedFile, validation } from '../../lib/errors';
import { detectImageType, isHeic } from '../../lib/files';
import { readUpload } from '../../lib/multipart';
import type { ChatService } from './chat.service';

const idParams = z.object({ id: z.uuid() });

/** Every turn is a model call; keep one user from draining the quota. */
const AI_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export const chatRoutes: FastifyPluginAsyncZod<{ chat: ChatService }> = async (app, { chat }) => {
  app.get('/chat', async (request) => chat.list(request.user.id));

  app.get('/chat/:id/messages', { schema: { params: idParams } }, async (request) =>
    chat.messages(request.user.id, request.params.id),
  );

  app.post(
    '/chat/messages',
    { schema: { body: sendChatMessageSchema }, config: AI_RATE_LIMIT },
    async (request, reply) => {
      const { conversationId, text, today } = request.body;
      return reply.status(201).send(await chat.ask(request.user, { conversationId, text, today }));
    },
  );

  // Same turn with a photo: multipart, fields `text`, `today`, optional `conversationId`.
  app.post('/chat/messages/photo', { config: AI_RATE_LIMIT }, async (request, reply) => {
    const { data, fields } = await readUpload(request, 8);
    const mimeType = detectImageType(data) ?? (isHeic(data) ? 'image/heic' : undefined);
    if (!mimeType) throw unsupportedFile('That file is not a photo Olive can read');
    const parsed = sendChatMessageSchema.safeParse({
      conversationId: fields.conversationId || undefined,
      text: (fields.text ?? '').slice(0, CHAT_MESSAGE_MAX),
      today: fields.today,
    });
    if (!parsed.success) throw validation(`today must match ${DATE_KEY_REGEX}`);
    return reply.status(201).send(await chat.ask(request.user, { ...parsed.data, image: { data, mimeType } }));
  });

  app.delete('/chat/:id', { schema: { params: idParams } }, async (request, reply) => {
    await chat.delete(request.user.id, request.params.id);
    return reply.status(204).send();
  });
};

/** Images are referenced by <Image> tags, which can't send auth headers; the message id is unguessable. */
export const chatAttachmentRoutes: FastifyPluginAsyncZod<{ chat: ChatService }> = async (app, { chat }) => {
  app.get('/chat/attachments/:id', { schema: { params: idParams } }, async (request, reply) => {
    const file = await chat.attachment(request.params.id);
    return reply
      .header('content-type', file.mimeType)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(file.data);
  });
};
