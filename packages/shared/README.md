# @sparshtomar/olive-shared

The domain contract for [Olive](https://github.com/Sparshtomar/olive-mobile), a personal AI health assistant. Used by the [API](https://github.com/Sparshtomar/olive-server) and the app, so both validate and calculate with the same code.

- **Schemas** (Zod): profiles, meals, food items, lab reports, API errors. The API validates requests with them; the app drives its forms with them.
- **Nutrition**: daily targets (Mifflin-St Jeor BMR × activity − deficit, with safety floors), portion scaling, totals.
- **Lab markers**: a catalog of tracked markers with aliases, unit conversion to canonical units, reference ranges, status, and the diet focus an out-of-range marker turns into (high LDL → a daily saturated-fat budget).

```ts
import { computeTargets, evaluateMarker, deriveNutritionFocus } from '@sparshtomar/olive-shared';
```

Versioned with semver. Releases are published from CI when a `shared-v<version>` tag is pushed.
