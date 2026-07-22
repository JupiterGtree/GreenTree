"use client";

import * as React from "react";
import { FileSearch, Search } from "lucide-react";
import { OFFICIAL_DOCUMENTS } from "@/lib/constants/documents";
import { DocumentCard } from "@/features/docs/document-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DocCategoryFilter = "all" | "Policy" | "Governance" | "Reference";

export function DocumentsExplorer() {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<DocCategoryFilter>("all");

  const filtered = OFFICIAL_DOCUMENTS.filter((doc) => {
    if (category !== "all" && doc.category !== category) return false;
    if (search.trim() && !doc.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-surface-b flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gt-muted-2" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as DocCategoryFilter)}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="Policy">Policy</SelectItem>
            <SelectItem value="Governance">Governance</SelectItem>
            <SelectItem value="Reference">Reference</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-gt-muted-2">Version 2.0.0 document pack</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileSearch} title="No documents match this search" description="Try a different keyword or category." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <DocumentCard key={doc.slug} document={doc} />
          ))}
        </div>
      )}
    </div>
  );
}
