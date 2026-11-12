import { type CurrentUser } from '@/lib/auth/session'
import { canReachStation } from '@/lib/auth/station-guard'
import { prisma } from '@/lib/prisma'

export const RECEIPT_DOC_KINDS = ['bien_ban', 'phieu_xuat_kho', 'related'] as const
export type ReceiptDocKind = (typeof RECEIPT_DOC_KINDS)[number]

const PREFIX: Record<ReceiptDocKind, string> = {
  bien_ban: 'bien-ban',
  phieu_xuat_kho: 'pxk',
  related: 'related',
}

/** Every receipt file lives at <STATION>/imports/receipts/<receiptId>/<prefix>-<uuid>.<ext>. */
export const receiptDocPrefix = (code: string, receiptId: string, kind: ReceiptDocKind) =>
  `${code}/imports/receipts/${receiptId}/${PREFIX[kind]}-`

/** A browser-reported path is accepted only if it is a slot this receipt's upload-urls issued. */
export function isReceiptDocPath(
  path: string,
  code: string,
  receiptId: string,
  kind: ReceiptDocKind
) {
  const prefix = receiptDocPrefix(code, receiptId, kind)
  return (
    path.startsWith(prefix) && /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(path.slice(prefix.length))
  )
}

/** The receipt + its station code, when this user may attach files to it; else null. */
export async function receiptForUpload(user: CurrentUser, receiptId: string) {
  if (user.role === 'viewer') return null
  const receipt = await prisma.fuelImportReceipt.findUnique({
    where: { id: receiptId },
    select: { id: true, stationId: true },
  })
  if (!receipt || !(await canReachStation(user, receipt.stationId))) return null
  const station = await prisma.station.findUnique({
    where: { id: receipt.stationId },
    select: { code: true },
  })
  return station ? { id: receipt.id, code: station.code } : null
}
