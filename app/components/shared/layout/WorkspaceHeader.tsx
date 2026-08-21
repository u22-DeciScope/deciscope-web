import type { ReactNode } from "react";
import { Link } from "react-router";
import { HiChevronRight } from "react-icons/hi2";

export type WorkspaceHeaderBreadcrumb = {
  label: ReactNode;
  to?: string;
};

export type WorkspaceHeaderConfig = {
  actions?: ReactNode;
  breadcrumbs?: WorkspaceHeaderBreadcrumb[];
  meta?: ReactNode;
  status?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
};

export function WorkspaceHeader({
  actions,
  breadcrumbs,
  meta,
  status,
  subtitle,
  title,
}: WorkspaceHeaderConfig) {
  const hasBreadcrumbs = Boolean(breadcrumbs?.length);

  return (
    <header
      className="ds-surface sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 shrink-0 overflow-hidden rounded-(--ds-radius-panel) md:static"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <div className="flex min-h-13 flex-wrap items-center gap-3 px-4 py-3 md:h-13 md:flex-nowrap md:px-5 md:py-0">
        <div className="min-w-0 flex-1">
          {hasBreadcrumbs ? (
            <WorkspaceHeaderBreadcrumbs breadcrumbs={breadcrumbs ?? []} />
          ) : (
            <WorkspaceHeaderTitle title={title} subtitle={subtitle} />
          )}
        </div>

        {(meta || status || actions) && (
          <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end md:gap-3">
            {meta}
            {status}
            {actions}
          </div>
        )}
      </div>

      {hasBreadcrumbs && (
        <div className="px-4 pb-3 md:hidden">
          <WorkspaceHeaderTitle title={title} subtitle={subtitle} />
        </div>
      )}
    </header>
  );
}

function WorkspaceHeaderBreadcrumbs({ breadcrumbs }: { breadcrumbs: WorkspaceHeaderBreadcrumb[] }) {
  return (
    <nav className="flex min-w-0 items-center gap-2" aria-label="Breadcrumb">
      {breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return (
          <span key={index} className="flex min-w-0 items-center gap-2">
            {breadcrumb.to && !isLast ? (
              <Link
                to={breadcrumb.to}
                className="text-[12px] hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {breadcrumb.label}
              </Link>
            ) : (
              <span
                className="truncate text-[12px] font-medium"
                style={{ color: isLast ? "var(--text-main)" : "var(--text-muted)" }}
              >
                {breadcrumb.label}
              </span>
            )}
            {!isLast && (
              <HiChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-muted)" }} />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function WorkspaceHeaderTitle({ subtitle, title }: { subtitle?: ReactNode; title: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[15px] font-bold" style={{ color: "var(--text-main)" }}>
        {title}
      </p>
      {subtitle ? (
        <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
