import { Navigate, useLocation } from 'react-router-dom';
import { getStorefrontPath } from '../utils/storefronts';

type BusinessLine = 'three_squares' | 'latte_stone' | 'catering';

interface BusinessLineEntryPageProps {
  businessLine: BusinessLine;
}

export default function BusinessLineEntryPage({ businessLine }: BusinessLineEntryPageProps) {
  const location = useLocation();
  const canonicalPath = getStorefrontPath(businessLine);
  const [pathname, canonicalQuery = ''] = canonicalPath.split('?');
  const params = new URLSearchParams(canonicalQuery);
  const existingParams = new URLSearchParams(location.search);

  existingParams.forEach((value, key) => {
    if (key === 'business_line') {
      return;
    }

    if (!params.has(key)) {
      params.set(key, value);
    }
  });

  const queryString = params.toString();

  return <Navigate to={`${pathname}${queryString ? `?${queryString}` : ''}`} replace />;
}
