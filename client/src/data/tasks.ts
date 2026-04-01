import type { AppTask, Tier } from '@/types/task';
import { TIER_POINTS } from '@/lib/mapScraperTask';

/**
 * Development seed data — a small realistic sample of Demonic Pacts-style tasks.
 *
 * This dataset is already in the normalised AppTask shape, so it can be
 * rendered directly without going through mapScraperTask.
 *
 * To replace with real scraper data:
 *   1. Fetch league6.full.json from the scraper output
 *   2. Call mapScraperTasks(raw) from @/lib/mapScraperTask
 *   3. Export the result as TASKS here (or load it dynamically in the store)
 */

function task(
  structId: number,
  sortId: number,
  area: string,
  name: string,
  description: string,
  category: string,
  skill: string,
  tier: Tier,
  skills: string[],
  wikiNotes: string,
  wikiUrl?: string,
): AppTask {
  const points = TIER_POINTS[tier];
  const requirementsText =
    wikiNotes.trim().length > 0
      ? wikiNotes.trim()
      : skills.length > 0
        ? skills.join(', ')
        : '—';

  return {
    id: `task-${structId}-${sortId}`,
    structId,
    sortId,
    area,
    name,
    description,
    category,
    skill,
    tier,
    tierName: tier,
    points,
    completionPercent: 0,
    skills,
    wikiNotes,
    requirementsText,
    ptsLabel: `${tier} – ${points}`,
    wikiUrl,
  };
}

// prettier-ignore
export const TASKS: AppTask[] = [
  // ── Easy ──────────────────────────────────────────────────────────────────
  task(1001, 1,  'Global',    'Chop Some Logs',                'Chop any kind of logs.',                                              'Skilling',  'Woodcutting', 'Easy',   ['Any axe'],            'Any axe',                        'https://oldschool.runescape.wiki/w/Woodcutting'),
  task(1002, 2,  'Global',    'Fish a Shrimp',                 'Catch a raw shrimp or anchovy.',                                      'Skilling',  'Fishing',     'Easy',   ['Small fishing net'],  'Small fishing net',              'https://oldschool.runescape.wiki/w/Shrimp'),
  task(1003, 3,  'Global',    'Complete a Slayer Task',        'Complete any Slayer assignment.',                                     'Combat',    'Slayer',       'Easy',   [],                     '',                               'https://oldschool.runescape.wiki/w/Slayer'),
  task(1004, 4,  'Misthalin', 'Mine Some Copper',              'Mine a copper ore.',                                                  'Skilling',  'Mining',       'Easy',   ['Any pickaxe'],        'Any pickaxe',                    'https://oldschool.runescape.wiki/w/Copper_ore'),
  task(1005, 5,  'Misthalin', 'Complete a Beginner Clue',     'Open a beginner clue scroll casket.',                                 'Clue',      'General',      'Easy',   [],                     '',                               'https://oldschool.runescape.wiki/w/Beginner_clue_scroll'),
  task(1006, 6,  'Asgarnia',  'Kill a Goblin',                 'Kill a goblin in Asgarnia.',                                          'Combat',    'General',      'Easy',   [],                     '',                               'https://oldschool.runescape.wiki/w/Goblin'),
  task(1007, 7,  'Karamja',   'Pick Some Bananas',             'Pick 5 bananas from the Karamja banana plantation.',                  'Skilling',  'Farming',      'Easy',   [],                     '',                               'https://oldschool.runescape.wiki/w/Banana'),
  task(1008, 8,  'Kandarin',  'Cook a Sardine',                'Cook a sardine.',                                                     'Skilling',  'Cooking',      'Easy',   ['Cooking 1'],          'Cooking 1',                      'https://oldschool.runescape.wiki/w/Sardine'),

  // ── Medium ────────────────────────────────────────────────────────────────
  task(2001, 9,  'Global',    'Reach Level 50 in Any Skill',  'Achieve level 50 in any skill.',                                      'Skilling',  'General',      'Medium', [],                     '',                               'https://oldschool.runescape.wiki/w/Skills'),
  task(2002, 10, 'Global',    'Complete an Easy Clue Scroll', 'Open an easy clue scroll casket.',                                    'Clue',      'General',      'Medium', [],                     '',                               'https://oldschool.runescape.wiki/w/Easy_clue_scroll'),
  task(2003, 11, 'Kandarin',  'Catch a Swordfish',             'Catch a raw swordfish at Catherby.',                                  'Skilling',  'Fishing',      'Medium', ['Fishing 50'],         'Fishing 50',                     'https://oldschool.runescape.wiki/w/Swordfish'),
  task(2004, 12, 'Morytania', 'Kill a Ghoul',                  'Kill a ghoul.',                                                       'Combat',    'General',      'Medium', [],                     '',                               'https://oldschool.runescape.wiki/w/Ghoul'),
  task(2005, 13, 'Karamja',   'Complete Brimhaven Agility',   'Earn 1,000 tickets at the Brimhaven Agility Arena.',                  'Skilling',  'Agility',      'Medium', ['Agility 1'],          'Agility 1',                      'https://oldschool.runescape.wiki/w/Brimhaven_Agility_Arena'),
  task(2006, 14, 'Fremennik', 'Complete The Fremennik Trials', 'Complete the Fremennik Trials quest.',                                'Questing',  'General',      'Medium', ['Crafting 40', 'Woodcutting 40', 'Fletching 25'], 'Crafting 40, Woodcutting 40, Fletching 25', 'https://oldschool.runescape.wiki/w/The_Fremennik_Trials'),
  task(2007, 15, 'Desert',    'Complete Contact!',             'Complete the Contact! quest.',                                        'Questing',  'General',      'Medium', ['Magic 50'],           'Magic 50',                       'https://oldschool.runescape.wiki/w/Contact!'),

  // ── Hard ──────────────────────────────────────────────────────────────────
  task(3001, 16, 'Global',    'Complete a Hard Clue Scroll',  'Open a hard clue scroll casket.',                                     'Clue',      'General',      'Hard',   [],                     '',                               'https://oldschool.runescape.wiki/w/Hard_clue_scroll'),
  task(3002, 17, 'Wilderness','Kill the Chaos Elemental',     'Kill the Chaos Elemental in the Wilderness.',                         'Combat',    'General',      'Hard',   [],                     'High combat recommended',        'https://oldschool.runescape.wiki/w/Chaos_Elemental'),
  task(3003, 18, 'Desert',    'Complete the Agility Pyramid', 'Reach the top of the Agility Pyramid.',                               'Skilling',  'Agility',      'Hard',   ['Agility 30'],         'Agility 30',                     'https://oldschool.runescape.wiki/w/Agility_Pyramid'),
  task(3004, 19, 'Kandarin',  'Complete Barbarian Assault',   'Complete a game of Barbarian Assault.',                               'Minigame',  'General',      'Hard',   [],                     '',                               'https://oldschool.runescape.wiki/w/Barbarian_Assault'),
  task(3005, 20, 'Kourend',   'Craft Blood Runes',             'Craft blood runes at the Blood Altar.',                               'Skilling',  'Runecraft',    'Hard',   ['Runecraft 77'],       'Runecraft 77',                   'https://oldschool.runescape.wiki/w/Blood_rune'),
  task(3006, 21, 'Tirannwn',  'Complete Regicide',             'Complete the Regicide quest.',                                        'Questing',  'General',      'Hard',   ['Ranged 56', 'Agility 56'], 'Ranged 56, Agility 56',    'https://oldschool.runescape.wiki/w/Regicide'),

  // ── Elite ─────────────────────────────────────────────────────────────────
  task(4001, 22, 'Global',    'Complete a Master Clue Scroll','Open a master clue scroll casket.',                                   'Clue',      'General',      'Elite',  [],                     '',                               'https://oldschool.runescape.wiki/w/Master_clue_scroll'),
  task(4002, 23, 'Morytania', 'Complete Theatre of Blood',    'Complete the Theatre of Blood.',                                      'Combat',    'General',      'Elite',  [],                     'High combat stats',              'https://oldschool.runescape.wiki/w/Theatre_of_Blood'),
  task(4003, 24, 'Varlamore', 'Catch a Moonlight Moth',       'Catch a moonlight moth in the Hunter Guild area of Varlamore.',       'Skilling',  'Hunter',       'Elite',  ['Hunter 80'],          'Hunter 80',                      'https://oldschool.runescape.wiki/w/Moonlight_moth'),
  task(4004, 25, 'Desert',    'Complete Tombs of Amascut',    'Complete the Tombs of Amascut.',                                      'Combat',    'General',      'Elite',  [],                     'High combat stats',              'https://oldschool.runescape.wiki/w/Tombs_of_Amascut'),

  // ── Master ────────────────────────────────────────────────────────────────
  task(5001, 26, 'Global',    'Reach Level 99 in Any Skill',  'Achieve level 99 in any skill.',                                      'Skilling',  'General',      'Master', [],                     '',                               'https://oldschool.runescape.wiki/w/Skills'),
  task(5002, 27, 'Global',    'Complete the Inferno',          'Complete the Inferno.',                                               'Combat',    'General',      'Master', [],                     'Max combat recommended',         'https://oldschool.runescape.wiki/w/The_Inferno'),
  task(5003, 28, 'Kourend',   'Kill the Nightmare',            'Kill the Nightmare at Slepe.',                                        'Combat',    'Slayer',       'Master', [],                     'High combat stats',              'https://oldschool.runescape.wiki/w/The_Nightmare'),
];
