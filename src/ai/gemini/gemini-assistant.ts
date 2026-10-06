import type { Part } from '@google/genai';
import { z } from 'zod';
import type { AssistantInput, HealthAssistant } from '../types';
import { ASSISTANT_SYSTEM_PROMPT, assistantUserPrompt } from './prompts';
import type { GeminiStructuredClient } from './structured-client';

/** Prose comes back inside JSON so the answer rides the same fallback chain and validation as everything else. */
const replySchema = z.object({ reply: z.string().trim().min(1).max(4000) });

/** Keep the prompt bounded: older turns drop off first. */
const MAX_HISTORY_TURNS = 12;

export class GeminiHealthAssistant implements HealthAssistant {
  constructor(private readonly client: GeminiStructuredClient) {}

  async reply({ context, history, text, image }: AssistantInput): Promise<string> {
    const recent = history.slice(-MAX_HISTORY_TURNS);
    const parts: Part[] = [];
    if (image) parts.push({ inlineData: { data: image.data.toString('base64'), mimeType: image.mimeType } });
    parts.push({ text: assistantUserPrompt(context, recent, text, !!image) });

    const { reply } = await this.client.generate({ system: ASSISTANT_SYSTEM_PROMPT, parts, schema: replySchema });
    return reply;
  }
}
