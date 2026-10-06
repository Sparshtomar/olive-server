import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4010),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.url(),
    AI_PROVIDER: z.enum(['gemini', 'groq', 'mock']).default('gemini'),
    /** An AI Studio key (AIza…) or a Vertex AI Express Mode key (AQ.…); the endpoint is chosen from the prefix. */
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODELS: z
      .string()
      .default('gemini-3-flash-preview,gemini-2.5-flash,gemini-2.5-flash-lite')
      .transform((s) =>
        s
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    GROQ_API_KEY: z.string().optional(),
    /** Tried in order; the first must accept images (see ai/groq/groq-client.ts). */
    GROQ_MODELS: z
      .string()
      .default('qwen/qwen3.8-27b,openai/gpt-oss-120b')
      .transform((s) =>
        s
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    CORS_ORIGIN: z
      .string()
      .default('*')
      .transform((s) => (s === '*' ? true : s.split(',').map((o) => o.trim()))),
    /** Shared rate-limit counters across instances. Unset = in-memory, fine for one instance. */
    REDIS_URL: z.url().optional(),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .refine((e) => e.AI_PROVIDER !== 'gemini' || !!e.GEMINI_API_KEY, {
    message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini',
    path: ['GEMINI_API_KEY'],
  })
  .refine((e) => e.AI_PROVIDER !== 'groq' || !!e.GROQ_API_KEY, {
    message: 'GROQ_API_KEY is required when AI_PROVIDER=groq',
    path: ['GROQ_API_KEY'],
  });

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Fail fast at boot with a readable list instead of a crash on first request.
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
};
