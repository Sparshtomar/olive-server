import type { AssistantInput, HealthAssistant } from '../types';

/**
 * Deterministic stand-in for AI_PROVIDER=mock. It reads the grounding context the
 * service built, so the reply still reflects the user's real markers and targets —
 * good enough to exercise every chat state without a key.
 */
export class MockHealthAssistant implements HealthAssistant {
  async reply({ context, text, image, history }: AssistantInput): Promise<string> {
    const flagged = [
      ...context.matchAll(/^- (.+?): ([\d.]+ \S+) on \S+, healthy ([^,]+), status (HIGH|LOW)\.(?: Tip: ([^\n]+))?/gm),
    ]
      .slice(0, 2)
      .map(([, name, value, range, status, tip]) => ({
        name: name!,
        value: value!,
        range: range!,
        status: status!.toLowerCase(),
        tip,
      }));
    const target = /^Daily targets: ([^\n]+)\.$/m.exec(context)?.[1];

    const parts: string[] = [];
    if (image)
      parts.push('I had a look at your photo — it reads as a home-style plate with a good mix of carbs and protein.');
    if (history.length === 0 && text) parts.push(`On "${text.slice(0, 60)}": here's what your own numbers say.`);
    if (flagged.length) {
      parts.push(
        '',
        ...flagged.map(
          (m) => `• **${m.name}** is ${m.status} at ${m.value} (healthy ${m.range}).${m.tip ? ` ${m.tip}` : ''}`,
        ),
      );
    } else {
      parts.push('Your tracked markers are in range, so this is about staying consistent.');
    }
    if (target) parts.push('', `Today's budget is ${target}.`);
    if (history.length === 0) parts.push('', "I'm not a doctor — for anything that worries you, talk to yours.");
    return parts.join('\n').trim();
  }
}
