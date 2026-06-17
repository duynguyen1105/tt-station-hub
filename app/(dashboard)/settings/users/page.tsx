import { PlaceholderPage } from '@/components/shared/placeholder-page'
import { requireRole } from '@/lib/auth/session'

export default async function SettingsUsersPage() {
  await requireRole('admin')
  return (
    <PlaceholderPage
      title="Cài đặt — Người dùng"
      note="Quản lý tài khoản và phân quyền (Admin / Kế toán / Người xem). Màn hình quản lý đang được hoàn thiện."
    />
  )
}
