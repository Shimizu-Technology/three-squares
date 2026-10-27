import { memo, useMemo, useState } from 'react';
import type { ImgixImageOptions, ImageContext } from '../../utils/imageUtils';
import { getImgixImageUrl, getSizesForContext, getWidthsForContext } from '../../utils/imageUtils';
import PlaceholderImage from './PlaceholderImage';

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

function ImageContent({
  src, imgixOptions, context, widths, sizes, fallbackSrc, priority = false,
  fetchPriority, alt = '', onError, onLoad, className, ...imgProps
}: OptimizedImageProps) {
  const resolvedSrc = src || fallbackSrc;
  const resolvedWidths = widths || getWidthsForContext(context);
  const baseOptions = useMemo<ImgixImageOptions>(() => ({ auto: 'format,compress', ...imgixOptions }), [imgixOptions]);
  const transformedSrcSet = resolvedWidths.map((width) => {
    const url = getImgixImageUrl(resolvedSrc, { ...baseOptions, width });
    return url ? `${url} ${width}w` : null;
  }).filter(Boolean).join(', ');
  const defaultWidth = resolvedWidths[Math.min(1, resolvedWidths.length - 1)];
  const transformedSrc = getImgixImageUrl(resolvedSrc, { ...baseOptions, width: defaultWidth });
  const candidates = [...new Set([transformedSrc, resolvedSrc, fallbackSrc].filter((value): value is string => Boolean(value)))];
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const activeSrc = candidates[sourceIndex];
  const isLoaded = Boolean(activeSrc && loadedSrc === activeSrc);
  const variant = context === 'thumb' || context === 'cart' ? 'thumbnail' : context === 'detail' || context === 'hero' || context === 'featured' ? 'detail' : 'card';

  if (!activeSrc || failed) {
    return <span className="block w-full h-full" role={alt ? 'img' : undefined}
      aria-label={alt ? `${alt}: photo unavailable` : undefined} aria-hidden={alt ? undefined : true} data-photo-state="unavailable">
      <PlaceholderImage variant={variant} />
    </span>;
  }

  // Callers reserve the image's aspect ratio/size. Loading, retries and final
  // failure share that slot, so nearby names, prices and actions never move.
  return <span className="relative block w-full h-full" aria-busy={!isLoaded} data-photo-state={isLoaded ? 'loaded' : 'loading'}>
    {!isLoaded && <span className="absolute inset-0" aria-hidden="true">
      <PlaceholderImage variant={variant} text="Loading photo…" />
    </span>}
    <img
      {...imgProps}
      src={activeSrc}
      srcSet={sourceIndex === 0 ? transformedSrcSet || undefined : undefined}
      sizes={sourceIndex === 0 && transformedSrcSet ? sizes || getSizesForContext(context) : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={fetchPriority}
      className={`${className || ''} ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      onLoad={(event) => {
        setLoadedSrc(activeSrc);
        onLoad?.(event);
      }}
      onError={(event) => {
        if (sourceIndex + 1 < candidates.length) {
          setSourceIndex(sourceIndex + 1);
        } else {
          setFailed(true);
          onError?.(event);
        }
      }}
    />
  </span>;
}

// A new source starts a new retry/load lifecycle, including after a prior failure.
const OptimizedImage = memo((props: OptimizedImageProps) =>
  <ImageContent key={JSON.stringify([props.src, props.fallbackSrc, props.imgixOptions, props.context, props.widths, props.sizes])} {...props} />);

export default OptimizedImage;
