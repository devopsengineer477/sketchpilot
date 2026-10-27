/**
 * Original mark: a compass-rose "pilot" needle inside a rounded sketch tile —
 * drawing + navigation in one shape. No external assets, so it renders offline.
 */
export function AppLogo({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="SketchPilot"
      className={className}
    >
      <defs>
        <linearGradient id="sp-mark" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#59b0ff" />
          <stop offset="1" stopColor="#1759dd" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#sp-mark)" />
      <path
        d="M16 6.5 19.1 13.6 26 16l-6.9 2.4L16 25.5l-3.1-7.1L6 16l6.9-2.4Z"
        fill="#fff"
        fillOpacity="0.95"
      />
      <circle cx="16" cy="16" r="2.1" fill="#1759dd" />
    </svg>
  );
}
