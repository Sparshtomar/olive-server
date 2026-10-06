import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { aiBusy, aiFailed } from '../../lib/errors';
import type { BinaryInput } from '../types';

const BASE_URL = 'https://api.groq.com/openai/v1';
const TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

/** Statuses where another model (or a later retry) may well succeed. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Models on Groq that accept images. Kept here rather than probed: the model list
 * endpoint does not say which models are multimodal.
 */
const VISION_MODELS = /qwen3\.8|llama-4|vision|-vl\b/i;

export type GroqPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface GroqMessage {
  role: 'user' | 'assistant';
  content: string | GroqPart[];
}

export interface GroqJsonRequest<T> {
  system: string;
  messages: GroqMessage[];
  schema: z.ZodType<T>;
  timeoutMs?: number;
}

/** Inline image part from raw bytes. */
export const imagePart = ({ data, mimeType }: BinaryInput): GroqPart => ({
  type: 'image_url',
  image_url: { url: `data:${mimeType};base64,${data.toString('base64')}` },
});

/**
 * Asks Groq (OpenAI-compatible API) for JSON matching a Zod schema and validates the
 * answer. Same contract as the Gemini client: an ordered model list, fall through on
 * capacity errors, timeouts and schema-invalid answers, give up with a stable error.
 *
 * JSON mode plus the schema spelled out in the system prompt, rather than Groq's
 * `json_schema` response format: the latter rejects schemas some models can't follow and
 * fails the whole request, whereas JSON mode plus our own validation degrades to "try the
 * next model".
 */
export class GroqClient {
  private readonly jsonSchemas = new WeakMap<z.ZodType, string>();

  constructor(
    private readonly apiKey: string,
    private readonly models: string[],
    private readonly log: FastifyBaseLogger,
  ) {
    if (models.length === 0) throw new Error('At least one Groq model is required');
  }

  async generateJson<T>({ system, messages, schema, timeoutMs = 45_000 }: GroqJsonRequest<T>): Promise<T> {
    const needsVision = messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
    const candidates = needsVision ? this.models.filter((m) => VISION_MODELS.test(m)) : this.models;
    if (candidates.length === 0) {
      this.log.error({ models: this.models }, 'groq: no vision-capable model configured');
      throw aiFailed('Olive cannot look at photos with the current AI setup');
    }

    let sawOnlyCapacityErrors = true;
    for (const model of candidates) {
      const started = Date.now();
      try {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_completion_tokens: 4096,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `${system}\n\nRespond with a single JSON object and nothing else. It must match this JSON Schema:\n${this.toJsonSchema(schema)}`,
              },
              ...messages,
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 300);
          if (RETRYABLE_STATUS.has(response.status)) {
            this.log.warn({ model, status: response.status, detail }, 'groq: model unavailable, trying next');
            continue;
          }
          // A 400 "failed to validate JSON" is the model's fault, not ours: try the next one.
          if (response.status === 400 && /json/i.test(detail)) {
            sawOnlyCapacityErrors = false;
            this.log.warn({ model, detail }, 'groq: response was not valid JSON, trying next');
            continue;
          }
          this.log.error({ model, status: response.status, detail }, 'groq: request failed');
          throw aiFailed();
        }

        const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
        const parsed = schema.safeParse(safeJson(body.choices?.[0]?.message?.content));
        if (parsed.success) {
          this.log.info({ model, ms: Date.now() - started }, 'groq: ok');
          return parsed.data;
        }
        sawOnlyCapacityErrors = false;
        this.log.warn({ model, issues: parsed.error.issues.slice(0, 5) }, 'groq: response failed schema');
      } catch (err) {
        if (err instanceof Error && err.name === 'AppError') throw err;
        if (isNetworkOrTimeout(err)) {
          this.log.warn({ model, err: String(err).slice(0, 200) }, 'groq: model unavailable, trying next');
          continue;
        }
        this.log.error({ model, err: String(err).slice(0, 300) }, 'groq: request failed');
        throw aiFailed();
      }
    }
    throw sawOnlyCapacityErrors ? aiBusy() : aiFailed();
  }

  /** Speech to text with Whisper. Returns the transcript, possibly empty for silence. */
  async transcribe({ data, mimeType }: BinaryInput, timeoutMs = 45_000): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), `voice.${extensionFor(mimeType)}`);
    form.append('model', TRANSCRIPTION_MODEL);
    form.append('response_format', 'json');
    form.append(
      'prompt',
      'A person describing what they ate, often Indian dishes: roti, dal, sabzi, idli, dosa, biryani, curd.',
    );

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      this.log.warn({ err: String(err).slice(0, 200) }, 'groq: transcription failed');
      throw isNetworkOrTimeout(err) ? aiBusy() : aiFailed();
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      this.log.error({ status: response.status, detail }, 'groq: transcription failed');
      throw RETRYABLE_STATUS.has(response.status) ? aiBusy() : aiFailed();
    }
    const body = (await response.json()) as { text?: string };
    return (body.text ?? '').trim();
  }

  private toJsonSchema(schema: z.ZodType): string {
    let json = this.jsonSchemas.get(schema);
    if (!json) {
      const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<
        string,
        unknown
      >;
      json = JSON.stringify(rest);
      this.jsonSchemas.set(schema, json);
    }
    return json;
  }
}

const isNetworkOrTimeout = (err: unknown) =>
  err instanceof Error &&
  (err.name === 'TimeoutError' || err.name === 'AbortError' || /fetch failed|ECONN/i.test(err.message));

/** Models sometimes wrap JSON in a code fence despite JSON mode. */
const safeJson = (text: string | undefined): unknown => {
  if (!text) return undefined;
  const trimmed = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const extensionFor = (mimeType: string) =>
  ({
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/amr': 'amr',
  })[mimeType] ?? 'm4a';
