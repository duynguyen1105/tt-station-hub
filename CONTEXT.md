# Domain glossary — TT Station Hub

Ubiquitous language for the station-management domain. Glossary only — no
implementation details. Terms are the canonical names; code and UI should match.

## Ca (shift)

One station × one calendar date × one shift type (Sáng / Chiều / Đêm / cả ngày).
In practice a station closes **one ca per calendar day**, so "the ca" and "the
day" are interchangeable when scoping that station's activity. A ca is what gets
*chốt* (closed) and is the unit a MISA export is produced for.

## Meter reading (chốt ca reading)

The pump-counter numbers captured when a ca is closed, one set per trụ
(dispenser): Đầu ĐT / Cuối ĐT (electronic counter, opening/closing) and
Đầu Cơ / Cuối Cơ (mechanical counter, opening/closing). Retail litres sold are
derived from the electronic counter delta.

## Debt visit (lượt bán nợ)

One credit fill — a single occasion a customer takes fuel on credit. The atomic
unit of "bán nợ": it records which station, when, which fuel, how many litres,
the read unit price, the plate (if any), and — once reviewed — which customer.
Each debt visit becomes exactly one credit line in the MISA export. "Every
single debt buy action" = one debt visit.

## Walk-in debt (mang can / không biển số)

A debt visit with **no plate** — the customer brings a can/drum, or the plate
was not photographed. Identified by the accountant at review time (from the Zalo
caption), not automatically. Still a normal debt visit in every other respect.

## Charged amount vs MISA amount

Two distinct money figures for the same debt visit — they routinely differ
because credit is often sold at contract price, not retail:

- **Charged amount** — litres × the pump-read unit price. This is what the
  customer actually owes; it is what increments their **dư nợ** (outstanding
  balance).
- **MISA amount** — litres × the standard retail price for the sale date. This
  is what the exported accounting voucher reports.

The **litres** are the same in both; only the price (and therefore the money)
differs. The shift-page debts list shows litres, so it sidesteps this split.

## Dư nợ (outstanding balance)

A debt customer's running unpaid total. Increased by a charge (an approved debt
visit), decreased by a payment. Shown per-customer in the station's Công nợ tab.

## Mã MISA (customer code)

The customer code assigned by Trường Thịnh, required on every debt customer.
Identifies the customer in the exported accounting voucher. The reserved code
`bl` means **bán lẻ** (retail) and may not be assigned to a debt customer.

## Bán lẻ (retail) vs Bán nợ (credit)

The two ways fuel leaves a pump. **Bán lẻ** is cash retail, booked under code
`bl`; its litres are the ca's total metered litres minus credit litres. **Bán nợ**
is credit, booked per debt customer by Mã MISA. Every debt visit is bán nợ.
