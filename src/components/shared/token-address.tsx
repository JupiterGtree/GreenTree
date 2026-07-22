import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { shortenAddress, explorerAddressUrl } from "@/lib/constants/project";
import { ENV } from "@/lib/constants/env";
import { cn } from "@/lib/utils";

interface TokenAddressProps {
  address: string;
  chars?: number;
  className?: string;
  showExplorer?: boolean;
  monospace?: boolean;
}

export function TokenAddress({
  address,
  chars = 4,
  className,
  showExplorer = true,
  monospace = true,
}: TokenAddressProps) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-gt-border bg-gt-surface px-2.5 py-1.5", className)}>
      <span className={cn("text-xs text-gt-fg", monospace && "font-mono")}>{shortenAddress(address, chars)}</span>
      <CopyButton value={address} iconOnly label="Copy address" />
      {showExplorer && (
        <a
          href={explorerAddressUrl(ENV.solscanBaseUrl, address)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View address on explorer"
          className="rounded-md p-1 text-gt-muted transition-colors hover:bg-gt-surface-2 hover:text-gt-emerald-bright"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}
