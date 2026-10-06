import { ASSISTANT_SYSTEM_PROMPT, assistantUserPrompt } from '../prompts';
import { replySchema } from '../schemas';
import type { AssistantInput, HealthAssistant } from '../types';
import { imagePart, type GroqClient, type GroqMessage, type GroqPart } from './groq-client';

/** Keep the prompt bounded: older turns drop off first. */
const MAX_HISTORY_TURNS = 12;

export class GroqHealthAssistant implements HealthAssistant {
  constructor(private readonly client: GroqClient) {}

  async reply({ context, history, text, image }: AssistantInput): Promise<string> {
    // Earlier turns go in as real chat messages; the grounding context rides with the new question.
    const messages: GroqMessage[] = history
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({ role: t.role, content: t.content }));
    const parts: GroqPart[] = [];
    if (image) parts.push(imagePart(image));
    parts.push({ type: 'text', text: assistantUserPrompt(context, [], text, !!image) });
    messages.push({ role: 'user', content: parts });

    const { reply } = await this.client.generateJson({
      system: ASSISTANT_SYSTEM_PROMPT,
      messages,
      schema: replySchema,
    });
    return reply;
  }
}
