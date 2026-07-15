# MISA account config is company-global and retail prices are keyed by Vùng, not by station

## Context

The three MISA export settings — the GL account config, the retail prices, and the
fuel/warehouse map — all lived per-station under `/settings/misa`, edited one station at a
time via a hidden station picker. Two of them don't actually vary per station:

- The GL **account codes** (revenue `5111`, cost `632`, stock `1561`, credit debit `131`,
  cash debit `11111`) are Trường Thịnh's single company chart of accounts, yet each station
  stored its own copy that could silently drift.
- **Retail fuel prices** in Vietnam are set by price zone (**Vùng 1 / Vùng 2**), a fixed
  two-tier national scheme — not per station. Entering the same zone price separately for
  every station is redundant and error-prone.

There was no Vùng concept at all; the closest was `Station.branch`, a free-text province
label the export ignores. ADR-0001 established that MISA rows are priced from the retail
price effective on the sale date — that stays true; only the granularity of "retail price"
changes.

## Decision

Split the MISA export settings by their true scope:

- The account config becomes **company-global** (per-station config → one shared config). All
  five GL codes apply to every station.
- Retail prices are **re-keyed from station to Vùng**: the price key becomes
  `[vung, fuelType, effectiveDate]`. Every station in a zone inherits that zone's prices;
  there are no per-station price overrides.
- A **`Vung { VUNG_1, VUNG_2 }`** enum and a required **`Station.vung`** (non-null, default
  `VUNG_1`) model the zone. An enum is sufficient because the zoning is a fixed national
  two-tier scheme; a lookup table is not warranted (Simplicity First). Existing stations are
  assigned by province: highland/remote branches (**Đắk Nông**, **Lâm Đồng**) → `VUNG_2`;
  others (**Đồng Nai**) → `VUNG_1`.

The fuel/warehouse map stays genuinely per-station (`[stationId, fuelType]`), unchanged.

## Consequences

- Price selection logic is unchanged and ADR-0001 is preserved: MISA rows are still valued at
  the retail price effective on the sale date — the price is now resolved via the station's
  Vùng instead of its `stationId`.
- A GL account change is entered once company-wide and can no longer drift between stations; a
  zone price is entered once per Vùng instead of once per station.
- Editing surfaces move accordingly (later slices): the config form drops its station picker,
  the prices form gains a Vùng selector, and the fuel map moves to a per-station MISA tab.
- This ADR's slice ships only the data foundation: the `Vung` enum, `Station.vung` with the
  province backfill, and a read-only Vùng display on the station page. The global-config model,
  the price re-key, and the relocated edit surfaces follow in subsequent tickets.
