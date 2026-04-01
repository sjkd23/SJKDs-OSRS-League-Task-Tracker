import { Fragment } from 'react';
import type { RichPart } from '@/types/richPart';

const WIKI_BASE = 'https://oldschool.runescape.wiki';

/**
 * Resolve a potentially wiki-relative href to an absolute URL.
 * Links like "/w/Woodcutting" become "https://oldschool.runescape.wiki/w/Woodcutting".
 * Already-absolute URLs are returned unchanged.
 */
function resolveHref(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return `${WIKI_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

interface RichTextProps {
  /** Parts array from the enriched scraper output. */
  parts: RichPart[];
  className?: string;
}

/**
 * Renders a `RichPart[]` array inline, turning `link` parts into real
 * wiki hyperlinks that open in a new tab.
 *
 * Usage:
 * ```tsx
 * <RichText parts={task.descriptionParts} />
 * ```
 *
 * Link clicks call `e.stopPropagation()` so they do not trigger any parent
 * row-click handlers (e.g. completion toggle).
 *
 * Falls back gracefully: if `parts` is empty the element renders nothing
 * (callers should render plain-text fallback instead).
 */
export function RichText({ parts, className }: RichTextProps) {
  return (
    <span className={[className, 'rich-text-container'].join(' ')}>
      {parts.map((part, i) => {
        const isLink = part.type === 'link';
        
        if (isLink) {
          return (
            <a
              key={i}
              href={resolveHref(part.href)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-wiki-link dark:text-wiki-link-dark hover:text-wiki-link-hover dark:hover:text-wiki-link-hover-dark no-underline hover:underline"
            >
              {part.text}
            </a>
          );
        }

        return <Fragment key={i}>{part.text}</Fragment>;
      })}
    </span>
  );
}
