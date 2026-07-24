# Spec — `NV bán hàng` carries the debt customer's identifier

Status: agreed (grilling session 2026-07-23). Not yet implemented.

## Context

In the exported MISA sales voucher, column **U — `NV bán hàng`** (0-based index
20) is meant to identify *who* a credit line belongs to. Today it holds only a
**trimmed** plate: `plateDigits(visit.plate)` returns the tail after the last
`-`, so `50E-753.17` → `753.17` and the `50E-` prefix is dropped. Walk-in debt
customers (no plate) get a **blank** cell.

Two problems:

1. **Walk-in debt customers now have a MISA code** (`misaCode`, e.g. `KH001`),
   and Trường Thịnh wants that code to appear in `NV bán hàng` so every credit
   line is attributable — not just the truck ones.
2. **Truck plates are trimmed.** The accountant wants the **full** plate in
   `NV bán hàng`, matching what the shift page already shows.

The shift page's **"Bán nợ trong ca"** list already computes exactly the value
we want in its first column, **"Mã KH / Biển số"**: the plate for a truck
visit, else the customer's `misaCode`. `NV bán hàng` should mirror that column.

## The rule

For a **credit** (bán nợ) row, `NV bán hàng` becomes:

```
plateConfirmed ?? plateRead ?? misaCode
```

i.e. the **full, untrimmed** plate for a truck visit, else the customer's
**`misaCode`** for a walk-in. **Cash** (bán lẻ) rows keep `NV bán hàng` blank,
unchanged.

This is byte-for-byte the same identifier `buildDebtsList` puts in its column-1
`id` (`lib/misa-export/debts-list.ts`), so the exported cell and the on-page
"Mã KH / Biển số" always read identically.

### Behavior table

| Row kind          | `Mã khách hàng` (col O) | `NV bán hàng` (col U)         |
| ----------------- | ----------------------- | ----------------------------- |
| Credit — truck    | customer `misaCode`     | full plate `50E-753.17`       |
| Credit — walk-in  | customer `misaCode`     | same `misaCode` (e.g. `KH001`)|
| Cash (bán lẻ)     | `bl`                    | blank                         |

### Decisions locked during grilling

1. **"Customer ID" = the existing `misaCode`** (Mã MISA). No new schema field.
2. **`NV bán hàng` mirrors the "Mã KH / Biển số" column** on the shift page —
   `plate` if present, else `misaCode`.
3. **Walk-in rows repeat `misaCode` in both `Mã khách hàng` and `NV bán hàng`.**
   The duplication is intended; do **not** special-case it to blank.
4. **The plate is written verbatim** — exactly the stored `plateConfirmed ??
   plateRead` string, with prefix and dot (`50E-753.17`). No uppercasing, no
   stripping of dots/spaces, no reformatting.

### Edge cases (no new handling needed)

- A credit row is only emitted **after** the `customer_without_misa_code`
  preflight check passes, so on any emitted credit row `misaCode` is guaranteed
  non-empty. Therefore `plate ?? misaCode` is **never blank** on a credit row —
  no new "missing identifier" error is introduced.
- Rows blocked by an existing preflight error (no fuel type, no fuel map, no
  MISA code, no price) are unaffected — they never reach this cell.

## Implementation notes

Scope is `lib/misa-export/build-sales-voucher.ts`:

- Drop the `plateDigits()` trimming. Set the credit row's `salesperson` to
  `visit.plate ?? customer.misaCode` (both are in scope at the push site;
  `visit.plate` is already `plateConfirmed ?? plateRead`, coalesced in the
  route at `app/api/shifts/[id]/export-misa/route.ts:118`).
- `plateDigits()` becomes dead once the trim is removed — **delete it**
  (Surgical-Changes / no-dead-code standard). It has no other caller.
- Keep this rule identical to `buildDebtsList`'s column-1 `id`
  (`plateConfirmed ?? plateRead ?? misaCode`). There is precedent for sharing a
  single source of truth so the two views can't drift (`debtVisitSelection` is
  shared "so the two can't select different visits"). A tiny shared helper is
  optional given how small the expression is, but if the reviewer prefers it,
  factor `plate ?? misaCode` into one helper both call.

No schema, migration, route, or Excel-styling change. Column U stays grey; the
value is a string either way.

## Verification

- **Update `tests/misa-export.test.ts`.** The existing assertions expect the
  trimmed plate (`salesperson: '75317' // plate digits from 50E-75317`, and
  `'76402'`). Change them to the **full** stored plate. Add a case for a
  **walk-in credit visit** (plate null, `misaCode` set) asserting
  `salesperson === misaCode`. Confirm cash rows still assert `salesperson: ''`.
- Sanity-check that `NV bán hàng` == the shift page's "Mã KH / Biển số" for the
  same visit (compare against `tests/debts-list.test.ts` expectations).
- `pnpm type-check && pnpm lint && pnpm test && pnpm build` all green.
- Manual: export a shift that has one truck credit visit and one walk-in credit
  visit; open the `.xlsx` and confirm column U shows the full plate on the truck
  row and the `misaCode` on the walk-in row.
