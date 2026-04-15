import type { AppTask, Tier } from '@/types/task';
import type { ScraperTask } from '@/types/scraperTask';
import { cleanWikiGarbage } from '@/utils/wikiContent';

// ─── Tier configuration ───────────────────────────────────────────────────────

/**
 * Points awarded per tier. Adjust here when official Raging Echoes values
 * are confirmed — all display labels update automatically.
 */
export const TIER_POINTS: Record<Tier, number> = {
  Easy:   10,
  Medium: 30,
  Hard:   80,
  Elite:  200,
  Master: 400,
};

const TIER_ORDER: Record<Tier, number> = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
  Elite: 4,
  Master: 5,
};

export { TIER_ORDER };

const TIER_BY_NUMBER: Record<number, Tier> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
  4: 'Elite',
  5: 'Master',
};

const VALID_TIERS = new Set<string>(Object.keys(TIER_POINTS));

// ─── UI Category derivation ───────────────────────────────────────────────────

/**
 * The fixed set of UI category values shown in the Category filter.
 * "Clue" is derived — it does not appear in the raw scraper output.
 */
export const UI_CATEGORIES = ['Combat', 'Skill', 'Clue', 'Quest', 'Achievement', 'Minigame', 'Other'] as const;
export type UICategory = (typeof UI_CATEGORIES)[number];

/**
 * Derive the UI-facing category for a task.
 *
 * Tasks whose name contains "clue" (case-insensitive) are reclassified as
 * "Clue" so they can be filtered separately from the broader "Minigame"
 * bucket they typically appear in per the raw scraper data.
 */
export function deriveUICategory(name: string, rawCategory: string): string {
  if (name.toLowerCase().includes('clue')) return 'Clue';
  return rawCategory;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalises an array of RichParts by cleaning wiki garbage and merging
 * contiguous text parts. This allows us to collapse unwanted double spaces
 * that arise from text part joining (e.g. from stripped wiki tags) without
 * breaking legitimate spacing in other fields.
 */
function cleanTextParts(parts?: import('@/types/richPart').RichPart[], isRequirements = false): import('@/types/richPart').RichPart[] | undefined {
  if (!parts) return undefined;

  // First pass: clean wiki garbage
  const cleaned = parts.map((p) => ({ ...p, text: cleanWikiGarbage(p.text) }));

  // Second pass: merge contiguous text parts
  const merged: import('@/types/richPart').RichPart[] = [];
  for (const part of cleaned) {
    if (merged.length > 0) {
      const last = merged[merged.length - 1];
      if (last.type === 'text' && part.type === 'text') {
        last.text += part.text;
        continue;
      }
    }
    merged.push({ ...part });
  }

  // Third pass: collapse double spaces
  // For requirements: preserve double spaces immediately following a comma, semicolon or colon.
  return merged.map((p) => {
    if (p.type === 'text') {
      if (isRequirements) {
        p.text = p.text.replace(/ {2,}/g, (match, offset, str) => {
          const prev = str.substring(0, offset);
          return /[,;:]\s*$/.test(prev) ? match : ' ';
        });
      } else {
        p.text = p.text.replace(/ {2,}/g, ' ');
      }
    }
    return p;
  });
}

/**
 * Convert a single raw scraper task into the app-facing AppTask shape.
 *
 * Handles the real LEAGUE_5 scraper output:
 * - `skill` may be null → normalised to `"All"`
 * - `skills` is an array of `{ skill: string, level: number }` objects
 * - `completionPercent`, `wikiNotes`, `wikiUrl` are all optional
 */
export function mapScraperTask(raw: ScraperTask): AppTask {
  const tier = resolveTier(raw);
  const points = TIER_POINTS[tier];
  const skillStrings = resolveSkillStrings(raw.skills);
  const requirementsText = deriveRequirementsText(raw, skillStrings);

  return {
    id: `task-${raw.structId}-${raw.sortId}`,
    structId: raw.structId,
    sortId: raw.sortId,
    // null area can appear on unmatched merge entries — normalise to 'Unknown'
    area: raw.area ?? 'Unknown',
    name: cleanWikiGarbage(raw.name),
    description: cleanWikiGarbage(raw.description),
    // category can be null in transitional League 6 data — normalise to 'Other'
    category: raw.category ?? 'Other',
    uiCategory: deriveUICategory(raw.name, raw.category ?? 'Other'),
    // null means the same as "All" in the league data — no specific skill tier
    skill: raw.skill ?? 'All',
    tier,
    tierName: tier,
    points,
    completionPercent: raw.completionPercent ?? 0,
    skills: skillStrings,
    wikiNotes: cleanWikiGarbage(raw.wikiNotes ?? ''),
    requirementsText: cleanWikiGarbage(requirementsText).trim(),
    ptsLabel: `${tier} – ${points}`,
    wikiUrl: raw.wikiUrl,
    // taskKey: wiki-fallback stable identity (League 6+), absent in earlier data
    ...(raw.taskKey ? { taskKey: raw.taskKey } : {}),
    // ── Rich-text parts: passed through as-is; optional / may be absent ──
    nameParts: cleanTextParts(raw.nameParts),
    descriptionParts: cleanTextParts(raw.descriptionParts),
    requirementsParts: cleanTextParts(raw.requirementsParts, true),
  };
}

/**
 * Convert an entire array of raw scraper tasks — the primary entry point
 * when loading real league data.
 *
 * Entries with a null/undefined structId are silently skipped: they are
 * unmatched placeholders from the merge pipeline that have no valid struct
 * identity and cannot be displayed or tracked.
 *
 * Usage:
 * ```ts
 * const raw: ScraperTask[] = await fetch('/data/league6.full.json').then(r => r.json());
 * const tasks: AppTask[] = mapScraperTasks(raw);
 * ```
 */
export function mapScraperTasks(rawTasks: ScraperTask[]): AppTask[] {
  return rawTasks
    .filter((raw): raw is ScraperTask => raw.structId != null)
    .map(mapScraperTask);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveTier(raw: ScraperTask): Tier {
  // Prefer the string tierName if it is a known tier value
  if (raw.tierName && VALID_TIERS.has(raw.tierName)) {
    return raw.tierName as Tier;
  }
  // Fall back to the numeric tier field
  return TIER_BY_NUMBER[raw.tier] ?? 'Easy';
}

/**
 * Convert the scraper's skills array from objects to display strings.
 * e.g. { skill: "DEFENCE", level: 40 } → "Defence 40"
 */
function resolveSkillStrings(skills?: { skill: string; level: number }[]): string[] {
  if (!skills || skills.length === 0) return [];
  return skills
    .filter((s) => s.skill != null && s.level != null)
    .map(
      (s) => `${s.skill.charAt(0).toUpperCase() + s.skill.slice(1).toLowerCase()} ${s.level}`,
    );
}

function deriveRequirementsText(raw: ScraperTask, skillStrings: string[]): string {
  if (raw.wikiNotes && raw.wikiNotes.trim().length > 0) {
    return raw.wikiNotes.trim();
  }
  if (skillStrings.length > 0) {
    return skillStrings.join(', ');
  }
  return '—';
}
