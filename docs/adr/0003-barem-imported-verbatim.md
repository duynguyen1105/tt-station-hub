---
status: accepted
---

# The Barem is imported verbatim; defects are reported, never repaired

Trường Thịnh's Barem spreadsheet contains arithmetic errors — litres that fall as
height rises at 1282 mm in 13 tanks (~1% of the tank, about 120 L on a 25K DO
tank), a lost digit at DAKNONG3 Hầm 5 (2,316 L → 315 L at 682 mm), and interior
gaps of up to 310 rows. We import every value exactly as written and have the
importer report the defects, rather than smoothing the table into monotonicity or
interpolating across gaps.

## Consequences

- The app's litres and the station's printed Barem always agree. Auto-repair would
  have made the app a _second, different_ Barem, disagreeing with the document the
  worker holds, with no trace of where the difference came from.
- Deliveries that straddle a defect compute wrong litres until Trường Thịnh fixes
  the source. This is tolerable because the delivery note's quantity sits beside
  the computed intake in the form (ADR 0002), so a straddling delivery shows up as
  a visible gap rather than a silent error.
- The defect report is a deliverable for Trường Thịnh, not just developer output:
  the errors are in their spreadsheet, which means they are wrong wherever else
  that spreadsheet is used.
- Heights the Barem cannot answer — out of range, or inside a gap — leave the
  litres empty with a reason on the row. The biên bản still saves; a hole in a
  spreadsheet never blocks the record of a delivery that already happened.
