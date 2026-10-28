import { Button } from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount?: number;
  perPage?: number;
  onPageChange: (page: number) => void;
}

/** At most five numbered targets; layout wraps without horizontal scrolling. */
export function Pagination({page, totalPages, totalCount, perPage = 25, onPageChange}: PaginationProps) {
  if (totalPages <= 1) return null;
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])].filter(p => p > 0 && p <= totalPages).sort((a,b) => a-b);
  return <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4">
    {totalCount != null && <p className="text-sm text-gray-700">Showing {Math.min((page - 1) * perPage + 1, totalCount)} to {Math.min(page * perPage, totalCount)} of {totalCount} results</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(Math.max(1,page-1))}>Previous</Button>
      {pages.map((p,i) => <span key={p} className="inline-flex items-center gap-2">
        {i > 0 && p > pages[i-1] + 1 && <span aria-hidden="true">…</span>}
        <Button variant={p === page ? 'primary' : 'secondary'} aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined} onClick={() => onPageChange(p)}>{p}</Button>
      </span>)}
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages,page+1))}>Next</Button>
    </div>
  </nav>;
}
