# 02 — Bán nợ trong ca list on the shift page

**What to build:** On the ca page `stations/[id]/shifts/[shiftId]`, below the
existing meter table, add a read-only **Bán nợ trong ca** section listing every
debt visit that belongs to the ca — the same approved/corrected visits the MISA
export emits as credit lines. One row per debt visit, four columns: Mã KH / Biển
số (the truck plate when the visit has one, else the customer's Mã MISA),
Khách hàng (customer name), Nhiên liệu (Vietnamese fuel label), Số lít (the
AI-read litres). Rows are ordered by visit time. An approved visit that has no
usable id — no plate and no/absent customer Mã MISA — still appears, with its id
cell flagged red (the existing "Thiếu mã" treatment), because it will block the
export. When the ca has no credit sales the section stays visible and shows
"Không có công nợ trong ca này". The list and the ca's MISA excel are guaranteed
to contain the same debt visits.

**Blocked by:** 01 — Extract the ca day-window into a shared helper.

**Status:** ready-for-agent

- [ ] `lib/misa-export/debts-list` exports a pure `buildDebtsList(visits, customersById)` returning rows `{ id, idIsMissing, customerName, fuelLabel, liters }`, ordered by `visitDate` ascending.
- [ ] Id resolves to `plateConfirmed ?? plateRead`, else the customer's Mã MISA; `idIsMissing` is true when neither yields a value.
- [ ] The shift page shows the section below the meter table, driven by the ca's approved/corrected debt visits selected via `shiftDayWindow` + station.
- [ ] A missing-id row renders red; an empty ca renders the "Không có công nợ trong ca này" state with the section still visible; the table is read-only (no row actions/links).
- [ ] Section, column, and empty-state strings live in `messages/vi.ts`; fuel names use the existing fuel-label helper.
- [ ] Tests in `tests/debts-list.test.ts` cover `buildDebtsList` (plate id, walk-in Mã MISA id, missing-id flag, fuel label, litres, ordering, empty input) and a one-to-one consistency test: for a shared fixture, `buildDebtsList` rows correspond to `buildMisaSalesVoucher`'s credit rows (same customer, fuel, litres). Fix any divergence the test surfaces.
- [ ] `pnpm type-check && pnpm lint && pnpm test && pnpm build` green.
