# wikisync-scraper

**Local proof-of-concept** — automate the OSRS Wiki WikiSync UI to import
Leagues task completion state into the tracker.

> ⚠ This is NOT a production feature.  It is a personal, local investigation
> tool.  The selectors used here are brittle and will break if the OSRS Wiki
> updates its WikiSync gadget markup.  This is intentional and expected.

---

## Quick start

```bash
# 1. Install dependencies (first time only)
cd tools/wikisync
npm install

# 2. Install the Playwright browser (first time only — downloads ~150 MB Chromium)
npx playwright install chromium

# 3. Run a scrape
npm run wikisync:import -- <your-rsn>

# With a visible browser window (useful for debugging):
npm run wikisync:import -- <your-rsn> --headed

# Discovery mode — dumps raw DOM info before and after personalisation:
npm run wikisync:import -- <your-rsn> --discover

# Override the wiki page (e.g. for a different league):
npm run wikisync:import -- <your-rsn> --page "https://oldschool.runescape.wiki/w/Leagues_VI:_Demonic_Pacts/Tasks"
```

Output is saved to `tools/wikisync/output/<username>-<timestamp>.json`.

---

## What it does

1. Opens the OSRS Wiki Leagues task list page in a headless Chromium.
2. Finds the WikiSync username input and types your RSN.
3. Waits for the Wiki's WikiSync gadget to personalise the page.
4. Extracts:
   - completed tasks (with app IDs where matched)
   - overall completion percentage
   - partial area/region data (see limitations)
5. Saves a structured JSON file.

---

## Applying the result to the tracker

```bash
tsx src/mapToTracker.ts output/<username>-<timestamp>.json
```

This prints a JSON payload and a snippet you can paste into the browser
console to mark tasks as completed in your tracker:

```js
localStorage.setItem('osrs-lt:completed', JSON.stringify([...]));
location.reload();
```

---

## Page used

| League | URL |
|--------|-----|
| Leagues V – Raging Echoes (default) | `https://oldschool.runescape.wiki/w/Leagues_V:_Raging_Echoes/Tasks` |
| Leagues VI – Demonic Pacts | `https://oldschool.runescape.wiki/w/Leagues_VI:_Demonic_Pacts/Tasks` |

Use `--page <url>` to switch.

---

## How personalisation is triggered

1. The scraper locates the WikiSync text input using a prioritised list of
   selectors (class names, id patterns, placeholder text attributes).
2. Types the username and submits via button click or Enter key.
3. Waits for any of:
   - A `<tr>` with a known completion class (`wikisync-complete` etc.) to appear
   - A progress counter element to appear
   - A network request to `sync.runescape.wiki` to complete with HTTP 2xx
4. Times out after 30 seconds if none of the above conditions are met.

---

## How task completion is detected

Priority order:

| Priority | Method | Reliability |
|----------|--------|-------------|
| 1 | `<tr class="wikisync-complete">` or variant CSS class | High (class is stable across reloads) |
| 2 | `<tr style="background-color: #d4efdf">` inline green style | Medium (colour value could change) |
| 3 | None found — personalisation did not succeed | — |

The `completionDetectionMethod` field in the output JSON tells you exactly
which method was used for the specific run.

---

## How tasks are matched to app IDs

1. **`data-taskid` attribute on `<tr>`** — if the wiki table includes
   `data-taskid="<structId>"`, this maps directly and reliably.
2. **Normalised name match** — if no `data-taskid` is present, the scraped
   task name is lower-cased and whitespace-collapsed, then looked up against
   the same name in `LEAGUE_5.full.json`.  This is less reliable if the wiki
   uses slightly different wording.

Unmatched tasks are reported in `completedUnmatchedNames` and the summary.

---

## Limitations (be honest)

### Region / area unlock state — NOT extractable
The Leagues task-list page **does not show which areas a player has unlocked**.
Region unlocks are stored on a separate wiki page and are not injected into the
task-list DOM by the WikiSync gadget.  `unlockedAreas` will always be `[]`
unless the wiki adds this in a future update.

To get region data you would need to scrape a different wiki page (e.g. the
relics/regions overview page), and it is not clear that WikiSync personalises
that page at all.

### Name matching is fragile
If the wiki task names differ from the local `LEAGUE_5.full.json` names (due
to typos, capitalisation, or renames), those tasks will not be matched to an
app ID.  They will appear in `completedUnmatchedNames`.  This is reported
clearly in the summary output.

### Selector-based — will break if wiki markup changes
All detection is based on CSS classes and DOM attributes that the OSRS Wiki
gadget happens to use right now.  If the wiki updates its WikiSync gadget, the
selectors may stop working.  Use `--discover` mode to re-inspect the DOM and
update the selectors in `src/scrape.ts`.

### Not a production path — manual only
This tool requires a local Node.js + browser install and manual CLI invocation.
It is not suitable for automated or scheduled use.  It is a diagnostic tool to
determine whether a WikiSync import path is **worth building properly**.

---

## Output JSON shape

```ts
interface WikiSyncImport {
  username: string;                 // RSN searched
  sourcePage: string;               // wiki URL used
  syncedAt: string;                 // ISO timestamp
  personalisationSucceeded: boolean;
  personalisationNote: string;      // plain-English result explanation
  completionDetectionMethod: string;// what DOM marker was used
  completionPercent: number | null; // 0–100, or null if not found
  completionPercentRaw: string | null;
  unlockedAreas: string[];          // always [] — see limitations
  tasks: WikiSyncTask[];            // all task rows + completion state
  completedTaskIds: string[];       // "task-<structId>-<sortId>" for matched+complete
  completedUnmatchedNames: string[];
  summary: { totalTasksFound, completedTasksFound, matchedToAppId, unmatchedNames };
  rawExtra: Record<string, unknown>;// debug/diagnostic fields
}
```

---

## File structure

```
tools/wikisync/
  package.json          npm package — Playwright + tsx
  tsconfig.json
  src/
    types.ts            WikiSyncImport / WikiSyncTask types
    scrape.ts           Main Playwright scraper
    mapToTracker.ts     Mapper stub → tracker localStorage format
  output/               Created on first run; gitignored
  README.md             This file
```

---

## Feasibility summary

| Question | Answer |
|----------|--------|
| Can we open the wiki page and trigger WikiSync personalisation? | **Yes** — Playwright + real Chromium handles it cleanly. |
| Can we detect completed tasks from the DOM? | **Yes (likely)** — if the WikiSync gadget uses class markers on `<tr>` rows; confirmed pattern on prior league pages. |
| Are task IDs stable enough to map to app IDs? | **Yes** — `data-taskid` = structId is the same value used in the local JSON. |
| Can we get overall completion %? | **Yes** — the counter element is present on personalised pages. |
| Can we get unlocked regions? | **No** — not available in the task-list DOM. |
| Is this robust enough for personal/manual import? | **Yes, with caveats** — it is a useful manual import path. |
| Should this be productionised now? | **Not yet** — validate it works for a real username first, then decide. |
