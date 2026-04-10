/**
 * Local icon asset mappings.
 *
 * All icons are served from /public/icons/* (Vite serves public/ at the root).
 * No remote wiki or CDN fetching — add files to public/icons/{skills,areas,difficulties}
 * and update the maps below.
 *
 * Keys must exactly match the values produced by the LEAGUE_5 scraper.
 */

// ─── Skill icons ─────────────────────────────────────────────────────────────

/**
 * Maps a skill name (as used in AppTask.skill / AppTask.skills) to a local
 * asset path under /icons/skills/.
 */
export const SKILL_ICON: Record<string, string> = {
  Attack:       '/icons/skills/Attack_icon.png',
  Defence:      '/icons/skills/Defence_icon.png',
  Strength:     '/icons/skills/Strength_icon.png',
  Hitpoints:    '/icons/skills/Hitpoints_icon.png',
  Ranged:       '/icons/skills/Ranged_icon.png',
  Prayer:       '/icons/skills/Prayer_icon.png',
  Magic:        '/icons/skills/Magic_icon.png',
  Cooking:      '/icons/skills/Cooking_icon.png',
  Woodcutting:  '/icons/skills/Woodcutting_icon.png',
  Fletching:    '/icons/skills/Fletching_icon.png',
  Fishing:      '/icons/skills/Fishing_icon.png',
  Firemaking:   '/icons/skills/Firemaking_icon.png',
  Crafting:     '/icons/skills/Crafting_icon.png',
  Smithing:     '/icons/skills/Smithing_icon.png',
  Mining:       '/icons/skills/Mining_icon.png',
  Herblore:     '/icons/skills/Herblore_icon.png',
  Agility:      '/icons/skills/Agility_icon.png',
  Thieving:     '/icons/skills/Thieving_icon.png',
  Slayer:       '/icons/skills/Slayer_icon.png',
  Farming:      '/icons/skills/Farming_icon.png',
  Runecraft:    '/icons/skills/Runecraft_icon.png',
  Hunter:       '/icons/skills/Hunter_icon.png',
  Construction: '/icons/skills/Construction_icon.png',
};

// ─── Region icons ────────────────────────────────────────────────────────────

/**
 * Per-region accent colours used as a text-badge fallback when no icon file
 * is present. These are intentionally muted to fit the wiki palette.
 */
export const REGION_COLOUR: Record<string, string> = {
  Asgarnia:             '#5b7fc4', // steel blue
  'Fremennik Province': '#6a9e6a', // frost green
  Kandarin:             '#7e5fb5', // purple
  Karamja:              '#4fa35e', // jungle green
  'Kharidian Desert':   '#c49a3c', // sand gold
  'Kourend & Kebos':    '#9e4040', // dark red
  Misthalin:            '#4a82a6', // cerulean
  Morytania:            '#7a5c8a', // dusty purple
  Tirannwn:             '#4e9e7a', // elven teal
  Varlamore:            '#c47a3c', // orange-bronze
  Wilderness:           '#6b6b6b', // grey
  Global:               '#5a7a9a', // muted blue-grey
};

/**
 * Maps a region/area name to a local asset path under /icons/areas/.
 * "Kharidian Desert" maps to Desert_Area_Badge.png (wiki naming convention).
 * "Global" uses Globe-icon.png.
 */
export const REGION_ICON: Record<string, string> = {
  Asgarnia:             '/icons/areas/Asgarnia_Area_Badge.png',
  'Fremennik Province': '/icons/areas/Fremennik_Area_Badge.png',
  Kandarin:             '/icons/areas/Kandarin_Area_Badge.png',
  Karamja:              '/icons/areas/Karamja_Area_Badge.png',
  'Kharidian Desert':   '/icons/areas/Desert_Area_Badge.png',
  'Kourend & Kebos':    '/icons/areas/Kourend_Area_Badge.png',
  Misthalin:            '/icons/areas/Misthalin_Area_Badge.png',
  Morytania:            '/icons/areas/Morytania_Area_Badge.png',
  Tirannwn:             '/icons/areas/Tirannwn_Area_Badge.png',
  Varlamore:            '/icons/areas/Varlamore_Area_Badge.png',
  Wilderness:           '/icons/areas/Wilderness_Area_Badge.png',
  Global:               '/icons/areas/Globe-icon.png',
};

// ─── League configuration ────────────────────────────────────────────────────

/**
 * Current league identity. Update `slug` when swapping to a new league.
 * All region wiki links are built from this — do not hard-code the slug
 * anywhere else in the application.
 */
export const LEAGUE_CONFIG = {
  slug: 'Raging_Echoes_League',
  displayName: 'Raging Echoes League',
} as const;

/**
 * Returns the OSRS Wiki area page URL for the given region using the current
 * league slug. Returns `undefined` for "Global" — it has no dedicated area page.
 *
 * MediaWiki convention: spaces → underscores, & → %26.
 */
export function regionWikiUrl(area: string): string | undefined {
  if (area === 'Global') return undefined;
  const slug = area.replace(/ /g, '_').replace(/&/g, '%26');
  return `https://oldschool.runescape.wiki/w/${LEAGUE_CONFIG.slug}/Areas/${slug}`;
}

// ─── Difficulty icons ────────────────────────────────────────────────────────

/**
 * Maps a difficulty tier name to a local asset path under /icons/difficulties/.
 */
export const DIFFICULTY_ICON: Record<string, string> = {
  Easy:   '/icons/difficulties/Trailblazer_Reloaded_League_tasks_-_Easy.png',
  Medium: '/icons/difficulties/Trailblazer_Reloaded_League_tasks_-_Medium.png',
  Hard:   '/icons/difficulties/Trailblazer_Reloaded_League_tasks_-_Hard.png',
  Elite:  '/icons/difficulties/Trailblazer_Reloaded_League_tasks_-_Elite.png',
  Master: '/icons/difficulties/Trailblazer_Reloaded_League_tasks_-_Master.png',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the local skill icon path for `skill`, or undefined if not mapped. */
export function skillIconUrl(skill: string): string | undefined {
  return SKILL_ICON[skill];
}

/** Returns the local region icon path for `area`, or undefined if not mapped. */
export function regionIconUrl(area: string): string | undefined {
  return REGION_ICON[area];
}

/**
 * Returns the appropriate Tailwind size class for an area icon.
 *
 * The Global icon (Globe-icon.png) is visually larger than the region badge
 * icons, so it receives a reduced display size to stay balanced with peers.
 * All other regions use the context default.
 *
 * @param area    - The region/area name (e.g. "Global", "Asgarnia")
 * @param context - "table" for the task-table area cell, "filter" for filter-bar buttons
 */
export function regionIconClass(area: string, context: 'table' | 'filter'): string {
  if (area === 'Global') {
    return context === 'table' ? 'w-[22px] h-[22px] flex-shrink-0' : 'w-[21px] h-[21px] flex-shrink-0';
  }
  return context === 'table' ? 'w-[32px] h-[32px] flex-shrink-0' : 'w-[30px] h-[30px] flex-shrink-0';
}

/** Returns the local difficulty icon path for `tier`, or undefined if not mapped. */
export function difficultyIconUrl(tier: string): string | undefined {
  return DIFFICULTY_ICON[tier];
}

// ─── Category icons ──────────────────────────────────────────────────────────

/**
 * Maps a UI category name to a local asset path under /icons/categories/.
 */
export const CATEGORY_ICON: Record<string, string> = {
  Combat:      '/icons/categories/Combat.png',
  Skill:       '/icons/categories/Skill.png',
  Clue:        '/icons/categories/Clue.png',
  Quest:       '/icons/categories/Quest.png',
  Achievement: '/icons/categories/Achievement.png',
  Minigame:    '/icons/categories/Minigame.png',
  Other:       '/icons/categories/Other.png',
};

/** Returns the local category icon path for `category`, or undefined if not mapped. */
export function categoryIconUrl(category: string): string | undefined {
  return CATEGORY_ICON[category];
}

// ─── Requirements parser ─────────────────────────────────────────────────────

/**
 * A single parsed chunk of a requirements string.
 * - `skill`  — resolved skill icon + level number
 * - `region` — resolved region icon (matched by canonical name or common abbreviation)
 * - `text`   — everything else; rendered as plain text
 */
export type RequirementPart =
  | { kind: 'skill';  skill: string;  level: number; iconUrl: string }
  | { kind: 'region'; area: string;   iconUrl: string; fallbackColor: string }
  | { kind: 'text';   text: string };

/**
 * Maps common region abbreviations used in task requirement text to the
 * canonical REGION_ICON key. Sorted longest-first at build-time to ensure
 * the regex alternation prefers longer matches (e.g. "Fremennik Province"
 * before "Fremennik").
 */
const REGION_TEXT_MATCH: Record<string, string> = {
  'Fremennik Province': 'Fremennik Province',
  'Kourend & Kebos':    'Kourend & Kebos',
  'Kharidian Desert':   'Kharidian Desert',
  Asgarnia:   'Asgarnia',
  Fremennik:  'Fremennik Province',
  Kandarin:   'Kandarin',
  Karamja:    'Karamja',
  Kourend:    'Kourend & Kebos',
  Desert:     'Kharidian Desert',
  Misthalin:  'Misthalin',
  Morytania:  'Morytania',
  Tirannwn:   'Tirannwn',
  Varlamore:  'Varlamore',
  Wilderness: 'Wilderness',
  Global:     'Global',
};

// Pre-built regex: keys sorted longest-first, special chars escaped.
const REGION_REGEX = new RegExp(
  '(' +
  Object.keys(REGION_TEXT_MATCH)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') +
  ')',
  'g',
);

/** Post-process parsed parts: replace region name strings with region icon parts. */
function substituteRegions(parts: RequirementPart[]): RequirementPart[] {
  const out: RequirementPart[] = [];
  for (const part of parts) {
    if (part.kind !== 'text') { out.push(part); continue; }
    const segs = part.text.split(REGION_REGEX);
    for (const seg of segs) {
      if (!seg) continue;
      const canonical = REGION_TEXT_MATCH[seg];
      if (canonical) {
        out.push({
          kind: 'region',
          area: canonical,
          iconUrl: REGION_ICON[canonical] ?? '',
          fallbackColor: REGION_COLOUR[canonical] ?? '#888',
        });
      } else {
        out.push({ kind: 'text', text: seg });
      }
    }
  }
  return out;
}

/**
 * Parse a requirements display string into structured parts.
 *
 * Recognises both scraper format ("Firemaking 50") and wiki-notes format
 * ("50 Firemaking", "Level 50 Firemaking"). Each comma- or newline-separated
 * segment is checked independently. Anything that doesn't resolve to a known
 * skill falls back to a plain-text part.
 */
export function parseRequirements(requirementsText: string): RequirementPart[] {
  if (!requirementsText) {
    return [];
  }

  // If the requirements text is just a placeholder dash, return it as one plain text part.
  if (requirementsText === '—') {
    return [{ kind: 'text', text: '—' }];
  }

  const parts: RequirementPart[] = [];

  const segments = requirementsText
    .split(/(\r?\n|,\s*|;\s*)/)
    .filter((s) => s !== undefined && s !== '');

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // If it's a separator, add it as text.
    if (seg.match(/^(\r?\n|,\s*|;\s*)$/)) {
      parts.push({ kind: 'text', text: seg });
      continue;
    }

    const trimmed = seg.trim();
    if (!trimmed) {
      parts.push({ kind: 'text', text: seg });
      continue;
    }

    // Pattern A: "50 Firemaking" or "Level 50 Firemaking"
    const mA = trimmed.match(/^(?:Level\s+)?(\d+)\s+([A-Z][a-z]+)$/);
    if (mA) {
      const level = parseInt(mA[1], 10);
      const skillName = mA[2].charAt(0).toUpperCase() + mA[2].slice(1).toLowerCase();
      const iconUrl = SKILL_ICON[skillName];
      if (iconUrl) {
        // Preserving any whitespace from the original segment around the skill
        const leadingSpace = seg.match(/^\s*/)?.[0] || '';
        const trailingSpace = seg.match(/\s*$/)?.[0] || '';
        if (leadingSpace) parts.push({ kind: 'text', text: leadingSpace });
        parts.push({ kind: 'skill', skill: skillName, level, iconUrl });
        if (trailingSpace) parts.push({ kind: 'text', text: trailingSpace });
        continue;
      }
    }

    // Pattern B: "Firemaking 50"
    const mB = trimmed.match(/^([A-Z][a-z]+)\s+(\d+)$/);
    if (mB) {
      const skillName = mB[1].charAt(0).toUpperCase() + mB[1].slice(1).toLowerCase();
      const level = parseInt(mB[2], 10);
      const iconUrl = SKILL_ICON[skillName];
      if (iconUrl) {
        // Preserving any whitespace from the original segment around the skill
        const leadingSpace = seg.match(/^\s*/)?.[0] || '';
        const trailingSpace = seg.match(/\s*$/)?.[0] || '';
        if (leadingSpace) parts.push({ kind: 'text', text: leadingSpace });
        parts.push({ kind: 'skill', skill: skillName, level, iconUrl });
        if (trailingSpace) parts.push({ kind: 'text', text: trailingSpace });
        continue;
      }
    }

    // Single Skill Pattern: "Thieving", "Woodcutting", etc.
    const mC = trimmed.match(/^([A-Z][a-z]+)$/);
    if (mC) {
      const skillName = mC[1].charAt(0).toUpperCase() + mC[1].slice(1).toLowerCase();
      const iconUrl = SKILL_ICON[skillName];
      if (iconUrl) {
        const leadingSpace = seg.match(/^\s*/)?.[0] || '';
        const trailingSpace = seg.match(/\s*$/)?.[0] || '';
        if (leadingSpace) parts.push({ kind: 'text', text: leadingSpace });
        parts.push({ kind: 'skill', skill: skillName, level: 0, iconUrl });
        if (trailingSpace) parts.push({ kind: 'text', text: trailingSpace });
        continue;
      }
    }

    parts.push({ kind: 'text', text: seg });
  }

  return substituteRegions(parts);
}
