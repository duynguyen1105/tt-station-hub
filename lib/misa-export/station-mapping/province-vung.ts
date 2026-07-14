import { Vung } from '../../generated/prisma/client'

// Confirmed province → Vùng mapping (see spec.md / ADR-0002):
// highland/remote branches are Vùng 2; everything else is Vùng 1.
const VUNG_2_PROVINCES = new Set(['Đắk Nông', 'Lâm Đồng'])

/**
 * Assigns a station's retail price zone from its free-text `branch` province.
 * Unknown or null branches fall back to Vùng 1 (matches the schema default).
 */
export function vungForProvince(branch: string | null): Vung {
  return branch && VUNG_2_PROVINCES.has(branch.trim()) ? Vung.VUNG_2 : Vung.VUNG_1
}
