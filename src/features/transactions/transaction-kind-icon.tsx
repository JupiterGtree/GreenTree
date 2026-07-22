import { ArrowLeftRight, CircleHelp, Landmark, ShoppingBag, XCircle } from "lucide-react";
import type { OnchainActivityType } from "@/types/transaction";

const ICON_MAP: Record<OnchainActivityType, typeof ShoppingBag> = {
  FOUNDATION_DIRECT_BUY: ShoppingBag,
  GTREE_TRANSFER: ArrowLeftRight,
  TREASURY_ACTIVITY: Landmark,
  FAILED: XCircle,
  UNKNOWN: CircleHelp,
};

export function TransactionKindIcon({ kind, className }: { kind: OnchainActivityType; className?: string }) {
  const Icon = ICON_MAP[kind];
  return <Icon className={className} aria-hidden />;
}
