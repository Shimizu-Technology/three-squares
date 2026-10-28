import { Button } from '../ui/Button';
import { ChevronRight } from 'lucide-react';
import type { ReactNode, Ref } from 'react';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface AdminPageHeaderProps {
  title: string;
  headingRef?: Ref<HTMLHeadingElement>;
  headingTabIndex?: number;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  /** Right-aligned action area (buttons, etc.) */
  actions?: ReactNode;
}

export default function AdminPageHeader({
  title,
  headingRef, headingTabIndex,
  subtitle,
  breadcrumbs,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div data-admin-page-header className="min-w-0 flex-1">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-sm mb-3">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={i} className="flex items-center gap-1.5">
                {crumb.path && !isLast ? (
                  <Button variant="link"
                    to={crumb.path}

                  >
                    {crumb.label}
                  </Button>
                ) : (
                  <span className={isLast ? 'text-gray-900 font-medium' : 'text-gray-500'}>
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Title + Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 ref={headingRef} tabIndex={headingTabIndex} className="text-xl leading-7 sm:text-2xl sm:leading-8 font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-600 leading-5 mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-x-2 gap-y-3">{actions}</div>}
      </div>
    </div>
  );
}
