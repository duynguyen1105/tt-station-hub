// What each Trạm's standard BIÊN BẢN GIAO NHẬN XĂNG DẦU prints for its own
// Hầm and Trụ. Thirteen forms were issued, one per Trạm, each pre-printed with
// that Trạm's roster — knowledge the app has never had.
//
// Transcribed once, by hand, from `docs/BB GIAONHANXD/*.docx`, and checked in so
// a paper row can be resolved to a Hầm even at a Trạm nobody has configured in
// the database yet. This module holds data and nothing else: it reads no
// database, and `pnpm roster:check` is what compares it against one.
//
// Recorded as printed, in the posture of ADR 0003 — the source is taken as it
// stands and its defects are reported, never repaired:
//
//   • HTGDONGNAI numbers two different Hầm both `3.`. Both rows are here.
//   • LAMDONG02 numbers neither its Hầm nor its Trụ, and LAMDONG01 numbers its
//     Hầm but not its Trụ. Those numbers are inferred from printed row order and
//     carry `inferred: true`, so the check command can ask a human to confirm.
//   • `BBGIAONHANXD_DAKNONG4.docx` prints the station code `DAKNONGVK` (Việt
//     Khôi 01) — which is already what its Barem fixture uses. The code on the
//     form wins over the file name, so it registers under `DAKNONGVK`.

/** One Hầm row of the pre-printed table. */
export type RosterTank = {
  /** `HAM_n` — from the printed number, or inferred from row order. */
  tankCode: string
  /** `E0` | `DO` | `DC`, as printed. */
  fuel: string
  /** Thousands of litres, as the form writes them — 25 means a 25,000 L tank. */
  capacityK: number
  /** The cell as printed, runs of spaces collapsed: `4.DO 15K`, `1.E0 - 12K`, `DC - 9K`. */
  printedLabel: string
  /** True when `tankCode` came from row order because the form printed no number. */
  inferred: boolean
}

/** One Trụ row of the pre-printed table. */
export type RosterPump = {
  /** `TRU_n` — from the printed number, or inferred from row order. */
  pumpCode: string
  fuel: string
  /** The cell as printed: `1- DO`, or bare `E0` where the form prints no number. */
  printedLabel: string
  inferred: boolean
}

/** One Trạm's form, keyed by the station code printed on it. */
export type StationRoster = {
  stationCode: string
  /** The document in `docs/BB GIAONHANXD/` this was transcribed from. */
  sourceFile: string
  tanks: RosterTank[]
  pumps: RosterPump[]
}

/** All 13 forms, in the order the documents are named. */
export const STATION_ROSTERS: StationRoster[] = [
  {
    stationCode: 'CXGNH',
    sourceFile: 'BBGIAONHANXD_CXGNH.docx',
    tanks: [
      tank('HAM_1', 'DO', 10, '1. DO 10K'),
      tank('HAM_2', 'DC', 10, '2. DC 10K'),
      tank('HAM_3', 'E0', 10, '3. E0 10K'),
      tank('HAM_4', 'E0', 10, '4. E0 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DC', '1- DC'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DO', '4- DO'),
    ],
  },
  {
    stationCode: 'DAKNONG1',
    sourceFile: 'BBGIAONHANXD_DAKNONG1.docx',
    tanks: [
      tank('HAM_1', 'E0', 15, '1. E0 15K'),
      tank('HAM_2', 'DC', 10, '2. DC 10K'),
      tank('HAM_3', 'DO', 25, '3. DO 25K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DC', '4- DC'),
      pump('TRU_5', 'DC', '5- DC'),
      pump('TRU_6', 'DO', '6- DO'),
    ],
  },
  {
    stationCode: 'DAKNONG2',
    sourceFile: 'BBGIAONHANXD_DAKNONG2.docx',
    tanks: [
      tank('HAM_1', 'DO', 15, '1. DO 15K'),
      tank('HAM_2', 'E0', 12, '2. E0 12K'),
      tank('HAM_3', 'E0', 10, '3. E0 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DO', '4- DO'),
    ],
  },
  {
    stationCode: 'DAKNONG3',
    sourceFile: 'BBGIAONHANXD_DAKNONG3.docx',
    tanks: [
      tank('HAM_1', 'E0', 9, '1. E0 9K'),
      tank('HAM_2', 'E0', 9, '2. E0 9K'),
      tank('HAM_3', 'E0', 9, '3. E0 9K'),
      tank('HAM_4', 'DO', 15, '4.DO 15K'),
      tank('HAM_5', 'DC', 10, '5.DC 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DC', '1- DC'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DO', '4- DO'),
    ],
  },
  {
    // The title prints `(DAKNONGVK)`; only the file name says DAKNONG4.
    stationCode: 'DAKNONGVK',
    sourceFile: 'BBGIAONHANXD_DAKNONG4.docx',
    tanks: [
      tank('HAM_1', 'DO', 10, '1. DO 10K'),
      tank('HAM_2', 'E0', 9, '2. E0 9K'),
      tank('HAM_3', 'E0', 6, '3. E0 6K'),
      tank('HAM_4', 'DO', 10, '4. DO 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DO', '4- DO'),
    ],
  },
  {
    stationCode: 'DAKNONG5',
    sourceFile: 'BBGIAONHANXD_DAKNONG5.docx',
    tanks: [
      tank('HAM_1', 'DO', 20, '1. DO 20K'),
      tank('HAM_2', 'E0', 10, '2. E0 10K'),
      tank('HAM_3', 'E0', 10, '3. E0 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DO', '4- DO'),
    ],
  },
  {
    stationCode: 'HTGDONGNAI',
    sourceFile: 'BBGIAONHANXD_HTGDONGNAI.docx',
    tanks: [
      tank('HAM_1', 'DC', 10, '1. DC 10K'),
      tank('HAM_2', 'DO', 15, '2. DO 15K'),
      // Two different tanks, both printed `3.`. Kept as printed — repairing the
      // number here would be guessing which tank a delivery went into.
      tank('HAM_3', 'E0', 15, '3. E0 15K'),
      tank('HAM_3', 'E0', 10, '3. E0 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DC', '4- DC'),
    ],
  },
  {
    stationCode: 'LAMDONG01',
    sourceFile: 'BBGIAONHANXD_LAMDONG01.docx',
    tanks: [
      tank('HAM_1', 'E0', 12, '1.E0 - 12K'),
      tank('HAM_2', 'E0', 12, '2.E0 - 12K'),
      tank('HAM_3', 'DO', 25, '3.DO - 25K'),
      tank('HAM_4', 'DO', 25, '4.DO -25K'),
      tank('HAM_5', 'DC', 12, '5.DC - 12K'),
    ],
    pumps: [
      inferredPump('TRU_1', 'E0', 'E0'),
      inferredPump('TRU_2', 'E0', 'E0'),
      inferredPump('TRU_3', 'DO', 'DO'),
      inferredPump('TRU_4', 'DO', 'DO'),
      inferredPump('TRU_5', 'E0', 'E0'),
      inferredPump('TRU_6', 'DC', 'DC'),
    ],
  },
  {
    stationCode: 'LAMDONG02',
    sourceFile: 'BBGIAONHANXD_LAMDONG02.docx',
    tanks: [
      inferredTank('HAM_1', 'DC', 9, 'DC - 9K'),
      inferredTank('HAM_2', 'DO', 9, 'DO - 9K'),
      inferredTank('HAM_3', 'E0', 25, 'E0 - 25K'),
    ],
    pumps: [
      inferredPump('TRU_1', 'DC', 'DC'),
      inferredPump('TRU_2', 'DO', 'DO'),
      inferredPump('TRU_3', 'E0', 'E0'),
      inferredPump('TRU_4', 'E0', 'E0'),
    ],
  },
  {
    stationCode: 'NGANHA01',
    sourceFile: 'BBGIAONHANXD_NGANHA01.docx',
    tanks: [
      tank('HAM_1', 'DO', 25, '1. DO 25K'),
      tank('HAM_2', 'E0', 13, '2. E0 13K'),
      tank('HAM_3', 'E0', 6, '3. E0 6K'),
      tank('HAM_4', 'E0', 6, '4. E0 6K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DO', '4- DO'),
    ],
  },
  {
    stationCode: 'NGUYENVUONG',
    sourceFile: 'BBGIAONHANXD_NGUYENVUONG.docx',
    tanks: [
      tank('HAM_1', 'DO', 25, '1. DO 25K'),
      tank('HAM_2', 'E0', 15, '2. E0 15K'),
      tank('HAM_3', 'E0', 10, '3. E0 10K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'DO', '2- DO'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'E0', '4- E0'),
    ],
  },
  {
    stationCode: 'PHUCTIEN',
    sourceFile: 'BBGIAONHANXD_PHUCTIEN.docx',
    tanks: [
      tank('HAM_1', 'E0', 20, '1. E0 20K'),
      tank('HAM_2', 'DC', 5, '2. DC 5K'),
      tank('HAM_3', 'DO', 25, '3. DO 25K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'E0', '2- E0'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'DC', '4- DC'),
    ],
  },
  {
    stationCode: 'TANHOA',
    sourceFile: 'BBGIAONHANXD_TANHOA.docx',
    tanks: [
      tank('HAM_1', 'DO', 25, '1. DO 25K'),
      tank('HAM_2', 'E0', 12, '2. E0 12K'),
      tank('HAM_3', 'E0', 6, '3. E0 6K'),
    ],
    pumps: [
      pump('TRU_1', 'DO', '1- DO'),
      pump('TRU_2', 'DO', '2- DO'),
      pump('TRU_3', 'E0', '3- E0'),
      pump('TRU_4', 'E0', '4- E0'),
    ],
  },
]

/** The form issued to a Trạm, or nothing if it was issued none. */
export function rosterForStation(stationCode: string): StationRoster | undefined {
  return STATION_ROSTERS.find((roster) => roster.stationCode === stationCode)
}

function tank(tankCode: string, fuel: string, capacityK: number, printedLabel: string): RosterTank {
  return { tankCode, fuel, capacityK, printedLabel, inferred: false }
}

function inferredTank(
  tankCode: string,
  fuel: string,
  capacityK: number,
  printedLabel: string
): RosterTank {
  return { tankCode, fuel, capacityK, printedLabel, inferred: true }
}

function pump(pumpCode: string, fuel: string, printedLabel: string): RosterPump {
  return { pumpCode, fuel, printedLabel, inferred: false }
}

function inferredPump(pumpCode: string, fuel: string, printedLabel: string): RosterPump {
  return { pumpCode, fuel, printedLabel, inferred: true }
}
