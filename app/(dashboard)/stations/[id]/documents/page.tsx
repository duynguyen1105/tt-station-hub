import { DocumentForm } from '@/components/documents/document-form'
import { ExpiryBadge } from '@/components/documents/expiry-badge'
import { requireUser } from '@/lib/auth/session'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

const docTypeLabel = (type: string) => (vi.docType as Record<string, string>)[type] ?? type

export default async function StationDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireUser()
  const { id } = await params
  const documents = await prisma.stationDocument.findMany({
    where: { stationId: id },
    orderBy: { expiryDate: 'asc' },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-sm font-medium">{vi.documents.title}</h2>
        <DocumentForm stationId={id} />
      </div>
      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">{vi.documents.empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="p-2">{vi.documents.name}</th>
              <th className="p-2">{vi.documents.type}</th>
              <th className="p-2">{vi.documents.expiry}</th>
              <th className="p-2">{vi.shifts.status}</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b">
                <td className="p-2">{doc.docName}</td>
                <td className="p-2">{docTypeLabel(doc.docType)}</td>
                <td className="p-2">{doc.expiryDate ? formatDate(doc.expiryDate) : '—'}</td>
                <td className="p-2">
                  <ExpiryBadge status={doc.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
