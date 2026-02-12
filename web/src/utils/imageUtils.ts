export interface ImgixImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'avif' | 'webp' | 'jpg' | 'png' | 'auto';
  fit?: 'crop' | 'clip' | 'clamp' | 'fill' | 'fillmax' | 'max' | 'min' | 'scale' | 'cover';
  auto?: string;
  dpr?: number;
}

const IMGIX_DOMAIN = import.meta.env.VITE_IMGIX_DOMAIN as string | undefined;

export type ImageContext =
  | 'card'
  | 'featured'
  | 'detail'
  | 'thumb'
  | 'cart'
  | 'hero';

export const getImgixImageUrl = (
  sourceUrl: string | undefined | null,
  options: ImgixImageOptions = {}
): string | undefined => {
  if (!sourceUrl || !IMGIX_DOMAIN || sourceUrl.startsWith('/')) {
    return sourceUrl || undefined;
  }

  try {
    const originalUrl = new URL(sourceUrl);
    const imagePath = originalUrl.pathname.replace(/^\//, '');
    if (!imagePath) return sourceUrl;

    const params = new URLSearchParams();
    if (options.width) params.set('w', String(options.width));
    if (options.height) params.set('h', String(options.height));
    if (options.quality) params.set('q', String(options.quality));
    if (options.fit) params.set('fit', options.fit);
    if (options.dpr) params.set('dpr', String(options.dpr));

    if (options.auto) {
      params.set('auto', options.auto);
    } else if (options.format) {
      params.set('fm', options.format);
    } else {
      params.set('auto', 'format,compress');
    }

    if (!params.has('q')) {
      params.set('q', '75');
    }

    const query = params.toString();
    return `https://${IMGIX_DOMAIN}/${imagePath}${query ? `?${query}` : ''}`;
  } catch (error) {
    console.error('Error creating Imgix URL:', { sourceUrl, options, error });
    return sourceUrl;
  }
};

export const getWidthsForContext = (context?: ImageContext): number[] => {
  switch (context) {
    case 'card':
      return [240, 480, 720];
    case 'featured':
      return [240, 480, 720];
    case 'detail':
      return [400, 800, 1200];
    case 'thumb':
      return [80, 160, 240];
    case 'cart':
      return [80, 160];
    case 'hero':
      return [640, 1280, 1920];
    default:
      return [320, 640, 960];
  }
};

export const getSizesForContext = (context?: ImageContext): string => {
  switch (context) {
    case 'card':
      return '(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 240px';
    case 'featured':
      return '(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 220px';
    case 'detail':
      return '(max-width: 1024px) 100vw, 50vw';
    case 'thumb':
      return '80px';
    case 'cart':
      return '80px';
    case 'hero':
      return '100vw';
    default:
      return '(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 240px';
  }
};
