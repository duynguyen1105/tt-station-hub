export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[oklch(0.22_0.025_198)] p-4">
      {/* Blueprint grid, faded toward the edges. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, oklch(1 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.06) 1px, transparent 1px)',
          backgroundSize: '38px 38px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, #000, transparent 75%)',
        }}
      />
      {/* Brass + teal glows for atmosphere. */}
      <div className="pointer-events-none absolute -top-32 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-[oklch(0.72_0.11_78)] opacity-20 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-[-15%] left-[-10%] h-[28rem] w-[28rem] rounded-full bg-[oklch(0.5_0.08_198)] opacity-30 blur-[130px]" />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  )
}
