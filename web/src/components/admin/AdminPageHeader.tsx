import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Right-aligned action area (buttons, etc.) */
  actions?: ReactNode;
}

export default function AdminPageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="mb-6">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-sm mb-3">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={i} className="flex items-center gap-1.5">
                {crumb.path && !isLast ? (
                  <Link
                    to={crumb.path}
                    className="text-gray-500 hover:text-tsPrimary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 rounded"
                  >
                    {crumb.label}
                  </Link>
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
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
