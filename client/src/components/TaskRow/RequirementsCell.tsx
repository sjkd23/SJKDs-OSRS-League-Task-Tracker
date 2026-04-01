import { Fragment } from 'react';
import type { RichPart } from '@/types/richPart';
import { WikiIcon } from '@/components/WikiIcon/WikiIcon';
import { parseRequirements, regionIconClass, regionWikiUrl } from '@/lib/wikiIcons';

const WIKI_BASE = 'https://oldschool.runescape.wiki';

function resolveHref(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return `${WIKI_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

/** Returns true when the requirements text is effectively empty / not applicable. */
function isNa(text: string | undefined): boolean {
  const t = text?.trim();
  return !t || t === 'N/A' || t === '—' || t === '-';
}

interface RequirementsCellProps {
  requirementsText: string;
  requirementsParts?: RichPart[];
}

/**
 * Renders the requirements cell using the icon-based presentation.
 *
 * - Prioritizes `requirementsParts` if available to ensure exact link rendering.
 * - For each part, if it's a "text" part, we further parse it for skill/region icons
 *   to preserve the wiki-like visual style.
 * - This prevents "over-linking" by only wrapping the exact segments marked as
 *   "link" in the original enriched data.
 *
 * Link clicks `stopPropagation()` so row-completion does not fire.
 */
export function RequirementsCell({ requirementsText, requirementsParts }: RequirementsCellProps) {
  if (isNa(requirementsText)) {
    return (
      <span className="block w-full text-center text-[0.75rem] opacity-65 text-wiki-muted dark:text-wiki-muted-dark select-none py-1">
        N/A
      </span>
    );
  }

  // If we have structured parts from the scraper, use them as the primary source of truth for links.
  // We then parse the text within those parts to find skill/region icons.
  const partsToRender = requirementsParts && requirementsParts.length > 0
    ? requirementsParts
    : [{ type: 'text' as const, text: requirementsText }];

  return (
    <span className="rich-text-container items-center">
      {partsToRender.map((part, i) => {
        const isLink = part.type === 'link';
        const href = isLink ? resolveHref(part.href) : undefined;

        // Parse the text of this part for icons.
        // Even if it's a link, we want to see if there are icons inside it (rare but possible).
        const parsed = parseRequirements(part.text);

        const content = parsed.map((subPart, j) => {
          if (subPart.kind === 'skill') {
            return (
              <span key={j} className="inline-flex items-center align-middle translate-y-[-1px]">
                <WikiIcon
                  src={subPart.iconUrl}
                  alt={subPart.skill}
                  className="w-[20px] h-[20px] self-center"
                />
                {subPart.level > 0 && <span className="ml-1 font-medium">{subPart.level}</span>}
              </span>
            );
          }

          if (subPart.kind === 'region') {
            const regionHref = !isLink ? regionWikiUrl(subPart.area) : undefined;
            const icon = (
              <WikiIcon
                key={j}
                src={subPart.iconUrl}
                alt={subPart.area}
                className={[regionIconClass(subPart.area, 'table'), 'inline-block align-middle'].join(' ')}
                fallbackColor={subPart.fallbackColor}
              />
            );

            // If the parent is NOT a link, and this is a region, we want it clickable.
            if (regionHref && !isLink) {
              return (
                <a
                  key={j}
                  href={regionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block no-underline hover:opacity-80 align-middle"
                  title={subPart.area}
                >
                  {icon}
                </a>
              );
            }
            return icon;
          }

          return (
            <Fragment key={j}>
              {subPart.text}
            </Fragment>
          );
        });

        if (isLink && href) {
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-wiki-link dark:text-wiki-link-dark hover:text-wiki-link-hover dark:hover:text-wiki-link-hover-dark no-underline hover:underline"
            >
              {content}
            </a>
          );
        }

        return <span key={i}>{content}</span>;
      })}
    </span>
  );
}
