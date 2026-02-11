import { Navigate, useLocation } from 'react-router-dom';

type BusinessLine = 'three_squares' | 'latte_stone' | 'catering';

interface BusinessLineEntryPageProps {
  businessLine: BusinessLine;
}

export default function BusinessLineEntryPage({ businessLine }: BusinessLineEntryPageProps) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  // Dedicated storefront routes always enforce a single business context.
  params.set('business_line', businessLine);
  const queryString = params.toString();

  return <Navigate to={`/products${queryString ? `?${queryString}` : ''}`} replace />;
}
