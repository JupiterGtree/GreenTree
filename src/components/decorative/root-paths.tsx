export function RootPaths({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 400"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <g fill="none" stroke="var(--gt-moss)" strokeWidth="1.25" strokeLinecap="round">
        <path d="M400 40 C 380 120, 320 140, 250 190 C 190 230, 150 260, 90 300" opacity="0.35" />
        <path d="M400 40 C 420 130, 470 150, 530 200 C 590 245, 630 270, 700 310" opacity="0.3" />
        <path d="M400 40 C 400 140, 400 180, 400 260 C 400 310, 380 340, 340 370" opacity="0.25" />
        <path d="M250 190 C 220 220, 190 235, 150 260" opacity="0.2" />
        <path d="M530 200 C 560 225, 590 235, 630 260" opacity="0.2" />
      </g>
      <g fill="var(--gt-emerald-bright)">
        <circle cx="90" cy="300" r="3" opacity="0.7" />
        <circle cx="700" cy="310" r="3" opacity="0.7" />
        <circle cx="340" cy="370" r="3" opacity="0.6" />
        <circle cx="150" cy="260" r="2.5" opacity="0.5" />
        <circle cx="630" cy="260" r="2.5" opacity="0.5" />
      </g>
    </svg>
  );
}
