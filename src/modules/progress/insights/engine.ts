import type { Insight } from '@sparshtomar/olive-shared';
import type { InsightContext } from './context';
import { DEFAULT_RULES, warmingUp } from './rules';
import type { InsightRule } from './types';

export class InsightEngine {
  constructor(
    private readonly rules: InsightRule[] = DEFAULT_RULES,
    private readonly limit = 3,
  ) {}

  run(ctx: InsightContext): Insight[] {
    // Until there's enough history, patterns are noise — say so instead.
    const intro = warmingUp.evaluate(ctx);
    if (intro) return [strip(intro)];

    const ranked = this.rules
      .filter((r) => r !== warmingUp)
      .map((r) => r.evaluate(ctx))
      .filter((i) => i !== null)
      .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, this.limit);
    // Olive is a coach, not a critic: if anything went well, it always makes the cut.
    const bestPositive = ranked.find((i) => i.tone === 'positive');
    if (bestPositive && !top.includes(bestPositive) && top.length === this.limit) {
      top[top.length - 1] = bestPositive;
    }
    return top.map(strip);
  }
}

const strip = ({ score: _score, ...insight }: Insight & { score: number }): Insight => insight;
