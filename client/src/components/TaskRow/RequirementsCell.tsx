import type { RichPart } from '@/types/richPart';
import { WikiIcon } from '@/components/WikiIcon/WikiIcon';
import { parseRequirements, regionIconClass, regionWikiUrl } from '@/lib/wikiIcons';

const WIKI_BASE = 'https://oldschool.runescape.wiki';

function resolveHref(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return `${WIKI_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

/**
 * Build a lookup map from normalised link-text to resolved absolute href.
 * Used to match enriched scraper links against parsed requirement tokens.
 */
function buildLinkMap(parts: RichPart[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of parts) {
    if (p.type === 'link') {
      map.set(p.text.toLowerCase().trim(), resolveHref(p.href));
    }
  }
  return map;
}

/**
 * Look up a href for `query` in the link map.
 * Tries exact match first, then substring containment in either direction
 * (covers e.g. map key "50 firemaking" matching query "firemaking").
 */
function findHref(query: string, linkMap: Map<string, string>): string | undefined {
  const q = query.toLowerCase().trim();
  if (linkMap.has(q)) return linkMap.get(q);
  for (const [text, href] of linkMap) {
    if (text.includes(q) || q.includes(text)) return href;
  }
  return undefined;
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
 * - Always parses `requirementsText` with `parseRequirements()` so skill and
 *   region icons are always shown (preserving the wiki-like visual style).
 * - If `requirementsParts` is present it extracts any link hrefs and wraps
 *   the matching icon+text in an `<a>` tag — making requirements clickable
 *   without replacing icons with plain linked text.
 * - N/A values are rendered small and subdued.
 *
 * Link clicks `stopPropagation()` so row-completion does not fire.
 */
export function RequirementsCell({ requirementsText, requirementsParts }: RequirementsCellProps) {
  if (isNa(requirementsText)) {
    return (
      <span className="block w-full text-center text-[0.75rem] opacity-65 text-wiki-muted dark:text-wiki-muted-dark select-none">
        N/A
      </span>
    );
  }

  const parsed = parseRequirements(requirementsText);
  const linkMap = requirementsParts ? buildLinkMap(requirementsParts) : new Map<string, string>();

  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1 items-center">
      {parsed.map((part, i) => {
        if (part.kind === 'skill') {
          const href = findHref(part.skill, linkMap);
          const inner = (
            <>
              <WikiIcon
                src={part.iconUrl}
                alt={part.skill}
                className="w-[22px] h-[22px] flex-shrink-0"
              />
              <span className="font-medium">{part.level}</span>
            </>
          );
          return href ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 whitespace-nowrap
                         text-wiki-link dark:text-wiki-link-dark
                         hover:text-wiki-link-hover dark:hover:text-wiki-link-hover-dark
                         no-underline hover:underline"
              title={`${part.skill} ${part.level}`}
            >
              {inner}
            </a>
          ) : (
            <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
              {inner}
            </span>
          );
        }

        if (part.kind === 'region') {
          const href = findHref(part.area, linkMap) ?? regionWikiUrl(part.area);
          const icon = (
            <WikiIcon
              src={part.iconUrl}
              alt={part.area}
              className={regionIconClass(part.area, 'table')}
              fallbackColor={part.fallbackColor}
            />
          );
          return href ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center whitespace-nowrap no-underline hover:opacity-80"
              title={part.area}
            >
              {icon}
            </a>
          ) : (
            <span key={i} className="inline-flex items-center whitespace-nowrap" title={part.area}>
              {icon}
            </span>
          );
        }

        // text part
        return (
          <span key={i} className="break-words">
            {part.text}
          </span>
        );
      })}
    </span>
  );
}
