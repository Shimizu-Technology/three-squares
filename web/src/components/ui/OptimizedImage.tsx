import { memo, useEffect, useMemo, useState } from 'react';
import type { ImgixImageOptions, ImageContext } from '../../utils/imageUtils';
import { getImgixImageUrl, getSizesForContext, getWidthsForContext } from '../../utils/imageUtils';

interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | undefined | null;
  imgixOptions?: ImgixImageOptions;
  context?: ImageContext;
  widths?: number[];
  sizes?: string;
  fallbackSrc?: string;
  priority?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
}

const OptimizedImage = memo(({
  src,
  imgixOptions,
  context,
  widths,
  sizes,
  fallbackSrc,
  priority = false,
  fetchPriority,
  alt = '',
  onError,
  onLoad,
  className,
  ...imgProps
}: OptimizedImageProps) => {
  const resolvedSrc = src || fallbackSrc;
  if (!resolvedSrc) return null;

  const resolvedWidths = widths || getWidthsForContext(context);
  const resolvedSizes = sizes || getSizesForContext(context);

  const baseOptions = useMemo<ImgixImageOptions>(
    () => ({
      auto: 'format,compress',
      ...imgixOptions,
    }),
    [imgixOptions]
  );

  const transformedSrcSet = useMemo(
    () => resolvedWidths
      .map((width) => {
        const url = getImgixImageUrl(resolvedSrc, { ...baseOptions, width });
        return url ? `${url} ${width}w` : null;
      })
      .filter(Boolean)
      .join(', '),
    [resolvedWidths, resolvedSrc, baseOptions]
  );

  // Use a medium source as initial src to avoid visible low-res pop-in.
  const defaultWidth = resolvedWidths[Math.min(1, resolvedWidths.length - 1)];
  const transformedDefaultSrc = getImgixImageUrl(resolvedSrc, { ...baseOptions, width: defaultWidth }) || resolvedSrc;
  const [useOriginalSource, setUseOriginalSource] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setUseOriginalSource(false);
    setIsLoaded(false);
  }, [resolvedSrc, transformedDefaultSrc]);

  const activeSrc = useOriginalSource ? resolvedSrc : transformedDefaultSrc;
  const activeSrcSet = useOriginalSource ? undefined : (transformedSrcSet || undefined);
  const activeSizes = activeSrcSet ? resolvedSizes : undefined;

  const loading = priority ? 'eager' : 'lazy';

  return (
    <img
      src={activeSrc}
      srcSet={activeSrcSet}
      sizes={activeSizes}
      alt={alt}
      loading={loading}
      decoding="async"
      className={`${className || ''} transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
      onLoad={(event) => {
        setIsLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        // If the transformed/CDN URL fails, retry once with the original source URL.
        if (!useOriginalSource && transformedDefaultSrc !== resolvedSrc) {
          setUseOriginalSource(true);
          return;
        }

        if (fallbackSrc && (event.currentTarget.src || '') !== fallbackSrc) {
          event.currentTarget.src = fallbackSrc;
        }
        onError?.(event);
      }}
      {...imgProps}
    />
  );
});

export default OptimizedImage;
