import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GroqMealAnalyzer } from '../src/ai/groq/groq-analyzers';
import { GroqClient } from '../src/ai/groq/groq-client';
import { AppError } from '../src/lib/errors';

const silent = { info() {}, warn() {}, error() {}, child: () => silent } as never;
const schema = z.object({ reply: z.string() });

type Reply = { status: number; body: unknown } | Error;
/** Scripted fetch: each call takes the next reply. Returns the request bodies it saw. */
const scriptFetch = (replies: Reply[]) => {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
      const next = replies.shift();
      if (!next) throw new Error('unexpected fetch');
      if (next instanceof Error) throw next;
      return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
        status: next.status,
      });
    }),
  );
  return calls;
};
const completion = (content: string) => ({ status: 200, body: { choices: [{ message: { content } }] } });

afterEach(() => vi.unstubAllGlobals());

describe('GroqClient', () => {
  it('returns the first schema-valid answer and strips a stray code fence', async () => {
    const calls = scriptFetch([completion('```json\n{"reply":"hi"}\n```')]);
    const client = new GroqClient('k', ['qwen/qwen3.8-27b'], silent);
    await expect(
      client.generateJson({ system: 's', messages: [{ role: 'user', content: 'q' }], schema }),
    ).resolves.toEqual({ reply: 'hi' });
    const body = calls[0]!.body as { messages: { role: string; content: string }[]; response_format: unknown };
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0]!.content).toContain('"reply"'); // schema spelled out for the model
  });

  it('falls through on rate limits and schema-invalid answers, then gives up with a stable error', async () => {
    scriptFetch([{ status: 429, body: 'slow down' }, completion('{"nope":1}'), completion('not json')]);
    const client = new GroqClient('k', ['a', 'b', 'c'], silent);
    await expect(
      client.generateJson({ system: 's', messages: [{ role: 'user', content: 'q' }], schema }),
    ).rejects.toMatchObject({
      code: 'AI_FAILED',
    });
  });

  it('reports "busy" when every model only hit capacity errors', async () => {
    scriptFetch([{ status: 503, body: '' }, Object.assign(new Error('timeout'), { name: 'TimeoutError' })]);
    const client = new GroqClient('k', ['a', 'b'], silent);
    await expect(
      client.generateJson({ system: 's', messages: [{ role: 'user', content: 'q' }], schema }),
    ).rejects.toMatchObject({
      code: 'AI_BUSY',
    });
  });

  it('only sends image requests to vision-capable models', async () => {
    const calls = scriptFetch([completion('{"reply":"seen"}')]);
    const client = new GroqClient('k', ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'], silent);
    const messages = [
      {
        role: 'user' as const,
        content: [{ type: 'image_url' as const, image_url: { url: 'data:image/png;base64,AA==' } }],
      },
    ];
    await client.generateJson({ system: 's', messages, schema });
    expect((calls[0]!.body as { model: string }).model).toBe('qwen/qwen3.8-27b');
  });

  it('refuses an image request when no configured model can see', async () => {
    scriptFetch([]);
    const client = new GroqClient('k', ['openai/gpt-oss-120b'], silent);
    const messages = [
      {
        role: 'user' as const,
        content: [{ type: 'image_url' as const, image_url: { url: 'data:image/png;base64,AA==' } }],
      },
    ];
    await expect(client.generateJson({ system: 's', messages, schema })).rejects.toBeInstanceOf(AppError);
  });
});

describe('GroqMealAnalyzer voice', () => {
  const meal = {
    isFood: true,
    title: 'Dal rice',
    message: '',
    transcript: '',
    items: [
      {
        name: 'Dal',
        portion: '1 katori',
        grams: 150,
        calories: 165,
        protein: 9,
        carbs: 22,
        fat: 4.5,
        fiber: 5,
        sugar: 1.5,
        saturatedFat: 1.8,
        sodiumMg: 400,
        confidence: 'high',
      },
    ],
  };

  it('transcribes with Whisper first and keeps the transcript on the draft', async () => {
    const calls = scriptFetch([
      { status: 200, body: { text: ' two rotis and dal ' } },
      completion(JSON.stringify(meal)),
    ]);
    const draft = await new GroqMealAnalyzer(new GroqClient('k', ['qwen/qwen3.8-27b'], silent)).analyze({
      kind: 'voice',
      data: Buffer.from('audio'),
      mimeType: 'audio/mp4',
    });
    expect(calls[0]!.url).toContain('/audio/transcriptions');
    expect(draft.transcript).toBe('two rotis and dal');
    expect(draft.items).toHaveLength(1);
    expect((calls[1]!.body as { messages: { content: string }[] }).messages[1]!.content).toContain('two rotis and dal');
  });

  it('answers gently when the recording is silent instead of asking the model', async () => {
    scriptFetch([{ status: 200, body: { text: ' . ' } }]);
    const draft = await new GroqMealAnalyzer(new GroqClient('k', ['qwen/qwen3.8-27b'], silent)).analyze({
      kind: 'voice',
      data: Buffer.from('audio'),
      mimeType: 'audio/mp4',
    });
    expect(draft.isFood).toBe(false);
    expect(draft.message).toMatch(/couldn't hear/);
  });
});
