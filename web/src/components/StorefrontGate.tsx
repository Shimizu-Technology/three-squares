import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import useAppConfig from '../hooks/useAppConfig';
import type { StorefrontKey } from '../utils/storefronts';
import { isStorefrontEnabled } from '../utils/storefronts';

interface StorefrontGateProps {
  storefront: StorefrontKey;
  children: ReactElement;
  redirectTo?: string;
}

export default function StorefrontGate({
  storefront,
  children,
  redirectTo = '/products',
}: StorefrontGateProps) {
  const config = useAppConfig();

  if (config == null) {
    return (
      <div role="status" className="min-h-[40vh] bg-warm-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-warm-200 border-t-tsPrimary" />
          <p className="mt-4 text-sm font-medium text-warm-600">Loading storefront...</p>
        </div>
      </div>
    );
  }

  if (!isStorefrontEnabled(config, storefront)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
