import { ApiError, type GoogleGenAI, type Part, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { aiBusy, aiFailed } from '../../lib/errors';

/** Statuses where another model (or a later retry) may well succeed. */
const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

export interface StructuredRequest<T> {
  system: string;
  parts: Part[];
  schema: z.ZodType<T>;
  timeoutMs?: number;
}

/**
 * Asks Gemini for JSON matching a Zod schema and validates the answer.
 *
 * Free-tier quotas are per model, so on a rate limit / outage / timeout the request
 * falls through an ordered list of models (e.g. 3 Flash → 2.5 Flash → 2.5 Flash-Lite)
 * before giving up. A response that doesn't match the schema also moves on to the
 * next model rather than handing bad data to the caller.
 */
export class GeminiStructuredClient {
  private readonly jsonSchemas = new WeakMap<z.ZodType, unknown>();

  constructor(
    private readonly ai: GoogleGenAI,
    private readonly models: string[],
    private readonly log: FastifyBaseLogger,
  ) {
    if (models.length === 0) throw new Error('At least one Gemini model is required');
  }

  async generate<T>({ system, parts, schema, timeoutMs = 45_000 }: StructuredRequest<T>): Promise<T> {
    let sawOnlyCapacityErrors = true;

    for (const model of this.models) {
      const started = Date.now();
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            responseJsonSchema: this.toJsonSchema(schema),
            temperature: 0.2,
            thinkingConfig: thinkingFor(model),
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });

        const parsed = schema.safeParse(safeJson(response.text));
        if (parsed.success) {
          this.log.info({ model, ms: Date.now() - started }, 'gemini: ok');
          return parsed.data;
        }
        sawOnlyCapacityErrors = false;
        this.log.warn({ model, issues: parsed.error.issues.slice(0, 5) }, 'gemini: response failed schema');
      } catch (err) {
        if (isRetryable(err)) {
          this.log.warn({ model, err: describe(err) }, 'gemini: model unavailable, trying next');
          continue;
        }
        this.log.error({ model, err: describe(err) }, 'gemini: request failed');
        throw aiFailed();
      }
    }

    throw sawOnlyCapacityErrors ? aiBusy() : aiFailed();
  }

  private toJsonSchema(schema: z.ZodType): unknown {
    let json = this.jsonSchemas.get(schema);
    if (!json) {
      const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<
        string,
        unknown
      >;
      json = rest;
      this.jsonSchemas.set(schema, json);
    }
    return json;
  }
}

/** Gemini 3 uses thinking levels; 2.x uses token budgets. Low thinking keeps logging snappy. */
const thinkingFor = (model: string): ThinkingConfig =>
  model.startsWith('gemini-3')
    ? { thinkingLevel: ThinkingLevel.LOW }
    : { thinkingBudget: model.includes('lite') ? 0 : 512 };

const isRetryable = (err: unknown): boolean => {
  if (err instanceof ApiError) return RETRYABLE_STATUS.has(err.status);
  // AbortSignal.timeout and network failures
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError' || /fetch failed|ECONN/i.test(err.message))
  );
};

const safeJson = (text: string | undefined): unknown => {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const describe = (err: unknown) =>
  err instanceof ApiError ? { status: err.status, message: err.message.slice(0, 300) } : String(err).slice(0, 300);
