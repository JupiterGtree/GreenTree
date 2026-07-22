"use client";

import * as React from "react";
import {
  Landmark,
  Layers,
  ShoppingBag,
  Sprout,
  TreeDeciduous,
  Trophy,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NodeDef {
  id: string;
  label: string;
  icon: typeof Wallet;
  angle: number;
  radius: number;
  core?: boolean;
}

const SIZE = 520;
const CENTER = SIZE / 2;

const NODES: NodeDef[] = [
  { id: "wallet", label: "Wallet", icon: Wallet, angle: 0, radius: 0, core: true },
  { id: "digital-tree", label: "Digital Tree", icon: TreeDeciduous, angle: -90, radius: 200 },
  { id: "green-score", label: "Green Score", icon: Trophy, angle: -35, radius: 200 },
  { id: "treedrop", label: "TreeDrop", icon: Sprout, angle: 35, radius: 200 },
  { id: "missions", label: "Missions", icon: Layers, angle: 90, radius: 200 },
  { id: "governance", label: "Governance", icon: Landmark, angle: 145, radius: 200 },
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag, angle: -145, radius: 200 },
];

function toPoint(angleDeg: number, radius: number) {
  const angle = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

export function EcosystemNetwork({ activeId, onHover }: { activeId?: string | null; onHover?: (id: string | null) => void }) {
  const core = toPoint(0, 0);
  const outer = NODES.filter((n) => !n.core);

  return (
    <div className="mx-auto w-full max-w-xl">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Diagram showing the wallet and GTREE token at the center, organically connected to Digital Tree, Green Score, TreeDrop, Missions, Governance and Marketplace modules"
        className="w-full"
      >
        <title>Green Tree ecosystem network</title>
        {outer.map((node) => {
          const point = toPoint(node.angle, node.radius);
          const midX = (core.x + point.x) / 2 + (point.y - core.y) * 0.12;
          const midY = (core.y + point.y) / 2 - (point.x - core.x) * 0.12;
          const isActive = activeId === node.id;
          return (
            <path
              key={`path-${node.id}`}
              d={`M ${core.x} ${core.y} Q ${midX} ${midY} ${point.x} ${point.y}`}
              fill="none"
              stroke={isActive ? "var(--gt-emerald-bright)" : "var(--gt-moss)"}
              strokeOpacity={isActive ? 0.9 : 0.35}
              strokeWidth={isActive ? 2.5 : 1.5}
              className="transition-all duration-300"
            />
          );
        })}

        {outer.map((node, i) => {
          const a = toPoint(node.angle, node.radius);
          const nextNode = outer[(i + 1) % outer.length];
          const b = toPoint(nextNode.angle, nextNode.radius);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const dx = midX - CENTER;
          const dy = midY - CENTER;
          const pull = 1.12;
          return (
            <path
              key={`ring-${node.id}`}
              d={`M ${a.x} ${a.y} Q ${CENTER + dx * pull} ${CENTER + dy * pull} ${b.x} ${b.y}`}
              fill="none"
              stroke="var(--gt-border)"
              strokeWidth={1}
              strokeDasharray="2 6"
            />
          );
        })}

        <g transform={`translate(${core.x} ${core.y})`}>
          <circle r={54} fill="var(--gt-forest)" stroke="var(--gt-emerald-bright)" strokeWidth={2} opacity={0.9} />
          <circle r={54} fill="none" stroke="var(--gt-emerald-bright)" strokeWidth={1} opacity={0.25}>
            <animate attributeName="r" values="54;62;54" dur="4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0;0.25" dur="4s" repeatCount="indefinite" />
          </circle>
          <foreignObject x={-40} y={-32} width={80} height={64}>
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <Wallet className="size-5 text-gt-emerald-bright" aria-hidden />
              <span className="text-[11px] font-semibold text-gt-offwhite">Wallet + GTREE</span>
            </div>
          </foreignObject>
        </g>

        {outer.map((node) => {
          const point = toPoint(node.angle, node.radius);
          const Icon = node.icon;
          const isActive = activeId === node.id;
          return (
            <g
              key={node.id}
              transform={`translate(${point.x} ${point.y})`}
              onMouseEnter={() => onHover?.(node.id)}
              onMouseLeave={() => onHover?.(null)}
              className="cursor-pointer"
            >
              <circle
                r={44}
                fill={isActive ? "var(--gt-surface-3)" : "var(--gt-surface-2)"}
                stroke={isActive ? "var(--gt-emerald-bright)" : "var(--gt-border)"}
                strokeWidth={isActive ? 2 : 1}
                className="transition-all duration-300"
              />
              <foreignObject x={-40} y={-30} width={80} height={60}>
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <Icon className={cn("size-4", isActive ? "text-gt-emerald-bright" : "text-gt-leaf")} aria-hidden />
                  <span className="text-[10px] font-medium leading-tight text-gt-fg">{node.label}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
