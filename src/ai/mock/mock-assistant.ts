import type { AssistantInput, HealthAssistant } from '../types';

/**
 * Deterministic stand-in for AI_PROVIDER=mock. It reads the grounding context the
 * service built, so the reply still reflects the user's real markers and targets —
 * good enough to exercise every chat state without a key.
 */
export class MockHealthAssistant implements HealthAssistant {
  async reply({ context, text, image, history }: AssistantInput): Promise<string> {
    const flagged = context
      .split('\n')
      .filter((line) => /\b(high|low)\b/i.test(line) && /mg\/dL|%|ng\/mL|g\/dL|mIU\/L/.test(line))
      .slice(0, 2)
      .map((line) => line.replace(/^\s*[-•]\s*/, '').trim());
    const target = /Daily targets?:\s*([^\n]+)/i.exec(context)?.[1]?.trim();

    const parts: string[] = [];
    if (image) parts.push("I had a look at the photo you shared — it's a meal with a mix of carbs and protein.");
    if (history.length === 0) parts.push(`Good question about "${text.slice(0, 60)}".`);
    if (flagged.length)
      parts.push(
        `From your reports, the things worth watching are: ${flagged.join('; ')}.`,
        '',
        ...flagged.map((f) => `• ${f.split(':')[0]}: keep an eye on saturated fat and added sugar this week.`),
      );
    else parts.push('Your tracked markers are in range, so this is about staying consistent.');
    if (target) parts.push('', `Your daily target is ${target}.`);
    parts.push('', "I'm not a doctor — for anything that worries you, talk to yours.");
    return parts.join('\n');
  }
}
