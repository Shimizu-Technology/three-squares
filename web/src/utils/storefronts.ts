import type { AppConfig } from '../types/order';

export type StorefrontKey = 'three_squares' | 'latte_stone' | 'catering';
const COOKIE_COLLECTION_SLUGS = new Set(['cookies', 'cookie-boxes', 'mini-cookies']);

export interface StorefrontDefinition {
  key: StorefrontKey;
  label: string;
  description: string;
  entryPath: string;
  navigationPath: string;
  menuPath?: string;
  publicPath?: string;
}

const getFallbackEnabledMap = (enabled: boolean) => ({
  three_squares: enabled,
  latte_stone: enabled,
  catering: enabled,
});

export const STOREFRONTS: StorefrontDefinition[] = [
  {
    key: 'three_squares',
    label: 'Three Squares',
    description: 'Daily menu, island favorites, and pickup classics.',
    entryPath: '/shop/three-squares',
    navigationPath: '/products?business_line=three_squares',
  },
  {
    key: 'latte_stone',
    label: 'Latte Stone Cookies',
    description: 'Cookie boxes, gifting picks, and shipped treats.',
    entryPath: '/shop/latte-stone-cookies',
    navigationPath: '/products?business_line=latte_stone',
  },
  {
    key: 'catering',
    label: 'Catering',
    description: 'Event packages, platters, and custom catering inquiries.',
    entryPath: '/shop/catering',
    navigationPath: '/catering',
    menuPath: '/products?business_line=catering',
    publicPath: '/catering',
  },
];

export const getStorefrontEnabledMap = (config: AppConfig | null | undefined) => ({
  ...(config === undefined
    ? getFallbackEnabledMap(false)
    : config === null
      ? getFallbackEnabledMap(false)
      : {
          three_squares: config.enable_storefront_three_squares !== false,
          latte_stone: config.enable_storefront_latte_stone === true,
          catering: config.enable_storefront_catering !== false,
        }),
});

export const isStorefrontEnabled = (
  config: AppConfig | null | undefined,
  storefront: StorefrontKey
) => getStorefrontEnabledMap(config)[storefront];

export const getEnabledStorefronts = (config: AppConfig | null | undefined) => {
  const enabledMap = getStorefrontEnabledMap(config);
  return STOREFRONTS.filter((storefront) => enabledMap[storefront.key]);
};

export const getStorefrontDefinition = (storefront: StorefrontKey) => {
  const definition = STOREFRONTS.find((entry) => entry.key === storefront);

  if (!definition) {
    throw new Error(`Unknown storefront: ${storefront}`);
  }

  return definition;
};

export const getStorefrontPath = (storefront: StorefrontKey) =>
  getStorefrontDefinition(storefront).navigationPath;

export const getStorefrontMenuPath = (storefront: StorefrontKey) => {
  const definition = getStorefrontDefinition(storefront);
  return definition.menuPath ?? definition.navigationPath;
};

export const inferStorefrontFromCollectionSlug = (
  slug: string | null | undefined
): StorefrontKey | null => {
  if (!slug) return null;
  if (COOKIE_COLLECTION_SLUGS.has(slug)) return 'latte_stone';
  if (slug.startsWith('catering-')) return 'catering';
  return 'three_squares';
};

export const inferStorefrontFromLink = (
  path: string | null | undefined
): StorefrontKey | null => {
  if (!path) return null;

  const [pathname, query = ''] = path.split('?');
  const matchedStorefront = STOREFRONTS.find(
    (storefront) =>
      storefront.entryPath === pathname || storefront.publicPath === pathname
  );

  if (matchedStorefront) {
    return matchedStorefront.key;
  }

  if (pathname === '/products' || pathname === '/collections') {
    const params = new URLSearchParams(query);
    const businessLine = params.get('business_line');
    if (
      businessLine === 'three_squares' ||
      businessLine === 'latte_stone' ||
      businessLine === 'catering'
    ) {
      return businessLine;
    }

    return inferStorefrontFromCollectionSlug(params.get('collection'));
  }

  if (pathname.startsWith('/collections/')) {
    return inferStorefrontFromCollectionSlug(pathname.replace('/collections/', ''));
  }

  return null;
};

export const isStorefrontManagedPathEnabled = (
  config: AppConfig | null | undefined,
  path: string | null | undefined
) => {
  if (!path) return true;

  const inferredStorefront = inferStorefrontFromLink(path);
  if (!inferredStorefront) {
    return true;
  }

  if (config === undefined) {
    return false;
  }

  return isStorefrontEnabled(config, inferredStorefront);
};
