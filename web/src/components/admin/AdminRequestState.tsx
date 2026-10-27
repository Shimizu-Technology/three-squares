import { Button } from '../ui/Button';

interface AdminRequestStateProps {
  resource: string;
  loading: boolean;
  error: boolean;
  hasData: boolean;
  onRetry: () => void;
}

/** Keep failures visible through retry, and label any retained data as stale. */
export default function AdminRequestState({ resource, loading, error, hasData, onRetry }: AdminRequestStateProps) {
  if (!loading && !error) return null;

  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border p-4 ${
        error ? 'border-red-200 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-700'
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold">{error ? `${resource} unavailable` : `${hasData ? 'Refreshing' : 'Loading'} ${resource.toLowerCase()}…`}</p>
        {error && <p className="text-sm mt-1">We couldn’t load {resource.toLowerCase()}. Please try again.</p>}
        {hasData && <p className="text-sm mt-1">Showing last loaded data. It may be out of date.</p>}
      </div>
      {error && (
        <Button variant="secondary" onClick={onRetry} disabled={loading} className="shrink-0 self-start sm:self-auto">
          {loading ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </div>
  );
}
