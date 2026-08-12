---
status: accepted
---

# A paper row binds by its printed number, with fuel and capacity as the veto

Section (c) of a biên bản names its Hầm the way each of the thirteen forms
happens to print them: `HẦM 2 12K` on the old sheets, `1. DO 10K` and
`2.E0 - 12K` on the biên bản chuẩn, and on LAMDONG02 simply `DC - 9K`. We bind a
row to a Hầm by the number it prints, and let the printed fuel and nominal
capacity only ever _refuse_ that binding — never make one. A row that prints no
number falls through to the fuel and capacity, and binds only where they single
out exactly one Hầm in the roster. A row that names none, or several, or a Hầm an
earlier row already claimed, is left unbound with a reason.

Two other rules were available:

- **By row order** — the first row is Hầm 1, the second Hầm 2. It reads every
  form, including the unnumbered ones, and needs nothing printed at all. It is
  also wrong the moment a worker skips a Hầm that took no fuel, or the AI drops
  an empty row, and it fails silently: every subsequent row binds to the wrong
  Hầm and books a real delivery into a tank that never received it. Row order is
  how the roster in `station-rosters.ts` infers the numbers LAMDONG02 does not
  print, but that inference was made once, by hand, against the document, and is
  flagged as inferred. Repeating it per photograph is not the same act.
- **By fuel alone** — match `DO` to the Trạm's DO Hầm. It is unambiguous at a
  Trạm with one Hầm per fuel and useless at the many with two or three, where it
  would have to guess exactly where guessing is most expensive.

The choice is hard to reverse: once phiếu nhập are saved under it, tồn kho for
every Hầm carries the attribution this rule made, and re-deciding later does not
un-book them.

## Consequences

- The number on the paper is what binds, so a Hầm renumbered on the form and not
  in the app books fuel into the wrong tank. That is what `pnpm roster:check`
  exists to catch, and why fuel and capacity veto: a renumbering that also
  changes the fuel or the capacity is refused rather than booked.
- HTGDONGNAI prints two different Hầm both `3.`. The first row binds and the
  second is unbound — the form's defect surfaces on the row it affects instead of
  being resolved by a coin flip (ADR 0003).
- A numbered row at a Trạm the app does not know binds anyway, marked unverified.
  Nothing contradicts it, and a delivery that has already happened must not be
  lost to a Trạm nobody has configured.
- An unbound row is not an error. It keeps its heights and its litres, says why
  it is unbound in Vietnamese, produces no Barem lookup and no phiếu nhập, and
  does not stop the biên bản being saved. The paper is the legal record; one row
  we cannot attribute must not block recording the rest of the trip.
- Trụ bind by the same ladder against the Trụ roster, so LAMDONG01 and LAMDONG02,
  which print no Trụ numbers at all, resolve by fuel where their fuels are
  distinct and stay unbound where they are not.
