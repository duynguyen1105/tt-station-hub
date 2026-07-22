# 01 — Extract the ca day-window into a shared helper

**What to build:** The calendar-day window that decides which debt visits belong
to a ca is currently computed inline inside the MISA export route (the
`shiftDate` shifted by the Vietnam offset). Lift it into a new shared module,
`lib/misa-export/debts-list`, as a pure `shiftDayWindow(shiftDate)` returning the
window bounds, and repoint the export route to call it. Nothing an accountant sees
changes: the MISA excel for any ca is byte-for-byte identical. This exists so the
shift page (ticket 02) and the export select debt visits through the exact same
window, and the VN-offset boundary is defined in one place.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `lib/misa-export/debts-list` exports a pure `shiftDayWindow(shiftDate)` giving the ca's Vietnam-offset calendar-day bounds.
- [ ] The MISA export route uses `shiftDayWindow` instead of its inline window logic; no other behavior of the route changes.
- [ ] The MISA export output is unchanged — `tests/misa-export.test.ts` passes untouched.
- [ ] New unit tests cover the window boundary: a `visitDate` just inside each edge is included, just outside is excluded, for the VN offset.
- [ ] `pnpm type-check && pnpm lint && pnpm test && pnpm build` green.
