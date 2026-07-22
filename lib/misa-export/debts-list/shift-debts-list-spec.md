# Spec: Danh sách bán nợ trong ca (debts list on the shift page)

> Status: **ready-for-agent** (published locally — no issue tracker configured).
> Domain glossary: [`CONTEXT.md`](../CONTEXT.md). Grilling notes:
> [`shift-debts-list.md`](./shift-debts-list.md). Related nghiệp vụ:
> [`debt-walk-in-sales.md`](./debt-walk-in-sales.md).

## Problem Statement

When an accountant opens a ca at `/stations/{stationId}/shifts/{shiftId}`, they
see only the meter table (chốt ca readings). To know what credit fuel (bán nợ)
went out during that ca, they have to leave the page — the Công nợ tab only shows
**per-customer running balances (dư nợ)**, never the individual debt visits, and
the only place the individual credit lines exist is buried inside the generated
MISA excel. There is no on-screen, per-ca list of "each time a customer took fuel
on credit," so the accountant cannot eyeball, before exporting, exactly which
credit lines the ca will produce.

## Solution

Split the shift detail page into two stacked sections. The top stays the existing
meter table. Below it, add a read-only **Bán nợ trong ca** list: one row per debt
visit belonging to that ca, showing who took fuel on credit, which fuel, and how
many litres. The rows are the same approved/corrected debt visits that already
become credit lines in the ca's MISA excel — so the page becomes a faithful,
readable preview of the credit side of the export, and any row that would block
the export (a customer missing a Mã MISA) is flagged in place.

## User Stories

1. As an accountant, I want to see, on the ca page, every debt visit that
   happened in that ca, so that I don't have to open the excel to know what was
   sold on credit.
2. As an accountant, I want the debts list directly below the meter table on the
   same page, so that I can reconcile credit sales against the metered totals in
   one view.
3. As an accountant, I want one row per debt visit, so that I can see each
   individual credit fill rather than an aggregated total.
4. As an accountant, I want each row to show the truck plate (biển số) when the
   visit has one, so that I can recognise the trucked credit sale at a glance.
5. As an accountant, I want a walk-in / can (mang can, no-plate) visit to show the
   customer's Mã MISA in the id column instead, so that every row still carries a
   usable identifier.
6. As an accountant, I want each row to show the customer name, so that I can read
   the list without decoding codes.
7. As an accountant, I want each row to show the fuel name in Vietnamese (Dầu DO /
   Xăng E0 / Dầu DC), so that it matches the fuel labels used elsewhere in the app.
8. As an accountant, I want each row to show the litres taken, so that I can see
   the quantity that feeds the MISA credit line.
9. As an accountant, I want the litres column to be the AI-read quantity from the
   pump-screen photo, so that it reflects what actually left the pump.
10. As an accountant, I want the list to contain only approved and corrected debt
    visits, so that it shows exactly what the MISA excel will contain and nothing
    still awaiting review.
11. As an accountant, I want pending / needs-review / rejected debt visits to stay
    out of this list, so that the ca page is a clean preview and I continue to
    triage them in the Cần duyệt → Duyệt công nợ queue.
12. As an accountant, I want the list scoped to this station and this ca's
    calendar day, so that it matches how the MISA export already gathers debt for
    the ca.
13. As an accountant, I want the rows ordered chronologically by visit time, so
    that I can follow the ca's credit sales in the order they occurred.
14. As an accountant, I want an approved visit whose customer has no Mã MISA (or a
    plate-less visit with no assigned customer) to still appear, flagged red in the
    id column, so that I can see and fix the row that would otherwise block the
    export.
15. As an accountant, I want a clear "Không có công nợ trong ca này" message when
    the ca had no credit sales, so that I know the ca was checked and not that the
    data failed to load.
16. As an accountant, I want the list to be read-only, so that there is a single
    editing surface for debt (the review queue) and I don't accidentally change a
    visit from two places.
17. As an accountant, I want the on-page list and the MISA excel to be guaranteed
    consistent, so that what I preview is exactly what I export.
18. As an accountant, I want the credit litres I read here to line up with the
    metered totals above, so that I can sanity-check bán lẻ = metered − bán nợ
    before exporting.
19. As a developer, I want the debt-visit selection and projection to be pure and
    shared between the page and the export, so that the two can never drift apart.
20. As a developer, I want the shared selection to own the ca's calendar-day
    window logic, so that the VN-offset boundary is defined in exactly one place.

## Implementation Decisions

- **New module `lib/misa-export/debts-list.ts`** holding two pure functions — the
  single seam for this feature:
  - `shiftDayWindow(shiftDate)` → `{ start, end }`: the Vietnam-offset
    calendar-day bounds for a ca. **Extracted from the current inline logic in the
    MISA export route** (the `shiftDate ± VN_OFFSET_MS` window). Both the shift
    page's query and the export route call this — the day window is defined once.
  - `buildDebtsList(visits, customersById)` → ordered display rows. Each row:
    `{ id, idIsMissing, customerName, fuelLabel, liters }`. It resolves the id as
    `plateConfirmed ?? plateRead`, else the customer's `misaCode`; sets
    `idIsMissing` when neither yields a value (no plate **and** no/absent
    customer Mã MISA); maps `fuelType` through the existing `fuelTypeLabel`
    helper; carries `litersRead` as `liters`; and orders rows by `visitDate`
    ascending.
- **Selection predicate** (which visits belong to the ca): `stationId` = the
  shift's station, `reviewStatus ∈ { approved, corrected }`, and `visitDate`
  inside `shiftDayWindow(shift.shiftDate)`. This is the same set the MISA export
  already selects; the export route is refactored to use `shiftDayWindow` so the
  predicate is identical on both sides.
- **Shift detail page** (`app/(dashboard)/stations/[id]/shifts/[shiftId]`) renders
  a new **Bán nợ trong ca** section below the meter table: a read-only table with
  four columns — Mã KH / Biển số, Khách hàng, Nhiên liệu, Số lít — driven by
  `buildDebtsList`. Missing-id cells render red, reusing the existing "Thiếu mã"
  visual treatment from the Công nợ tab. Empty result renders the
  "Không có công nợ trong ca này" state with the section still visible.
- **No schema change.** `DebtVehicleVisit` gains no `shiftId`. Debt stays scoped
  to a ca by station + calendar-day window — valid because a station closes one ca
  per calendar day (see the Key Decision in `shift-debts-list.md`; ADR candidate).
- **MISA export format is unchanged** — same columns, grouping, ordering, and the
  same credit-vs-cash netting. Only the day-window helper is factored out; the
  verify step confirms the credit rows still match the on-page rows.
- **Amount column is litres, not money.** This deliberately avoids the charged
  amount vs MISA amount split (a debt visit's dư nợ charge uses the pump-read
  price; the MISA line re-prices at retail — the litres are identical in both).
- **New UI strings** for the section header, column headers, and empty state go
  under the shifts namespace in `messages/vi.ts`; fuel labels reuse `vi.fuelType`.

## Testing Decisions

- **What makes a good test here:** exercise only external behavior of the pure
  seam — given in-memory debt visits + customers, assert the returned rows (id,
  missing-id flag, fuel label, litres, order). No DB, no React, no file paths.
- **Prior art:** `tests/misa-export.test.ts` tests `buildMisaSalesVoucher` purely
  with fabricated inputs; `tests/debts-aging.test.ts` and `tests/shift-sales.test.ts`
  follow the same in-memory style. The new `tests/debts-list.test.ts` mirrors them.
- **Module under test:** `lib/misa-export/debts-list.ts`.
- **Cases to cover:**
  - `buildDebtsList`: plated visit → id is the plate; walk-in visit → id is the
    customer's Mã MISA; visit with neither → `idIsMissing` true; fuel label maps
    correctly; litres carried through; rows ordered by `visitDate` ascending;
    empty input → empty output.
  - `shiftDayWindow`: a `visitDate` just inside each boundary is included and just
    outside is excluded, for the VN offset (guards the window extraction).
  - **Consistency:** for one shared fixture set, the rows from `buildDebtsList`
    correspond one-to-one (same customer + fuel + litres) with the credit rows
    from `buildMisaSalesVoucher` — the regression guard against page/export drift.

## Out of Scope

- Any change to the MISA export **format** (columns, grouping, ordering, pricing,
  netting).
- Adding a `shiftId` foreign key to `DebtVehicleVisit`, or any migration/backfill.
- Editing, approving, or re-correcting debt visits from the shift page — that
  stays in the Cần duyệt → Duyệt công nợ queue.
- Any change to the Công nợ tab (per-customer dư nợ) or the debt review queue.
- Showing money on the row (charged amount or MISA amount) — litres only.
- Per-fuel or grand totals / footer on the list.
- Row interactions (opening the pump photo, linking to the visit) — read-only.

## Further Notes

- The verify requirement is satisfied structurally: because the page query and the
  export route both select via `shiftDayWindow` + the same status predicate, and
  the page projects via `buildDebtsList` while the export projects the same visits
  into credit rows, the consistency test is what proves they stay aligned. If the
  test forces any change to the export's current selection to make them match,
  that is the "fix any divergence" step — call it out in the PR.
- This spec depends on the operating assumption **one ca per calendar day**. If a
  station ever closes two ca on one date, day-window scoping double-counts debt;
  the follow-up is a real `shiftId` link on `DebtVehicleVisit` (ADR candidate,
  noted in `shift-debts-list.md`).
- Success criteria: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
  green; the section lists one row per approved/corrected visit matching the ca's
  MISA credit rows one-to-one; a missing-Mã-MISA visit shows red; an empty ca shows
  the empty state.
