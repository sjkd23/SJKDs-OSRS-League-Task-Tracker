#!/usr/bin/env node
/**
 * upgrade-league6-ids.cjs
 *
 * Upgrades known preliminary struct IDs in a merged League 6 dataset using a
 * mappings file, then writes the result to an output path.
 *
 * Usage:
 *   node scripts/upgrade-league6-ids.cjs
 *
 * The script is intentionally non-destructive:
 *   - Input files are never modified.
 *   - Tasks without a known mapping are left unchanged.
 *   - The script is safe to re-run at any time.
 *
 * Expected files (relative to the repo root):
 *   INPUT   client/public/data/LEAGUE_6.full_thisistheoneIuse.json  — merged enriched dataset
 *   MAPPING client/public/data/LEAGUE_6-mappings.json               — preliminary → real structId map
 *   OUTPUT  client/public/data/LEAGUE_6.full.json                   — app-facing dataset
 *
 * Mappings file format:
 *   Array of { league_6_preliminary_id: number, league_6_real_structId: number }
 *   OR a record/object mapping preliminary IDs to real IDs.
 *   Both formats are accepted.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');

const DATA_DIR = path.join(REPO_ROOT, 'client', 'public', 'data');

const INPUT_PATH   = path.join(DATA_DIR, 'LEAGUE_6.full_thisistheoneIuse.json');
const MAPPING_PATH = path.join(DATA_DIR, 'LEAGUE_6-mappings.json');
const OUTPUT_PATH  = path.join(DATA_DIR, 'LEAGUE_6.full.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Build a Map<preliminaryId, realStructId> from the mappings file.
 * Accepts either:
 *   - Array of { league_6_preliminary_id, league_6_real_structId }
 *   - Plain object / record { "123": 456 }
 */
function buildMappingMap(raw) {
  const map = new Map();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const prelim = entry.league_6_preliminary_id ?? entry.preliminaryId ?? entry.from;
      const real   = entry.league_6_real_structId  ?? entry.realStructId  ?? entry.to;
      if (typeof prelim === 'number' && typeof real === 'number') {
        map.set(prelim, real);
      }
    }
  } else if (raw !== null && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const prelim = parseInt(key, 10);
      const real   = typeof value === 'number' ? value : parseInt(String(value), 10);
      if (!isNaN(prelim) && !isNaN(real)) {
        map.set(prelim, real);
      }
    }
  }

  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('League 6 ID upgrade script');
console.log('─'.repeat(50));

// Validate input files.
for (const [label, filePath] of [['Input', INPUT_PATH], ['Mapping', MAPPING_PATH]]) {
  if (!fs.existsSync(filePath)) {
    console.error(`\n[ERROR] ${label} file not found:\n  ${filePath}`);
    console.error('\nPlace the file at the path above and re-run the script.');
    process.exit(1);
  }
}

console.log(`Input:   ${INPUT_PATH}`);
console.log(`Mapping: ${MAPPING_PATH}`);
console.log(`Output:  ${OUTPUT_PATH}`);
console.log();

// Load data.
const tasks   = readJson(INPUT_PATH);
const rawMaps = readJson(MAPPING_PATH);

if (!Array.isArray(tasks)) {
  console.error('[ERROR] Input file must be a JSON array of task objects.');
  process.exit(1);
}

const mapping = buildMappingMap(rawMaps);
console.log(`Tasks:    ${tasks.length}`);
console.log(`Mappings: ${mapping.size}`);
console.log();

// Apply upgrades.
let upgraded = 0;
let unchanged = 0;

const result = tasks.map((task) => {
  if (typeof task.structId !== 'number') {
    unchanged++;
    return task;
  }
  const realId = mapping.get(task.structId);
  if (realId === undefined || realId === task.structId) {
    unchanged++;
    return task;
  }
  upgraded++;
  return { ...task, structId: realId };
});

console.log(`Upgraded:  ${upgraded} tasks`);
console.log(`Unchanged: ${unchanged} tasks`);
console.log();

if (upgraded === 0) {
  console.log('No IDs required upgrading. Output will match input.');
}

// Write output.
writeJson(OUTPUT_PATH, result);
console.log(`Written:   ${OUTPUT_PATH}`);
console.log('\nDone. The app-facing dataset has been updated.');
console.log('Commit the output file and set leagueConfig.transitional = false when all IDs are official.');
