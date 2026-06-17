export function PlaceholderPage({ title, note }: { title: string; note: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{note}</p>
    </div>
  )
}
