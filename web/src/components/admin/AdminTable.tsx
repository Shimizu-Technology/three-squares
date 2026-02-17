import { useState, type ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AdminColumn<T> {
  key: string;
  header: string;
  /** If true the column is sortable */
  sortable?: boolean;
  /** Custom cell renderer. Falls back to row[key] */
  render?: (row: T) => ReactNode;
  /** Extra Tailwind classes on <th> and <td> */
  className?: string;
  /** Minimum width utility class, e.g. 'min-w-[180px]' */
  minWidth?: string;
}

interface AdminTableProps<T> {
  columns: AdminColumn<T>[];
  data: T[];
  /** Unique key extractor */
  rowKey: (row: T) => string | number;
  /** Called when a row is clicked */
  onRowClick?: (row: T) => void;
  /** External sort control (if omitted, table manages its own state) */
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  /** Loading state */
  loading?: boolean;
  /** Custom empty-state content */
  emptyState?: ReactNode;
  /** Optional mobile card renderer — shown on small screens instead of the table */
  mobileCard?: (row: T) => ReactNode;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AdminTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  onRowClick,
  sortBy: externalSortBy,
  sortDir: externalSortDir,
  onSort: externalOnSort,
  loading = false,
  emptyState,
  mobileCard,
}: AdminTableProps<T>) {
  // Internal sort state (used when no external sort is supplied)
  const [internalSortBy, setInternalSortBy] = useState<string>('');
  const [internalSortDir, setInternalSortDir] = useState<'asc' | 'desc'>('asc');

  const sortBy = externalSortBy ?? internalSortBy;
  const sortDir = externalSortDir ?? internalSortDir;

  const handleSort = (key: string) => {
    if (externalOnSort) {
      externalOnSort(key);
    } else {
      if (internalSortBy === key) {
        setInternalSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setInternalSortBy(key);
        setInternalSortDir('asc');
      }
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    );
  };

  /* Loading skeleton */
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="animate-pulse">
          <div className="h-12 bg-gray-50" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border-t border-gray-100 px-6 py-4 flex gap-6">
              {columns.map((_, j) => (
                <div key={j} className="h-4 bg-gray-100 rounded flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Empty state */
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        {emptyState || (
          <>
            <div className="mb-4">
              <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No results found</h3>
            <p className="text-gray-500">Try adjusting your filters or search query.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${mobileCard ? 'hidden md:block' : ''}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/80">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''
                    } ${col.minWidth || ''} ${col.className || ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && <SortIcon col={col.key} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={`hover:bg-gray-50 transition ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-6 py-4 text-sm ${col.className || ''}`}
                    >
                      {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      {mobileCard && (
        <div className="md:hidden space-y-4">
          {data.map((row) => (
            <div key={rowKey(row)}>{mobileCard(row)}</div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  totalCount?: number;
  perPage?: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({
  page,
  totalPages,
  totalCount,
  perPage = 25,
  onPageChange,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white px-6 py-4 rounded-xl shadow-sm border border-gray-100">
      {totalCount != null && (
        <p className="text-sm text-gray-700">
          Showing{' '}
          <span className="font-medium">{(page - 1) * perPage + 1}</span> to{' '}
          <span className="font-medium">{Math.min(page * perPage, totalCount)}</span>{' '}
          of <span className="font-medium">{totalCount}</span> results
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
        >
          Previous
        </button>
        <div className="flex gap-1">
          {[...Array(totalPages)].map((_, i) => {
            const p = i + 1;
            if (
              p === 1 ||
              p === totalPages ||
              (p >= page - 1 && p <= page + 1)
            ) {
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`px-3 py-2 rounded-lg transition text-sm ${
                    page === p
                      ? 'bg-tsPrimary text-white'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              );
            }
            if (p === page - 2 || p === page + 2) {
              return (
                <span key={p} className="px-2 py-2 text-gray-400 text-sm">
                  &hellip;
                </span>
              );
            }
            return null;
          })}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
        >
          Next
        </button>
      </div>
    </div>
  );
}
