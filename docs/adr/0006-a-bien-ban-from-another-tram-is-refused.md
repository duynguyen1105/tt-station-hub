---
status: accepted
---

# A biên bản whose header names another Trạm is refused, not warned about

The biên bản chuẩn prints its Trạm in the header, code in brackets. When the AI
reads a header that names a Trạm we know and it is not the one being imported
into, the wizard stops at step 1: no review form is built, no receipt can be
saved, and the confirm route refuses the same receipt if it is posted anyway.
This is the only check in the delivery flow that blocks.

Everything else here warns and lets the paper through. A row the binding ladder
cannot attribute keeps its heights and books nothing (ADR 0004). A Barem that
cannot answer leaves the cell empty and says why (ADR 0005). A Trụ that moved
during the measurement marks the Hầm it drew from and nothing more. The reasoning
they share is that the app has failed to work something out, and a hole in what
we know must never block the record of a delivery that already happened.

A station mismatch is not that. The paper is not silent about which Trạm it
belongs to — it says so in print, and it says somewhere else. There is no reading
under which booking it here is right: the rows would bind against this Trạm's Hầm
roster and, because neighbouring Trạm carry the same fuels at plausible
capacities, they would bind _successfully_ and move `estimated_stock` on two sets
of books at once. Nothing downstream would notice. And the correct action costs
nothing: open that Trạm's Tồn kho page and import the same photographs there.

## Considered Options

- **Warn on the review form, save anyway** — consistent with every other check,
  and wrong here. The warning would sit above a form already filled with another
  Trạm's figures, and a reviewer working through a stack of deliveries confirms
  what the form shows.
- **Block at the confirm button instead of step 1** — the review form still gets
  built, so another Trạm's heights are bound to these Hầm and displayed as this
  Trạm's rows. That is the mistake being prevented, staged one screen later.
- **A typed override on the alert** — rejected. An override is worth having when
  the human knows something the app does not. Here the app is reading the paper's
  own claim about itself, so an override would only ever launder a misread, and
  the case it exists for is already served (below).
- **Fingerprint the pre-printed Hầm roster** as a second signal when the code is
  illegible. Real, but several Trạm print the same roster shape, and it would
  refuse on our inference where the header refuses on their print.

## Consequences

- The block fires only on a **confident** identification: a bracketed code or a
  header that resolves to exactly one Trạm we know, tested against the current
  Trạm first. Anything else — an unreadable header, an old sheet that prints no
  code, a Trạm in neither the database nor `station-rosters.ts`, a header that
  reads as two Trạm — comes back `unknown` and changes nothing. Silence is not
  evidence, and the cost of a false refusal is a delivery nobody can record.
- **"Bỏ qua AI, nhập tay" is deliberately not gated.** It sends no `rawExtract`,
  so neither the form nor the confirm route has a header to object to. This is
  the escape hatch, and it is the right one: it costs the reviewer every cell
  typed by hand — friction nobody accepts to dodge a warning — and it guarantees
  a misread header can never trap a delivery that really happened. The hard block
  applies to the AI path, which is the only path that can be confidently wrong
  about which Trạm the paper names.
- The list of Trạm to be refused _toward_ includes the 13 codes printed on the
  standard forms, not only the configured stations. A DAKNONG2 sheet is refused
  at DAKNONG1 whether or not DAKNONG2 has been set up — the paper naming someone
  else is enough, and the app does not need to know them to know they are not us.
  The printed codes are consulted **only when this Trạm is among them**: a Trạm
  whose database code is not a code any form prints — the DAKNONG4 file carries
  `DAKNONGVK`, so the two can diverge — is indistinguishable from a Trạm the
  forms call something else, and it would end up refusing its own biên bản. It
  falls back to comparing against the configured stations alone, which still
  catches every other Trạm anyone has set up.
- `BienBanExtraction.stationName` stops being dead data. It has been extracted
  and stored in `raw_extract` since the standard form landed, read by nothing.
- The check runs twice, in the extract route and again on confirm. The second is
  not defence against an attacker — the form is the only caller — but the rule is
  worth stating where the write happens rather than only where the button is.
