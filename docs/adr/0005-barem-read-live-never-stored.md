---
status: accepted
---

# The Barem is read live from the spreadsheet, never stored

Trường Thịnh's Barem spreadsheet is fetched and parsed on every lookup, and the
app keeps no copy of it — no tables, no cache, no fallback. We had imported it
into our own database behind a command a developer runs (ADR 0003), on the
reasoning that a shared Google file should not be able to change what a delivery
is worth with no human in the loop. That reasoning was inverted by the defect
report the import itself produced: the numbers the developer was guarding are
wrong in the source, and the admin who can fix them could not make a fix take
effect. Live reading gives the correction to the person who owns it, and leaves
the app with no Barem of its own that could disagree with the one the station is
holding.

## Considered Options

- **A stored copy, refreshed by a command** — what we had. Immune to Google, but
  a correction is gated on a developer, and between an edit and the next import
  the app applies litres the source no longer says.
- **Live reading with the stored copy as a fallback** — rejected. A fallback
  serves numbers the admin has already corrected, at exactly the moment nobody
  can tell it did. That is ADR 0003's "second, different Barem" arriving through
  staleness instead of through repair.
- **A cache with a short TTL, or a refresh button** — rejected. Both reintroduce
  "I fixed the sheet, why is the app still wrong?" in a smaller and harder-to-see
  form, and a per-instance cache can answer two requests in one review
  differently.

## Consequences

- What makes this safe is ADR 0002: every computed SL barem is shown beside the
  AI's reading of the handwritten figure and confirmed by a kế toán, per
  delivery. The human is still in the loop — at confirm time rather than at
  import time — so a mistyped digit surfaces on the delivery it would cost money
  on.
- An unreachable, unshared or structurally broken sheet now costs manual entry:
  the cells stay empty, the form says the spreadsheet could not be read, and the
  biên bản still saves. A hole in a spreadsheet never blocks the record of a
  delivery that already happened.
- The file must remain readable by anyone with the link. That was a build-time
  convenience; it is now a production dependency, and tightening the sharing
  takes every Trạm's Barem down at once.
- The lookup path only ever sees the heights it was asked about, so it will never
  notice a cliff, a gap, or a Barem bound to the wrong tank. The importer
  therefore survives as a checker — same fetch, same defect report, same
  comparison against the dispensers, no writes — and is the only thing that
  inspects a Barem whole.
- Saved receipts are untouched: their litres were written at confirm time, so no
  edit to the spreadsheet can rewrite what a past delivery was worth.
