// Brand mark: a fuel-gauge glyph (petroleum operations). Inherits `currentColor`
// so callers set the color (brass on the inked sidebar / login).
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="9"
        fill="currentColor"
        fillOpacity="0.12"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      {/* gauge arc */}
      <path d="M11 26 A 9 9 0 1 1 29 26" strokeWidth="2.3" strokeLinecap="round" />
      {/* tick marks */}
      <path d="M20 9.5 V 12" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.7" />
      <path
        d="M11.2 14.2 L 12.9 15.9"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
      <path
        d="M28.8 14.2 L 27.1 15.9"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeOpacity="0.7"
      />
      {/* needle */}
      <path d="M20 25 L 26 16" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="20" cy="25" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
