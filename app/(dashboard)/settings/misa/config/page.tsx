import { MisaConfigForm } from '@/components/misa-export/config-form'
import { prisma } from '@/lib/prisma'
import { vi } from '@/messages/vi'

export default async function MisaConfigPage() {
  const config = await prisma.misaGlobalConfig.findUnique({ where: { id: 'default' } })

  const rows = [
    { label: vi.misaSettings.revenueAccount, value: config?.revenueAccount },
    { label: vi.misaSettings.costAccount, value: config?.costAccount },
    { label: vi.misaSettings.stockAccount, value: config?.stockAccount },
    { label: vi.misaSettings.creditDebitAccount, value: config?.creditDebitAccount },
    { label: vi.misaSettings.cashDebitAccount, value: config?.cashDebitAccount },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{vi.misaSettings.configNote}</p>
        <MisaConfigForm config={config} />
      </div>

      {config === null ? (
        <p className="text-muted-foreground text-sm">{vi.misaSettings.noConfig}</p>
      ) : (
        <dl className="divide-y text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="readout">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
