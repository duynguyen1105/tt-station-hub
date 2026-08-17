import { DocumentForm } from '@/components/documents/document-form'
import { DocumentsNote } from '@/components/documents/documents-note'
import { ExpiryBadge } from '@/components/documents/expiry-badge'
import { requireStationAccess } from '@/lib/auth/station-guard'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { REVIEW_URL_TTL_SECONDS, signedUrlsForPaths } from '@/lib/storage/photo-storage'
import { vi } from '@/messages/vi'

const docTypeLabel = (type: string) => (vi.docType as Record<string, string>)[type] ?? type

export default async function StationDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireStationAccess(id)
  const [station, documents] = await Promise.all([
    prisma.station.findUnique({ where: { id }, select: { documentsNote: true } }),
    prisma.stationDocument.findMany({
      where: { stationId: id },
      orderBy: { expiryDate: 'asc' },
    }),
  ])

  // fileUrl holds a storage path; one bulk call signs every scan link.
  const scanUrlByPath = await signedUrlsForPaths(
    documents.map((d) => d.fileUrl),
    REVIEW_URL_TTL_SECONDS
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-sm font-medium">{vi.documents.title}</h2>
        <DocumentForm stationId={id} />
      </div>

      {/* The admin's requirement bar — what must be on file at this station. */}
      <DocumentsNote
        stationId={id}
        note={station?.documentsNote ?? null}
        canEdit={user.role === 'admin'}
      />

      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.documents.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.documents.name}</th>
              <th className="p-2">{vi.documents.type}</th>
              <th className="p-2">{vi.documents.number}</th>
              <th className="p-2">{vi.documents.signedDate}</th>
              <th className="p-2">{vi.documents.expiry}</th>
              <th className="p-2">{vi.documents.scan}</th>
              <th className="p-2">{vi.shifts.status}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const scanUrl = doc.fileUrl ? scanUrlByPath.get(doc.fileUrl) : undefined
              return (
                <tr key={doc.id} className="border-b">
                  <td className="p-2">{doc.docName}</td>
                  <td className="p-2">{docTypeLabel(doc.docType)}</td>
                  <td className="p-2 font-mono">{doc.docNumber ?? '—'}</td>
                  <td className="p-2">{doc.issuedDate ? formatDate(doc.issuedDate) : '—'}</td>
                  <td className="p-2">{doc.expiryDate ? formatDate(doc.expiryDate) : '—'}</td>
                  <td className="p-2">
                    {scanUrl ? (
                      <a
                        href={scanUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {vi.documents.view}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">
                    <ExpiryBadge status={doc.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
