# Test fixtures

## `barem/`

Three real sheets from Trường Thịnh's Barem spreadsheet, exported as CSV and
committed verbatim — so `tests/barem.test.ts` fails if the real shape ever
changes. Chosen for what each one proves:

- **`DAKNONG1.csv`** — clean 3-tank sheet, every Hầm 10–2460 mm. Carries the
  1282 mm cliff (Hầm 3 DO: 13,532 L → 13,413 L).
- **`LAMDONG01.csv`** — per-Hầm maximum heights (1900 for Hầm 1–2, 2300 for
  Hầm 3–4) and a skipped height in Hầm 3 (50 → 52; Google turned the `51` cells
  into dates).
- **`DAKNONGVK.csv`** — Hầm 3's 310-row gap: heights 2071–2380 are listed with
  no litres, so its Barem stops at 2070 while its siblings reach 2380.

The defects are in the source document and are **never repaired** (ADR 0003).

## `bien-ban/`

Two model responses in the **old free-form shape** — the one the AI read before
Trường Thịnh issued the standard biên bản. They pin that shape through
`normalizeBienBan` (`tests/extract-bien-ban.test.ts`), so teaching the prompt the
standard form cannot quietly change how an old sheet reads.

- **`old-format-handwritten.json`** — the Nguyên Vượng layout: thousands
  separators throughout (`6.000`, `109,622`, `1.037.500`), `HẦM n nnK` tank rows,
  `TRỤ n` pump rows, a seal per goods column.
- **`old-format-printed.json`** — the Phúc Tiến layout: decimal comma
  (`82118,87`, `141008,78`, `259.799,74`), fuel-suffix tank labels
  (`HẦM 1 XA`), a `+0,5` valve position.

Every side and column carries a different number, so a before/after or Điện/Cơ
swap fails the test instead of passing on equal values.

> The cell formats and label shapes are the ones recorded from the two verified
> samples (`tests/bien-ban.test.ts`, `docs/nhap-hang.md`). Which row each value
> sat on is **not** transcribed, and these are not a recording of a live vision
> run — no photograph of a filled _standard_ form exists yet, so nothing here
> says anything about extraction accuracy on the new paper.

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
