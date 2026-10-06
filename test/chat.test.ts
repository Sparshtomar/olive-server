import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatConversation, ChatMessage, ChatReply } from '@sparshtomar/olive-shared';
import { JPEG, createTestContext, mealInput, multipart, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await createTestContext()));
afterAll(() => t.close());

const TODAY = '2026-10-04';

const ask = (headers: Record<string, string>, text: string, conversationId?: string) =>
  t.app.inject({ method: 'POST', url: '/chat/messages', headers, payload: { text, today: TODAY, conversationId } });

describe('chat', () => {
  it('starts a conversation from the first message and answers in the same request', async () => {
    const { headers } = await t.newUser();
    const res = await ask(headers, 'Is dal good for my cholesterol?');
    expect(res.statusCode).toBe(201);
    const reply = res.json<ChatReply>();
    expect(reply.conversation.title).toBe('Is dal good for my cholesterol?');
    expect(reply.userMessage.role).toBe('user');
    expect(reply.assistantMessage.role).toBe('assistant');
    expect(reply.assistantMessage.content).toBe(t.ai.assistantReply);
    expect(reply.conversation.messageCount).toBe(2);
  });

  it("grounds the assistant in the user's profile, today's meals and lab markers", async () => {
    const { headers } = await t.newUser({ name: 'Riya' });
    await t.app.inject({
      method: 'POST',
      url: '/meals',
      headers,
      payload: mealInput({ date: TODAY, title: 'Dal rice' }),
    });
    await t.app.inject({
      method: 'POST',
      url: '/reports',
      headers,
      payload: {
        title: 'Lipids',
        reportDate: '2026-09-01',
        markers: [{ name: 'LDL Cholesterol', value: 136, unit: 'mg/dL', refLow: null, refHigh: 100 }],
      },
    });
    await ask(headers, 'How am I doing?');
    const ctx = t.ai.lastAssistantInput!.context;
    expect(ctx).toContain('Riya');
    expect(ctx).toContain('Dal rice');
    expect(ctx).toMatch(/LDL.*136 mg\/dL.*HIGH/);
    expect(ctx).toContain('Saturated fat under');
    expect(t.ai.lastAssistantInput!.history).toEqual([]);
  });

  it('continues a conversation with its history, oldest first', async () => {
    const { headers } = await t.newUser();
    const first = (await ask(headers, 'What is HbA1c?')).json<ChatReply>();
    t.ai.assistantReply = 'Aim for under 5.7%.';
    const second = (await ask(headers, 'What should mine be?', first.conversation.id)).json<ChatReply>();
    expect(second.conversation.id).toBe(first.conversation.id);
    expect(t.ai.lastAssistantInput!.history.map((h) => h.role)).toEqual(['user', 'assistant']);
    expect(t.ai.lastAssistantInput!.history[0]!.content).toBe('What is HbA1c?');

    const messages = (
      await t.app.inject({ method: 'GET', url: `/chat/${first.conversation.id}/messages`, headers })
    ).json<ChatMessage[]>();
    expect(messages.map((m) => m.content)).toEqual([
      'What is HbA1c?',
      first.assistantMessage.content,
      'What should mine be?',
      'Aim for under 5.7%.',
    ]);
  });

  it('accepts a photo, stores it apart from the thread and serves it by message id', async () => {
    const { headers } = await t.newUser();
    const body = multipart(JPEG, 'plate.jpg', 'image/jpeg', { text: 'Is this okay for dinner?', today: TODAY });
    const res = await t.app.inject({
      method: 'POST',
      url: '/chat/messages/photo',
      headers: { ...headers, ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(201);
    const reply = res.json<ChatReply>();
    expect(t.ai.lastAssistantInput!.image?.mimeType).toBe('image/jpeg');
    expect(reply.userMessage.imageUrl).toBe(`/chat/attachments/${reply.userMessage.id}`);

    const img = await t.app.inject({ method: 'GET', url: reply.userMessage.imageUrl! });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.rawPayload.equals(JPEG)).toBe(true);
  });

  it('rejects a turn with neither text nor photo, and non-image uploads', async () => {
    const { headers } = await t.newUser();
    expect((await ask(headers, '   ')).statusCode).toBe(400);
    const body = multipart(Buffer.from('%PDF-1.4'), 'x.pdf', 'application/pdf', { text: 'hi', today: TODAY });
    const res = await t.app.inject({
      method: 'POST',
      url: '/chat/messages/photo',
      headers: { ...headers, ...body.headers },
      payload: body.payload,
    });
    expect(res.statusCode).toBe(415);
  });

  it('lists conversations newest first with their last message', async () => {
    const { headers } = await t.newUser();
    await ask(headers, 'First topic');
    t.ai.assistantReply = 'Second answer';
    await ask(headers, 'Second topic');
    const list = (await t.app.inject({ method: 'GET', url: '/chat', headers })).json<ChatConversation[]>();
    expect(list.map((c) => c.title)).toEqual(['Second topic', 'First topic']);
    expect(list[0]!.lastMessage).toBe('Second answer');
  });

  it('keeps conversations private to their owner and deletes them', async () => {
    const a = await t.newUser();
    const b = await t.newUser();
    const { conversation } = (await ask(a.headers, 'Mine')).json<ChatReply>();
    expect(
      (await t.app.inject({ method: 'GET', url: `/chat/${conversation.id}/messages`, headers: b.headers })).statusCode,
    ).toBe(404);
    expect((await ask(b.headers, 'Hijack', conversation.id)).statusCode).toBe(404);
    expect(
      (await t.app.inject({ method: 'DELETE', url: `/chat/${conversation.id}`, headers: b.headers })).statusCode,
    ).toBe(404);
    expect(
      (await t.app.inject({ method: 'DELETE', url: `/chat/${conversation.id}`, headers: a.headers })).statusCode,
    ).toBe(204);
    expect(
      (await t.app.inject({ method: 'DELETE', url: `/chat/${randomUUID()}`, headers: a.headers })).statusCode,
    ).toBe(404);
  });

  it('does not save anything when the model fails', async () => {
    const { headers } = await t.newUser();
    const original = t.ai.healthAssistant.reply;
    t.ai.healthAssistant.reply = async () => {
      throw new Error('boom');
    };
    const res = await ask(headers, 'Will this be saved?');
    t.ai.healthAssistant.reply = original;
    expect(res.statusCode).toBe(500);
    const list = (await t.app.inject({ method: 'GET', url: '/chat', headers })).json<ChatConversation[]>();
    // The conversation shell may exist, but no turn was written.
    expect(list.every((c) => c.messageCount === 0)).toBe(true);
  });
});
