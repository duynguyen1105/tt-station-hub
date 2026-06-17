import { PlaceholderPage } from '@/components/shared/placeholder-page'
import { requireRole } from '@/lib/auth/session'

export default async function SettingsZaloPage() {
  await requireRole('admin')
  return (
    <PlaceholderPage
      title="Cài đặt — Zalo"
      note="Mapping nhóm Zalo → trạm và nút mô phỏng nhận ảnh (ZALO_MOCK). Màn hình cấu hình đang được hoàn thiện."
    />
  )
}
