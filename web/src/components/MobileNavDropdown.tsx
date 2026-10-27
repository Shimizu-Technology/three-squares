import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import useAppConfig from '../hooks/useAppConfig';
import { getEnabledStorefronts, getStorefrontPath } from '../utils/storefronts';

interface MobileNavDropdownProps {
  onItemClick: () => void;
  darkMode?: boolean;
}

export default function MobileNavDropdown({ onItemClick, darkMode = false }: MobileNavDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cart = useCartStore((state) => state.cart);
  const config = useAppConfig();
  const storefronts = getEnabledStorefronts(config);

  const handleStorefrontClick = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    targetBusinessLine: 'three_squares' | 'latte_stone' | 'catering',
    targetLabel: string
  ) => {
    const cartItems = cart?.items || [];
    if (cartItems.length === 0) {
      onItemClick();
      return;
    }

    const cartBusinessLines = Array.from(
      new Set(
        cartItems
          .map((item) => item.product.business_line)
          .filter((line): line is 'three_squares' | 'latte_stone' | 'catering' => Boolean(line))
      )
    );

    const sameContext = cartBusinessLines.length === 1 && cartBusinessLines[0] === targetBusinessLine;
    if (sameContext || cartBusinessLines.length === 0) {
      onItemClick();
      return;
    }

    const confirmSwitch = window.confirm(
      `Your cart already has items from a different storefront context. Switching to ${targetLabel} may hide some items while browsing. Continue?`
    );

    if (!confirmSwitch) {
      event.preventDefault();
      return;
    }

    onItemClick();
  };

  return (
    <div className="space-y-1">
      {/* Shop Header with Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between font-semibold py-2 ${
          darkMode 
            ? 'text-white hover:text-tsGold' 
            : 'text-warm-700 hover:text-tsPrimary'
        }`}
      >
        <span>Shop</span>
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable Sub-menu */}
      {isExpanded && (
        <div className="animate-slide-down">
          {/* Storefront-first navigation */}
          <div className={`pl-3 space-y-1 ml-1 ${darkMode ? 'border-l-2 border-white/20' : 'border-l-2 border-tsPrimary/30'}`}>
            {/* All Products */}
            <Link
              to="/products"
              className={`flex items-center gap-2 py-2 font-medium ${
                darkMode 
                  ? 'text-white/90 hover:text-tsGold' 
                  : 'text-warm-700 hover:text-tsPrimary'
              }`}
              onClick={onItemClick}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              All Products
            </Link>

            {storefronts.length > 0 && (
              <>
                <p className={`text-xs uppercase tracking-wider font-semibold py-2 ${darkMode ? 'text-white/40' : 'text-warm-400'}`}>
                  Shop by Business
                </p>
                {storefronts.map((storefront) => (
                  <Link
                    key={storefront.key}
                    to={getStorefrontPath(storefront.key)}
                    className={`block py-2 ${
                      darkMode
                        ? 'text-white/80 hover:text-tsGold'
                        : 'text-warm-700 hover:text-tsPrimary'
                    }`}
                    onClick={(event) => handleStorefrontClick(event, storefront.key, storefront.label)}
                  >
                    <span className="block font-medium">{storefront.label}</span>
                    <span className={`block text-sm mt-0.5 ${
                      darkMode ? 'text-white/45' : 'text-warm-500'
                    }`}>
                      {storefront.description}
                    </span>
                  </Link>
                ))}
              </>
            )}

            <Link
              to="/collections"
              className={`block py-2 font-medium hover:underline ${
                darkMode ? 'text-tsGold' : 'text-tsPrimary'
              }`}
              onClick={onItemClick}
            >
              Browse Collections →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
