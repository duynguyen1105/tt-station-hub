# Spec — Danh sách bán nợ trong ca (debts list on the shift page)

> Status: **spec, ready to build**. Produced by a grilling session on 2026-07-21.
> Companion domain glossary: [`CONTEXT.md`](../CONTEXT.md). Related nghiệp vụ doc:
> [`docs/debt-walk-in-sales.md`](./debt-walk-in-sales.md).

## 1. Goal

On the shift detail page `/stations/{stationId}/shifts/{shiftId}`, show — below
the existing meter table — a read-only list of **every debt visit** that belongs
to that ca. Each row is one credit fill and corresponds one-to-one to a credit
line in the MISA excel for that ca.

## 2. Page layout

The shift detail page splits into two stacked sections:

1. **Chốt ca (top, unchanged)** — the existing meter table (Đầu/Cuối ĐT, Đầu/Cuối
   Cơ, trạng thái, duyệt/sửa/từ chối).
2. **Bán nợ trong ca (new, below)** — the debts list specified here.

## 3. The debts list

### 3.1 Rows

One row per **debt visit** (`DebtVehicleVisit`) where **all** of:

- `stationId` = the shift's station, **and**
- `reviewStatus ∈ { approved, corrected }`, **and**
- `visitDate` falls inside the ca's calendar-day window.

This is **exactly** the set of visits the MISA export already selects for the
same shift. Pending / needs-review / rejected visits do **not** appear here —
they live in the *Cần duyệt → Duyệt công nợ* queue.

Ordering: by `visitDate` ascending (chronological order of the day's fills).

### 3.2 Columns (4)

| # | Header (vi)   | Value                                                                 |
| - | ------------- | --------------------------------------------------------------------- |
| 1 | Mã KH / Biển số | `plateConfirmed ?? plateRead` if present, **else** the customer's `misaCode` |
| 2 | Khách hàng    | `DebtCustomer.name`                                                    |
| 3 | Nhiên liệu    | `fuelTypeLabel(visit.fuelType)` (e.g. Dầu DO / Xăng E0 / Dầu DC)       |
| 4 | Số lít        | `litersRead` (litres — the AI-read quantity; equals MISA `quantity`)   |

Column 4 is **litres**, not money. It intentionally avoids the charged-amount vs
MISA-amount split (see `CONTEXT.md`).

### 3.3 Missing-id rows

An approved visit whose column-1 id cannot be produced — customer has no
`misaCode`, or a plate-less visit was never assigned a customer — is **still
listed**, with the id cell flagged in red (same treatment as the existing
"Thiếu mã" badge in the Công nợ tab). Rationale: such a row **blocks** the MISA
export, so staff must see it here rather than have it silently hidden.

### 3.4 Empty state

When the ca has no approved/corrected debt visit, the section stays visible and
shows "Không có công nợ trong ca này" — so staff know it was checked, not
missing.

### 3.5 No totals

Plain list only. No per-fuel or grand total footer. The credit-vs-retail netting
math stays in the MISA export.

### 3.6 Interaction

Read-only. No row actions, no links. Editing / re-approving a visit stays in the
*Cần duyệt → Duyệt công nợ* queue (the single editing surface for debt).

## 4. Consistency with the MISA export (verify requirement)

The shift page and the export **must not diverge**: every row shown here must be
a row that lands in the excel, and vice-versa.

- **Single source of truth.** Extract the debt-visit selection (station +
  calendar-day window + `approved/corrected`) into one shared helper used by both
  the shift page and `app/api/shifts/[id]/export-misa/route.ts`. Today that
  selection is inlined in the export route (`stationId` match + a
  `shiftDate ± VN offset` day window). The page must use the identical predicate.
- **Verify step.** As part of this work, audit the export path and confirm the
  listed rows are exactly the credit rows produced (`buildMisaSalesVoucher`
  credit branch). Fix any mismatch found.

Note on the day window: the export derives it from `shiftDate` with a 7h Vietnam
offset (`VN_OFFSET_MS`). The shared helper owns this so both callers agree.

## 5. Out of scope

- No change to the MISA export **format** (columns/grouping/ordering unchanged).
- No `shiftId` foreign key added to `DebtVehicleVisit` — see the decision below.
- No change to the Công nợ tab (per-customer balances) or the debt review queue.

## 6. Key decision — no hard visit↔shift link

Debt visits are scoped to a ca by **station + calendar-day window**, not by a
`shiftId` foreign key on the visit. This is safe **only** because a station
closes **one ca per calendar day**; a day therefore maps to exactly one ca.

If that operating assumption ever changes (a station closes two ca — Sáng and
Chiều — on the same date), day-window scoping would show/emit the **same** debt
under both ca and risk double-counting in MISA. At that point a real `shiftId`
link on `DebtVehicleVisit`, assigned at ingest/approval, becomes necessary. This
is called out as an ADR candidate.

## 7. Touch points (for the implementer)

- Page: `app/(dashboard)/stations/[id]/shifts/[shiftId]/page.tsx` — add the
  section below the meter table.
- Shared debt-visit query helper — new; also consumed by
  `app/api/shifts/[id]/export-misa/route.ts`.
- Labels: `fuelTypeLabel` (`lib/ui/status.ts`), `vi.fuelType` (`messages/vi.ts`);
  add the new section's strings under a `shifts`/`debts` namespace in `messages/vi.ts`.
- Reference for column semantics: `lib/misa-export/build-sales-voucher.ts`
  (credit branch), `DebtVehicleVisit` in `prisma/schema.prisma`.

## 8. Success criteria

- `pnpm type-check && pnpm lint && pnpm test && pnpm build` green.
- On a ca with approved debt, the section lists one row per approved/corrected
  visit, columns as §3.2, matching the ca's MISA excel credit rows one-to-one.
- A missing-Mã-MISA approved visit shows in red and is not silently dropped.
- A ca with no debt shows the empty-state message.
