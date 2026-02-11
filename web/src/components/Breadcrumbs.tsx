import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string; // If no path, it's the current page (not clickable)
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center space-x-2 text-sm mb-4 overflow-x-auto">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={index} className="flex items-center space-x-2 whitespace-nowrap">
            {item.path && !isLast ? (
              <Link
                to={item.path}
                className="text-warm-600 hover:text-tsPrimary transition"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-warm-900 font-medium' : 'text-warm-600'}>
                {item.label}
              </span>
            )}

            {!isLast && (
              <ChevronRight className="w-4 h-4 text-warm-400" />
            )}
          </div>
        );
      })}
    </nav>
  );
}

