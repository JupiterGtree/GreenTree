import { Camera, FileText, MapPinned, Receipt, ScrollText, Video } from "lucide-react";
import type { MissionEvidenceItem } from "@/types/mission";

const ICON_MAP: Record<MissionEvidenceItem["kind"], typeof Camera> = {
  photo: Camera,
  document: FileText,
  permit: ScrollText,
  receipt: Receipt,
  geolocation: MapPinned,
  video: Video,
};

export function MissionEvidence({ evidence }: { evidence: MissionEvidenceItem[] }) {
  if (evidence.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gt-border bg-gt-surface/60 px-4 py-6 text-center text-sm text-gt-muted">
        No evidence has been published for this mission yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {evidence.map((item) => {
        const Icon = ICON_MAP[item.kind];
        return (
          <li key={item.id} className="glass-surface-b flex gap-3 rounded-lg p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gt-surface-3 text-gt-emerald-bright">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-gt-fg">{item.title}</p>
              <p className="mt-0.5 text-xs text-gt-muted">{item.note}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
