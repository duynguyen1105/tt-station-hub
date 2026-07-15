import { redirect } from 'next/navigation'

// The fuel/warehouse map moved to the station's own MISA tab (/stations/{id}/misa).
// Redirect bookmarked links to the remaining settings tab instead of 404-ing.
export default function MisaFuelMapPage() {
  redirect('/settings/misa/prices')
}
