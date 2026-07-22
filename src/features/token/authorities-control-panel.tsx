import type { AuthorityFact } from "@/types/market";
import { AuthorityStatusList } from "@/features/token/authority-status";

export function AuthoritiesControlPanel({ authorities }: { authorities: AuthorityFact[] }) {
  return (
    <article className="surface-card flex h-full flex-col rounded-lg p-5 sm:p-6">
      <header className="border-b border-gt-border-soft pb-4">
        <h3 className="text-base font-semibold text-gt-fg">Authorities and Control</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gt-muted">
          Verified market and transfer-control states from the current project data.
        </p>
      </header>

      <AuthorityStatusList authorities={authorities} className="mt-4 flex-1" />
    </article>
  );
}
