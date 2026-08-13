import { z } from 'zod'

import { notFound } from 'next/navigation'

import { ImportCancelButton } from '@/components/inventory/import-cancel-button'
import { ReceiptDocUpload } from '@/components/inventory/receipt-doc-upload'
import { StatusBadge } from '@/components/shared/status-badge'
import { requireUser } from '@/lib/auth/session'
import { formatDateTime, formatLiters } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { REVIEW_URL_TTL_SECONDS, getSignedUrl } from '@/lib/storage/photo-storage'
import { fuelTypeLabel } from '@/lib/ui/status'
import { vi } from '@/messages/vi'

// The receipt's sections are stored as JSON exactly as confirmed; a lenient
// re-parse (arrays degrade to empty, old per-column seals tolerated) keeps a
// pre-standard receipt rendering instead of crashing the page.
const num = z
  .number()
  .nullish()
  .transform((v) => v ?? null)
const str = z
  .string()
  .nullish()
  .transform((v) => v ?? null)
const sideSchema = z
  .object({ temperatureC: num, heightMm: num, bookLiters: num, baremLiters: num })
  .partial()
  .transform((s) => ({
    temperatureC: s.temperatureC ?? null,
    heightMm: s.heightMm ?? null,
    bookLiters: s.bookLiters ?? null,
    baremLiters: s.baremLiters ?? null,
  }))
const productsSchema = z
  .array(
    z.object({
      productLabel: str,
      warehouse: str,
      quantityLiters: num,
      exportSlipNo: str,
      sealNo: str, // pre-standard receipts kept a seal per column
    })
  )
  .catch([])
const compartmentsSchema = z
  .array(
    z.object({
      compartmentNo: num,
      liters: num,
      valvePosition: str,
      compensationLiters: num,
      temperatureC: num,
    })
  )
  .catch([])
const tanksSchema = z
  .array(
    z.object({
      tankLabel: str,
      tankCode: str,
      fuelType: str,
      importedLiters: num,
      before: sideSchema.catch({
        temperatureC: null,
        heightMm: null,
        bookLiters: null,
        baremLiters: null,
      }),
      after: sideSchema.catch({
        temperatureC: null,
        heightMm: null,
        bookLiters: null,
        baremLiters: null,
      }),
    })
  )
  .catch([])
const pumpsSchema = z
  .array(
    z.object({
      pumpLabel: str,
      before: z.object({ electronic: num, mechanical: num }).partial().catch({}),
      after: z.object({ electronic: num, mechanical: num }).partial().catch({}),
    })
  )
  .catch([])

const cell = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : String(value)

function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null
  return Math.round((b - a) * 100) / 100
}

/**
 * Read-only view of one saved biên bản giao nhận: every section as confirmed,
 * who booked it, the biên bản pages, and the "tài liệu nhập hàng" gallery for
 * cross-checking the paper — with an upload box to add documents later.
 */
export default async function ImportReceiptPage({
  params,
}: {
  params: Promise<{ id: string; receiptId: string }>
}) {
  const user = await requireUser()
  const { id: stationId, receiptId } = await params

  const receipt = await prisma.fuelImportReceipt.findUnique({ where: { id: receiptId } })
  if (!receipt || receipt.stationId !== stationId) notFound()

  const [docs, childImports, creator] = await Promise.all([
    prisma.fuelImportDocument.findMany({
      where: { receiptId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.fuelImport.findMany({ where: { receiptId }, orderBy: { tankCode: 'asc' } }),
    receipt.createdBy
      ? prisma.profile.findUnique({ where: { id: receipt.createdBy }, select: { fullName: true } })
      : null,
  ])

  const products = productsSchema.parse(receipt.products ?? [])
  const compartments = compartmentsSchema.parse(receipt.compartments ?? [])
  const tanks = tanksSchema.parse(receipt.tankChecks ?? [])
  const pumps = pumpsSchema.parse(receipt.pumpChecks ?? [])

  const signedDocs = (
    await Promise.all(
      docs.map(async (doc) => ({
        doc,
        url: await getSignedUrl(doc.storagePath, REVIEW_URL_TTL_SECONDS).catch(() => null),
      }))
    )
  ).filter((d): d is { doc: (typeof docs)[number]; url: string } => d.url !== null)
  const bienBanDocs = signedDocs.filter(({ doc }) => doc.kind === 'bien_ban')
  const relatedDocs = signedDocs.filter(({ doc }) => doc.kind !== 'bien_ban')

  const canEdit = user.role !== 'viewer'
  const perColumnSeals = products.map((p) => p.sealNo).filter(Boolean)

  const gallery = (items: typeof signedDocs) => (
    <div className="flex flex-wrap gap-3">
      {items.map(({ doc, url }) =>
        doc.contentType === 'application/pdf' ? (
          <a
            key={doc.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-primary flex h-32 w-32 items-center justify-center rounded border text-sm underline underline-offset-2"
          >
            {doc.fileName ?? 'PDF'}
          </a>
        ) : (
          <a key={doc.id} href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            <img
              src={url}
              alt={doc.fileName ?? doc.kind}
              className="h-32 w-32 rounded border object-cover"
            />
          </a>
        )
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {vi.imports.bienBanTitle} — {formatDateTime(receipt.receiptDate)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {vi.imports.creator}: {creator?.fullName ?? '—'} · {vi.imports.savedAt}{' '}
          {formatDateTime(receipt.createdAt)}
        </p>
      </div>

      {/* Header fields as on the paper */}
      <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{vi.imports.staffName}</span>
          <span>{cell(receipt.staffName)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{vi.imports.driverName}</span>
          <span>{cell(receipt.driverName)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{vi.imports.truckPlate}</span>
          <span className="font-mono">{cell(receipt.truckPlate)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{vi.imports.sealNo}</span>
          <span className="font-mono">
            {cell(
              receipt.sealNo ?? (perColumnSeals.length > 0 ? perColumnSeals.join(' · ') : null)
            )}
          </span>
        </div>
      </div>

      {products.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.imports.productsTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.imports.productLabel}</th>
                  <th className="p-2">{vi.imports.warehouse}</th>
                  <th className="p-2 text-right">{vi.imports.productQuantity}</th>
                  <th className="p-2">{vi.imports.exportSlipNo}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-medium">{cell(p.productLabel)}</td>
                    <td className="p-2">{cell(p.warehouse)}</td>
                    <td className="p-2 text-right font-mono">
                      {p.quantityLiters === null ? '—' : formatLiters(p.quantityLiters)}
                    </td>
                    <td className="p-2 font-mono">{cell(p.exportSlipNo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {compartments.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.imports.compartmentsTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.imports.compartment}</th>
                  <th className="p-2 text-right">{vi.imports.compartmentLiters}</th>
                  <th className="p-2">{vi.imports.valvePosition}</th>
                  <th className="p-2 text-right">{vi.imports.compensationLiters}</th>
                  <th className="p-2 text-right">{vi.imports.truckTemp}</th>
                </tr>
              </thead>
              <tbody>
                {compartments.map((c, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-medium">
                      {vi.imports.compartment} {cell(c.compartmentNo)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {c.liters === null ? '—' : formatLiters(c.liters)}
                    </td>
                    <td className="p-2 font-mono">{cell(c.valvePosition)}</td>
                    <td className="p-2 text-right font-mono">{cell(c.compensationLiters)}</td>
                    <td className="p-2 text-right font-mono">{cell(c.temperatureC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-1 text-sm">
        <h3 className="font-semibold">{vi.imports.vehicleCheckTitle}</h3>
        <p>
          <span className="text-muted-foreground">{vi.imports.vehicleCheck}: </span>
          {cell(receipt.vehicleCheck)}
        </p>
      </section>

      {tanks.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.imports.tanksTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2"></th>
                  <th className="border-l p-2 text-center" colSpan={4}>
                    {vi.imports.before}
                  </th>
                  <th className="border-l p-2 text-center" colSpan={4}>
                    {vi.imports.after}
                  </th>
                  <th className="border-l p-2" colSpan={2}></th>
                </tr>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.inventory.tank}</th>
                  <th className="border-l p-2">{vi.imports.tankTemp}</th>
                  <th className="p-2">{vi.imports.heightMm}</th>
                  <th className="p-2">{vi.imports.bookLiters}</th>
                  <th className="p-2">{vi.imports.baremLiters}</th>
                  <th className="border-l p-2">{vi.imports.tankTemp}</th>
                  <th className="p-2">{vi.imports.heightMm}</th>
                  <th className="p-2">{vi.imports.bookLiters}</th>
                  <th className="p-2">{vi.imports.baremLiters}</th>
                  <th className="border-l p-2 text-right">{vi.imports.importedLiters}</th>
                  <th className="p-2">{vi.inventory.fuelType}</th>
                </tr>
              </thead>
              <tbody>
                {tanks.map((t, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-medium whitespace-nowrap">{cell(t.tankLabel)}</td>
                    <td className="border-l p-2 font-mono">{cell(t.before.temperatureC)}</td>
                    <td className="p-2 font-mono">{cell(t.before.heightMm)}</td>
                    <td className="p-2 font-mono">{cell(t.before.bookLiters)}</td>
                    <td className="p-2 font-mono">{cell(t.before.baremLiters)}</td>
                    <td className="border-l p-2 font-mono">{cell(t.after.temperatureC)}</td>
                    <td className="p-2 font-mono">{cell(t.after.heightMm)}</td>
                    <td className="p-2 font-mono">{cell(t.after.bookLiters)}</td>
                    <td className="p-2 font-mono">{cell(t.after.baremLiters)}</td>
                    <td className="border-l p-2 text-right font-mono font-semibold">
                      {t.importedLiters === null ? '—' : formatLiters(t.importedLiters)}
                    </td>
                    <td className="p-2">{t.fuelType ? fuelTypeLabel(t.fuelType) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pumps.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.imports.pumpsTitle}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2"></th>
                  <th className="border-l p-2 text-center" colSpan={2}>
                    {vi.imports.before}
                  </th>
                  <th className="border-l p-2 text-center" colSpan={2}>
                    {vi.imports.after}
                  </th>
                  <th className="border-l p-2 text-center" colSpan={2}>
                    {vi.imports.pumpDiff}
                  </th>
                </tr>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="p-2">{vi.imports.pump}</th>
                  <th className="border-l p-2">{vi.imports.totalElectronic}</th>
                  <th className="p-2">{vi.imports.totalMechanical}</th>
                  <th className="border-l p-2">{vi.imports.totalElectronic}</th>
                  <th className="p-2">{vi.imports.totalMechanical}</th>
                  <th className="border-l p-2 text-right">{vi.imports.totalElectronic}</th>
                  <th className="p-2 text-right">{vi.imports.totalMechanical}</th>
                </tr>
              </thead>
              <tbody>
                {pumps.map((p, i) => {
                  const dElec = diff(p.before.electronic, p.after.electronic)
                  const dMech = diff(p.before.mechanical, p.after.mechanical)
                  return (
                    <tr key={i} className="border-b">
                      <td className="p-2 font-medium">{cell(p.pumpLabel)}</td>
                      <td className="border-l p-2 font-mono">{cell(p.before.electronic)}</td>
                      <td className="p-2 font-mono">{cell(p.before.mechanical)}</td>
                      <td className="border-l p-2 font-mono">{cell(p.after.electronic)}</td>
                      <td className="p-2 font-mono">{cell(p.after.mechanical)}</td>
                      <td
                        className={`border-l p-2 text-right font-mono ${
                          dElec ? 'text-destructive font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        {dElec ?? '—'}
                      </td>
                      <td
                        className={`p-2 text-right font-mono ${
                          dMech ? 'text-destructive font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        {dMech ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {receipt.note && (
        <section className="space-y-1 text-sm">
          <h3 className="font-semibold">{vi.imports.noteTitle}</h3>
          <p>{receipt.note}</p>
        </section>
      )}

      {childImports.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{vi.imports.childImports}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="p-2">{vi.inventory.tank}</th>
                <th className="p-2">{vi.inventory.fuelType}</th>
                <th className="p-2 text-right">{vi.imports.liters}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {childImports.map((row) => (
                <tr key={row.id} className={`border-b ${row.canceledAt ? 'opacity-50' : ''}`}>
                  <td className="p-2">{row.tankCode.replace('HAM_', 'Hầm ')}</td>
                  <td className="p-2">{fuelTypeLabel(row.fuelType)}</td>
                  <td className="p-2 text-right font-mono">
                    {formatLiters(Number(row.litersActual))}
                  </td>
                  <td className="p-2 text-right">
                    {row.canceledAt ? (
                      <StatusBadge label={vi.imports.canceled} tone="muted" />
                    ) : canEdit ? (
                      <ImportCancelButton importId={row.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{vi.imports.bienBanPhotos}</h3>
        {bienBanDocs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.imports.noDocs}</p>
        ) : (
          gallery(bienBanDocs)
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{vi.imports.relatedDocs}</h3>
        <p className="text-muted-foreground text-sm">{vi.imports.docsCompareHint}</p>
        {relatedDocs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.imports.noDocs}</p>
        ) : (
          gallery(relatedDocs)
        )}
        {canEdit && <ReceiptDocUpload receiptId={receipt.id} />}
      </section>
    </div>
  )
}
