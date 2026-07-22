import { getFoundationTransactions } from "@/lib/admin/operations-data";
import { getFoundationInventorySnapshot } from "@/lib/purchase/foundation-inventory-server";
import { FoundationSaleProgressVisual } from "@/features/market/foundation-sale-progress-visual";

export async function FoundationSaleProgress({ fill = false }: { fill?: boolean }) {
  const activity = getFoundationTransactions({ view: "CONFIRMED", page: 1, pageSize: 1 });
  const inventory = await getFoundationInventorySnapshot().catch(() => null);

  if (!activity.available || !inventory) {
    return <FoundationSaleProgressVisual status="unavailable" fill={fill} />;
  }

  const targetUnits = BigInt(inventory.totalAllocationBaseUnits);
  const soldUnits = BigInt(activity.summary.confirmedOutputTokenUnits);
  const confirmedLamports = BigInt(activity.summary.confirmedInputLamports);
  const remainingUnits = targetUnits > soldUnits ? targetUnits - soldUnits : 0n;
  const progressMillionths = targetUnits > 0n ? (soldUnits * 100_000_000n) / targetUnits : 0n;

  return (
    <FoundationSaleProgressVisual
      status="live"
      targetGtree={inventory.totalAllocationGtree}
      confirmedGtree={toDecimal(soldUnits, inventory.tokenDecimals)}
      remainingGtree={toDecimal(remainingUnits, inventory.tokenDecimals)}
      confirmedSol={toDecimal(confirmedLamports, 9)}
      availableInventoryGtree={inventory.spendableGtree}
      progressPercent={Number(progressMillionths) / 1_000_000}
      progressLabel={formatProgress(soldUnits, targetUnits)}
      fill={fill}
    />
  );
}

function toDecimal(value: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatProgress(completed: bigint, target: bigint) {
  if (target <= 0n || completed <= 0n) return "0.00%";
  const hundredths = (completed * 10_000n) / target;
  if (hundredths === 0n) return "<0.01%";
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}
