import photos from '@/data/photos.json';
import { cn } from '@/lib/utils';

export type PhotoName = keyof typeof photos;
const BASE = import.meta.env.BASE_URL;

/** A graded Unsplash photo (ASSETS.md) as AVIF/WebP with a responsive srcset. Decorative unless `alt` is given. */
export function Photo({
  name,
  alt = '',
  sizes = '100vw',
  className,
  priority,
  style,
}: {
  name: PhotoName;
  alt?: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  style?: React.CSSProperties;
}) {
  const p = photos[name];
  const set = (ext: string) => p.widths.map((w) => `${BASE}photos/${name}-${w}.${ext} ${w}w`).join(', ');
  const mid = p.widths[Math.min(1, p.widths.length - 1)];
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={`${BASE}photos/${name}-${mid}.webp`}
        alt={alt}
        width={1280}
        height={Math.round(1280 / p.ratio)}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchpriority: 'high' } : {})}
        className={cn('block object-cover', className)}
        style={style}
      />
    </picture>
  );
}
