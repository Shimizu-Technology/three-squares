import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { NavigationLink } from './ui/NavigationLink';
import { collectionsApi, type Collection } from '../services/api';
import { useCartStore } from '../store/cartStore';
import useAppConfig from '../hooks/useAppConfig';
import { isStorefrontEnabled } from '../utils/storefronts';

interface NavDropdownProps {
  onItemClick: () => void;
  darkMode?: boolean;
}

export default function NavDropdown({ onItemClick, darkMode = false }: NavDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // Show collections with at least 1 product, sorted by product count
        const filtered = response.collections
          .filter((c: Collection) => c.product_count > 0)
          .sort((a: Collection, b: Collection) => b.product_count - a.product_count)
          .slice(0, 5); // Top 5 collections
        setCollections(filtered);
      } catch (err) {
        console.error('Failed to fetch collections for nav:', err);
      }
    };
    fetchCollections();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200);
  };

  const handleItemClick = () => {
    setIsOpen(false);
    onItemClick();
  };

  const handleStorefrontClick = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    targetBusinessLine: 'three_squares' | 'latte_stone' | 'catering',
    targetLabel: string
  ) => {
    const cartItems = cart?.items || [];
    if (cartItems.length === 0) {
      handleItemClick();
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
      handleItemClick();
      return;
    }

    const confirmSwitch = window.confirm(
      `Your cart already has items from a different storefront context. Switching to ${targetLabel} may hide some items while browsing. Continue?`
    );

    if (!confirmSwitch) {
      event.preventDefault();
      return;
    }

    handleItemClick();
  };

  return (
    <div 
      ref={dropdownRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger - Click navigates to /products, hover shows dropdown */}
      <NavigationLink
        to="/products"
        surface={darkMode ? 'dark' : 'default'} className="w-full"
        onClick={handleItemClick}
      >
        Shop
        <svg
          className={`ml-1 w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </NavigationLink>

      {/* Dynamic dropdown with real collections */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-warm-200 z-50 animate-slide-down overflow-hidden w-56">
          <div className="py-2 px-4">
            {/* Dynamic collections */}
            {collections.map((col) => (
              <NavigationLink
                key={col.id}
                to={`/collections/${col.slug}`}
                surface={darkMode ? 'dark' : 'default'} className="w-full"
                onClick={handleItemClick}
              >
                <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                </svg>
                {col.name}
                <span className="ml-auto text-xs text-warm-400">{col.product_count}</span>
              </NavigationLink>
            ))}

            {collections.length > 0 && <div className="border-t border-warm-100 my-1" />}

            {storefrontCount > 1 && (
              <>
                <p className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-warm-400">
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

            <div className="border-t border-warm-100 my-1" />

            <NavigationLink
              to="/products"
              surface={darkMode ? 'dark' : 'default'} className="w-full"
              onClick={handleItemClick}
            >
              <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              All Products
            </NavigationLink>
            <NavigationLink
              to="/collections"
              surface={darkMode ? 'dark' : 'default'} className="w-full"
              onClick={handleItemClick}
            >
              <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Browse Collections
            </NavigationLink>

            <div className="border-t border-warm-100 my-1" />

            <NavigationLink
              to="/products?sale=true"
              surface={darkMode ? 'dark' : 'default'} className="w-full"
              onClick={handleItemClick}
            >
              <svg className="w-5 h-5 text-tsPrimary" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
              Sale Items
            </NavigationLink>
          </div>
        </div>
      )}
    </div>
  );
}
