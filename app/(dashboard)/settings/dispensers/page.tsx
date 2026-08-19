import { redirect } from 'next/navigation'

// Trụ bơm are managed on the trạm's own Cấu hình tab (/stations/{id}/config), because a
// trụ belongs to one trạm and its nhiên liệu comes from that trạm's Map nhiên liệu.
// Redirect bookmarked links to the trạm list instead of 404-ing.
export default function SettingsDispensersPage() {
  redirect('/stations')
}
