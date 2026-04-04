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

// ─── Public API ───────────────────────────────────────────────────────────────

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
    area: raw.area,
    name: cleanWikiGarbage(raw.name),
    description: cleanWikiGarbage(raw.description),
    category: raw.category,
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
    // ── Rich-text parts: passed through as-is; optional / may be absent ──
    nameParts: raw.nameParts?.map((p) => ({ ...p, text: cleanWikiGarbage(p.text) })),
    descriptionParts: raw.descriptionParts?.map((p) => ({ ...p, text: cleanWikiGarbage(p.text) })),
    requirementsParts: raw.requirementsParts?.map((p) => {
      // Clean garbage but preserve spaces within parts.
      // We only trim newlines from the very ends of the parts array if they are just "\n"
      let text = cleanWikiGarbage(p.text);
      return { ...p, text };
    }),
  };
}

/**
 * Convert an entire array of raw scraper tasks — the primary entry point
 * when loading real league data.
 *
 * Usage:
 * ```ts
 * const raw: ScraperTask[] = await fetch('/data/league6.full.json').then(r => r.json());
 * const tasks: AppTask[] = mapScraperTasks(raw);
 * ```
 */
export function mapScraperTasks(rawTasks: ScraperTask[]): AppTask[] {
  return rawTasks.map(mapScraperTask);
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
  return skills.map(
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
