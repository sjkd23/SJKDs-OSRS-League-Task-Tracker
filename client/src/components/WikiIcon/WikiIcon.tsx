import { useState } from 'react';

interface WikiIconProps {
  /** Local asset path or URL to the icon image. */
  src: string;
  /** Alt text for the icon (usually the skill/region/difficulty name). */
  alt: string;
  /** Extra CSS classes applied to the <img> element. */
  className?: string;
  /**
   * Optional accent colour for the text-badge fallback shown when the image
   * fails to load. If omitted when the image fails, nothing is rendered (the
   * caller's surrounding text already provides context).
   */
  fallbackColor?: string;
}

/**
 * Renders an inline wiki-style icon image from a local asset path.
 *
 * If the image fails to load, renders a compact coloured text-badge using the
 * first two characters of `alt` when `fallbackColor` is provided, or nothing
 * if it isn't.
 */
export function WikiIcon({ src, alt, className = '', fallbackColor }: WikiIconProps) {
  // An empty src will never load — skip straight to the fallback state
  const [failed, setFailed] = useState(!src);

  if (failed) {
    if (!fallbackColor) return null;
    // Compact coloured badge: 2-char abbreviation in a small rounded square
    return (
      <span
        title={alt}
        aria-label={alt}
        className="inline-flex items-center justify-center flex-shrink-0 rounded-sm text-white font-semibold leading-none select-none"
        style={{
          backgroundColor: fallbackColor,
          fontSize: '9px',
          width: '20px',
          height: '20px',
        }}
      >
        {alt.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      className={`inline-block align-middle object-contain ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
    />
  );
}
