import { FuelArea } from '../generated/prisma/client'

// Confirmed province → fuel area mapping (see spec.md / ADR-0002):
// highland/remote branches are fuel area 2; everything else is fuel area 1.
const FUEL_AREA_2_PROVINCES = new Set(['Đắk Nông', 'Lâm Đồng'])

/**
 * Assigns a station's retail price zone from its free-text `branch` province.
 * Unknown or null branches fall back to fuel area 1 (matches the schema default).
 */
export function fuelAreaForProvince(branch: string | null): FuelArea {
  return branch && FUEL_AREA_2_PROVINCES.has(branch.trim())
    ? FuelArea.FUEL_AREA_2
    : FuelArea.FUEL_AREA_1
}
