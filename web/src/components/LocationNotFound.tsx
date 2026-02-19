import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LocationNotFoundProps {
  slug: string;
}

/**
 * Friendly message when a location slug doesn't match any active location.
 */
export default function LocationNotFound({ slug }: LocationNotFoundProps) {
  return (
    <div className="min-h-screen bg-warm-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <MapPin className="w-16 h-16 text-warm-300 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-warm-900 mb-3">Location Not Found</h1>
        <p className="text-warm-600 mb-2">
          We couldn't find an active location matching "<strong>{slug}</strong>".
        </p>
        <p className="text-warm-500 mb-8 text-sm">
          It may have been moved, renamed, or is no longer available.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/locations"
            className="px-6 py-3 bg-tsPrimary text-white font-medium rounded-lg hover:bg-primary-dark transition"
          >
            Browse All Locations
          </Link>
          <Link
            to="/menu"
            className="px-6 py-3 bg-white text-warm-700 font-medium rounded-lg border border-warm-200 hover:bg-warm-50 transition"
          >
            View Full Menu
          </Link>
        </div>
      </div>
    </div>
  );
}
