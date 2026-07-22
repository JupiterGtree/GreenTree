import { cn } from "@/lib/utils";

interface RingDatum {
  id: string;
  radius: number;
  progressPct: number;
  color: string;
  achieved: boolean;
}

export function LiquidityRings({ rings, size = 260 }: { rings: RingDatum[]; size?: number }) {
  const center = size / 2;
  const strokeWidth = 12;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label="Concentric ring diagram showing progress toward each cumulative liquidity threshold"
      className="mx-auto"
    >
      <title>Liquidity threshold progress rings</title>
      {rings.map((ring) => {
        const circumference = 2 * Math.PI * ring.radius;
        const dash = (Math.min(ring.progressPct, 100) / 100) * circumference;
        return (
          <g key={ring.id} transform={`rotate(-90 ${center} ${center})`}>
            <circle
              cx={center}
              cy={center}
              r={ring.radius}
              fill="none"
              stroke="var(--gt-surface-3)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={center}
              cy={center}
              r={ring.radius}
              fill="none"
              stroke={ring.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeLinecap="round"
              className={cn(!ring.achieved && "opacity-90")}
            />
          </g>
        );
      })}
    </svg>
  );
}
