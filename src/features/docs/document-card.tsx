import { BadgeCheck, Download, ExternalLink, FileText } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OfficialDocument } from "@/types/transparency";
import { formatDate } from "@/lib/formatters/number";

const CATEGORY_VARIANT = {
  Policy: "gold",
  Governance: "info",
  Reference: "neutral",
} as const;

export function DocumentCard({ document }: { document: OfficialDocument }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gt-surface-3 text-gt-emerald-bright">
            <FileText className="size-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-gt-offwhite">{document.title}</h3>
            <p className="mt-0.5 text-xs text-gt-muted-2">
              v{document.version} · {document.format} · Updated {formatDate(document.updatedAt)}
            </p>
          </div>
        </div>
        <Badge variant={CATEGORY_VARIANT[document.category]}>{document.category}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="text-sm leading-relaxed text-gt-muted">{document.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          {document.verifiedOfficial && (
            <span className="inline-flex items-center gap-1 text-xs text-gt-emerald-bright">
              <BadgeCheck className="size-3.5" aria-hidden />
              Verified official document
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={document.path} target="_blank" rel="noopener noreferrer">
                Open <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <a href={document.path} download>
                <Download className="size-3.5" aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
