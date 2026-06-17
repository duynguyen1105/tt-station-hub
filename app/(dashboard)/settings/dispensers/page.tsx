import { PlaceholderPage } from '@/components/shared/placeholder-page'
import { requireRole } from '@/lib/auth/session'

export default async function SettingsDispensersPage() {
  await requireRole('admin')
  return (
    <PlaceholderPage
      title="Cài đặt — Trụ bơm"
      note="Cấu hình trụ bơm theo trạm (loại nhiên liệu, hầm, đồng hồ). Màn hình quản lý đang được hoàn thiện."
    />
  )
}
