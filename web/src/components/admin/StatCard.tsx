import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Tailwind colour classes for the icon badge, e.g. 'bg-blue-50 text-blue-600' */
  iconColor?: string;
  /** Optional colour override for the value text */
  valueColor?: string;
  /** Optional link shown below the value */
  link?: { text: string; to: string };
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'bg-gray-100 text-gray-600',
  valueColor = 'text-gray-900',
  link,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 hover:shadow-md transition w-full xl:max-w-[280px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">
            {label}
          </p>
          <p
            className={`text-lg sm:text-xl md:text-2xl xl:text-3xl font-bold mt-2 ${valueColor} tabular-nums leading-tight wrap-break-word`}
            title={typeof value === 'string' ? value : value.toString()}
          >
            {value}
          </p>
          {link && (
            <Link
              to={link.to}
              className="inline-block mt-3 text-xs font-medium text-tsPrimary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tsPrimary focus-visible:ring-offset-2 rounded"
            >
              {link.text} &rarr;
            </Link>
          )}
        </div>
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconColor}`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
