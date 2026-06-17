# Test fixtures

## `sample-photos/`

Drop the 13 real ĐAKNONG 1 sample photos here, named by their index
(`13119.jpg`, `13120.jpg`, …). They are **not** committed (binary). The AI
pipeline reads them when tuning real extraction accuracy.

## `expected-extractions.json`

The expected reading for each sample photo, keyed by the photo index. Used by:

- **`AI_MOCK=true`** — `lib/ai/extract-meter.ts` returns these instead of
  calling the Anthropic API, so the whole flow is testable without a key.
- **Accuracy tuning** — once the real photos + `ANTHROPIC_API_KEY` are in
  place, compare live AI output against these expected values (target ≥ 12/13).

> ⚠️ The readings here were transcribed from the build plan's table. A developer
> must open each real photo and **confirm every reading** before trusting them
> as the accuracy baseline. Entries marked `hasUnreadableDigits` (13121, 13130)
> need special attention. When unsure, ask before changing.

## Open question blocking debt extraction (§12.2)

For the per-trip **debt meter** (Week 4), confirm the liter format with the
customer: does a displayed `"430000"` mean **43.0 L** or **4.3 L**? This changes
the computed-amount logic.
