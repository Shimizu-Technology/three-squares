import { useState, useEffect, useId, type MouseEvent as ReactMouseEvent } from 'react';
import { NavigationLink, NavigationDisclosure } from './ui/NavigationLink';
import { collectionsApi, type Collection } from '../services/api';
import { useCartStore } from '../store/cartStore';
import useAppConfig from '../hooks/useAppConfig';
import { isStorefrontEnabled } from '../utils/storefronts';

interface MobileNavDropdownProps {
  onItemClick: () => void;
  darkMode?: boolean;
}

export default function MobileNavDropdown({ onItemClick, darkMode = false }: MobileNavDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const menuId = useId();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const cart = useCartStore((state) => state.cart);
  const config = useAppConfig();

  const showThreeSquares = isStorefrontEnabled(config, 'three_squares');
  const showLatteStone = isStorefrontEnabled(config, 'latte_stone');
  const showCatering = isStorefrontEnabled(config, 'catering');
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
      <NavigationDisclosure expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} controlsId={menuId} surface={darkMode ? 'dark' : 'default'}>Shop</NavigationDisclosure>

      {/* Expandable Sub-menu */}
      <div id={menuId} hidden={!isExpanded}>
      {isExpanded && (
        <div className="animate-slide-down">
          {/* Collections List */}
          <div className={`pl-3 space-y-1 ml-1 ${darkMode ? 'border-l-2 border-white/20' : 'border-l-2 border-tsPrimary/30'}`}>
            {/* All Products */}
            <NavigationLink
              to="/products"
              surface={darkMode ? 'dark' : 'default'} className="w-full"
              onClick={onItemClick}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              All Products
            </NavigationLink>

            {storefrontCount > 1 && (
              <>
                <p className={`text-xs uppercase tracking-wider font-semibold py-2 ${darkMode ? 'text-white/40' : 'text-warm-400'}`}>
                  Browse by menu
                </p>
                {showThreeSquares && (
                  <NavigationLink
                    to="/shop/three-squares"
                    surface={darkMode ? 'dark' : 'default'} className="w-full"
                    onClick={(event) => handleStorefrontClick(event, 'three_squares', 'Three Squares')}
                  >
                    Three Squares
                  </NavigationLink>
                )}
                {showLatteStone && (
                  <NavigationLink
                    to="/shop/latte-stone-cookies"
                    surface={darkMode ? 'dark' : 'default'} className="w-full"
                    onClick={(event) => handleStorefrontClick(event, 'latte_stone', 'Latte Stone Cookies')}
                  >
                    Latte Stone Cookies
                  </NavigationLink>
                )}
                {showCatering && (
                  <NavigationLink
                    to="/shop/catering"
                    surface={darkMode ? 'dark' : 'default'} className="w-full"
                    onClick={(event) => handleStorefrontClick(event, 'catering', 'Catering')}
                  >
                    Catering
                  </NavigationLink>
                )}
              </>
            )}

            {/* Collections */}
            {loading ? (
              <div className={`text-sm py-2 ${darkMode ? 'text-white/50' : 'text-warm-400'}`}>Loading collections...</div>
            ) : (
              collections.slice(0, 6).map((collection) => (
                <NavigationLink
                  key={collection.id}
                  to={`/collections/${collection.slug}`}
                  surface={darkMode ? 'dark' : 'default'} className="w-full"
                  onClick={onItemClick}
                >
                  <span className="text-tsGold text-xs">●</span>
                  {collection.name}
                  {collection.product_count > 0 && (
                    <span className={`ml-auto text-xs ${darkMode ? 'text-white/40' : 'text-warm-400'}`}>
                      {collection.product_count}
                    </span>
                  )}
                </NavigationLink>
              ))
            )}

            {/* View All Collections */}
            {collections.length > 0 && (
              <NavigationLink
                to="/collections"
                surface={darkMode ? 'dark' : 'default'} className="w-full"
                onClick={onItemClick}
              >
                View All Collections →
              </NavigationLink>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
