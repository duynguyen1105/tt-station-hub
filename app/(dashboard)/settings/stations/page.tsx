import { PlaceholderPage } from '@/components/shared/placeholder-page'
import { requireRole } from '@/lib/auth/session'

export default async function SettingsStationsPage() {
  await requireRole('admin')
  return (
    <PlaceholderPage
      title="Cài đặt — Trạm"
      note="Quản lý danh sách trạm (thêm/sửa, gán kế toán, nhóm Zalo). API đã sẵn sàng; màn hình quản lý đang được hoàn thiện."
    />
  )
}
