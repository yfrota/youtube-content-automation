// Halo Studio mark — 5 elliptical petals in a pentagon, one per platform,
// each with a radial gradient from white (flower center) to its pastel
// color (petal tip). All five gradients share the same center/radius
// (userSpaceOnUse at the flower's local origin) and only differ in their end
// color, so the white-to-pastel fade lines up consistently across petals
// regardless of each petal's rotation.

interface Petal {
  angle: number; // degrees, clockwise from the +x axis
  color: string;
  label: string;
}

const PETALS: Petal[] = [
  { angle: -90, color: "#FFB3B3", label: "YouTube" },
  { angle: -18, color: "#FBBFD4", label: "Instagram" },
  { angle: 54, color: "#A8CAFF", label: "LinkedIn" },
  { angle: 126, color: "#A8EEC1", label: "Spotify" },
  { angle: 198, color: "#C4B5FD", label: "TikTok" },
];

const GRADIENT_RADIUS = 90;
const PETAL_OFFSET = 42;
const PETAL_RX = 46;
const PETAL_RY = 22;

const HALO_LOGO_PETALS = [
  { angle: 0, color: "#fca5a5" },
  { angle: 72, color: "#f9a8d4" },
  { angle: 144, color: "#c4b5fd" },
  { angle: 216, color: "#6ee7b7" },
  { angle: 288, color: "#93c5fd" },
];

export function HaloLogo({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-label="Halo Studio">
      <defs>
        {HALO_LOGO_PETALS.map((p, i) => (
          <radialGradient
            key={i}
            id={`halo-logo-g${i}`}
            cx="60"
            cy="60"
            r="55"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={p.color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={p.color} stopOpacity="0.2" />
          </radialGradient>
        ))}
      </defs>

      {HALO_LOGO_PETALS.map((p, i) => (
        <ellipse
          key={i}
          cx="60"
          cy="60"
          rx="13"
          ry="26"
          fill={`url(#halo-logo-g${i})`}
          transform={`rotate(${p.angle} 60 60) translate(0 -22)`}
        />
      ))}

      <circle cx="60" cy="60" r="18" fill="white" opacity="0.9" />
      <text
        x="60"
        y="64"
        fontSize="8"
        letterSpacing="1"
        fill="#9b8ea0"
        textAnchor="middle"
      >
        HALO
      </text>
    </svg>
  );
}

export function HaloMark({ className, title = "Halo Studio" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        {PETALS.map((petal, i) => (
          <radialGradient
            key={i}
            id={`halo-petal-${i}`}
            cx="0"
            cy="0"
            r={GRADIENT_RADIUS}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={petal.color} />
          </radialGradient>
        ))}
      </defs>

      <g transform="translate(100,100)">
        {PETALS.map((petal, i) => (
          <g key={i} transform={`rotate(${petal.angle})`}>
            <ellipse
              cx={PETAL_OFFSET}
              cy="0"
              rx={PETAL_RX}
              ry={PETAL_RY}
              fill={`url(#halo-petal-${i})`}
            />
          </g>
        ))}

        <circle r="40" fill="#ffffff" />
        <text
          x="0"
          y="1"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="12"
          fontWeight={200}
          fill="#333333"
          style={{ letterSpacing: "4px", fontFamily: "var(--font-inter), sans-serif" }}
        >
          HALO
        </text>
      </g>
    </svg>
  );
}
