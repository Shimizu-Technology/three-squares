import { useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { collectionsApi, type Collection } from '../services/api';
import { useCartStore } from '../store/cartStore';
import useAppConfig from '../hooks/useAppConfig';

interface MobileNavDropdownProps {
  onItemClick: () => void;
  darkMode?: boolean;
}

export default function MobileNavDropdown({ onItemClick, darkMode = false }: MobileNavDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const cart = useCartStore((state) => state.cart);
  const config = useAppConfig();

  const showThreeSquares = config ? config.enable_storefront_three_squares !== false : false;
  const showLatteStone = config ? config.enable_storefront_latte_stone !== false : false;
  const showCatering = config ? config.enable_storefront_catering !== false : false;
  const storefrontCount = [showThreeSquares, showLatteStone, showCatering].filter(Boolean).length;

  // Fetch collections on mount
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const response = await collectionsApi.getCollections({ per_page: 10 });
        setCollections(response.collections);
      } catch (error) {
        console.error('Failed to fetch collections:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, []);

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
          {/* Collections List */}
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

            {storefrontCount > 1 && (
              <>
                <p className={`text-xs uppercase tracking-wider font-semibold py-2 ${darkMode ? 'text-white/40' : 'text-warm-400'}`}>
                  Shop by Business
                </p>
                {showThreeSquares && (
                  <Link
                    to="/shop/three-squares"
                    className={`flex items-center gap-2 py-2 ${
                      darkMode
                        ? 'text-white/80 hover:text-tsGold'
                        : 'text-warm-700 hover:text-tsPrimary'
                    }`}
                    onClick={(event) => handleStorefrontClick(event, 'three_squares', 'Three Squares')}
                  >
                    Three Squares
                  </Link>
                )}
                {showLatteStone && (
                  <Link
                    to="/shop/latte-stone-cookies"
                    className={`flex items-center gap-2 py-2 ${
                      darkMode
                        ? 'text-white/80 hover:text-tsGold'
                        : 'text-warm-700 hover:text-tsPrimary'
                    }`}
                    onClick={(event) => handleStorefrontClick(event, 'latte_stone', 'Latte Stone Cookies')}
                  >
                    Latte Stone Cookies
                  </Link>
                )}
                {showCatering && (
                  <Link
                    to="/shop/catering"
                    className={`flex items-center gap-2 py-2 ${
                      darkMode
                        ? 'text-white/80 hover:text-tsGold'
                        : 'text-warm-700 hover:text-tsPrimary'
                    }`}
                    onClick={(event) => handleStorefrontClick(event, 'catering', 'Catering')}
                  >
                    Catering
                  </Link>
                )}
              </>
            )}

            {/* Collections */}
            {loading ? (
              <div className={`text-sm py-2 ${darkMode ? 'text-white/50' : 'text-warm-400'}`}>Loading collections...</div>
            ) : (
              collections.slice(0, 6).map((collection) => (
                <Link
                  key={collection.id}
                  to={`/collections/${collection.slug}`}
                  className={`flex items-center gap-2 py-2 ${
                    darkMode 
                      ? 'text-white/70 hover:text-tsGold' 
                      : 'text-warm-600 hover:text-tsPrimary'
                  }`}
                  onClick={onItemClick}
                >
                  <span className="text-tsGold text-xs">●</span>
                  {collection.name}
                  {collection.product_count > 0 && (
                    <span className={`ml-auto text-xs ${darkMode ? 'text-white/40' : 'text-warm-400'}`}>
                      {collection.product_count}
                    </span>
                  )}
                </Link>
              ))
            )}

            {/* View All Collections */}
            {collections.length > 0 && (
              <Link
                to="/collections"
                className={`block py-2 font-medium hover:underline ${
                  darkMode ? 'text-tsGold' : 'text-tsPrimary'
                }`}
                onClick={onItemClick}
              >
                View All Collections →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
