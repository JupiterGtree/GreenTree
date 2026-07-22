import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { MissionStatus } from "@/types/mission";
import type { AuthorityStatusValue } from "@/types/market";
import type { TransactionStatus } from "@/types/transaction";

const MISSION_STATUS_MAP: Record<MissionStatus, { label: string; variant: BadgeProps["variant"] }> = {
  proposed: { label: "Proposed", variant: "neutral" },
  "under-review": { label: "Under review", variant: "info" },
  approved: { label: "Approved", variant: "info" },
  "in-progress": { label: "In progress", variant: "emerald" },
  "partially-completed": { label: "Partially completed", variant: "gold" },
  completed: { label: "Completed", variant: "emerald" },
  delayed: { label: "Delayed", variant: "warning" },
  suspended: { label: "Suspended", variant: "warning" },
  cancelled: { label: "Cancelled", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
};

export function MissionStatusBadge({ status, className }: { status: MissionStatus; className?: string }) {
  const config = MISSION_STATUS_MAP[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}

const AUTHORITY_STATUS_MAP: Record<AuthorityStatusValue, { label: string; variant: BadgeProps["variant"] }> = {
  verified: { label: "Verified", variant: "emerald" },
  revoked: { label: "Revoked", variant: "emerald" },
  "not-retained": { label: "Not retained", variant: "emerald" },
  "multisig-controlled": { label: "Multisig controlled", variant: "info" },
  "public-market": { label: "Public market", variant: "gold" },
  unrestricted: { label: "Unrestricted", variant: "emerald" },
  unavailable: { label: "Unable to verify", variant: "neutral" },
  "documented-policy": { label: "Documented policy", variant: "neutral" },
};

export function AuthorityStatusBadge({ status, className }: { status: AuthorityStatusValue; className?: string }) {
  const config = AUTHORITY_STATUS_MAP[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}

const TX_STATUS_MAP: Record<TransactionStatus, { label: string; variant: BadgeProps["variant"] }> = {
  confirmed: { label: "Confirmed", variant: "emerald" },
  failed: { label: "Failed", variant: "danger" },
};

export function TransactionStatusBadge({ status, className }: { status: TransactionStatus; className?: string }) {
  const config = TX_STATUS_MAP[status];
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
