export function TreeRingsBackground({ className }: { className?: string }) {
  const rings = [60, 100, 140, 180, 220, 260];
  return (
    <svg
      viewBox="0 0 600 600"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {rings.map((r, i) => (
        <circle
          key={r}
          cx="300"
          cy="300"
          r={r}
          fill="none"
          stroke="var(--gt-leaf)"
          strokeOpacity={0.08 + i * 0.015}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
