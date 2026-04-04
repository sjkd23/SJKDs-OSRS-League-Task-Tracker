# League Update Checklist

When a new OSRS League drops (or new tasks are discovered mid-League), the tracker needs to be updated. Since this project is fully client-side and static, updates follow a straightforward process:

## 1. Extract the New Task Data
- Scrape or obtain the JSON file of the new League tasks from the OSRS Wiki.
- Put the new data file (e.g., `LEAGUE_6.full.json`) in `client/public/data/`.

## 2. Update Configuration (`leagueConfig.ts`)
Modify the `CURRENT_LEAGUE` constant in `client/src/lib/leagueConfig.ts`.
Update properties such as:
- `id` (e.g., `6`)
- `name` (e.g., `'Next League Name'`)
- `slug` (e.g., `'next-league-name'`)
- `dataFile` (e.g., `'LEAGUE_6.full.json'`)

## 3. Verify Icons
Sometimes new leagues bring new Regions, Skill subsets, or Tiers.
- Add any missing SVG or PNG icons to `client/public/icons/`.
- Ensure they conform to the folder structure (`areas/`, `difficulties/`, `skills/`).
- If names have changed, update `client/src/lib/wikiIcons.ts` mappings.

## 4. Test
- Run `npm run dev`.
- Ensure the app title, tasks, filters, and icons are rendering correctly.
- If tasks aren't parsing correct, adjust `client/src/lib/mapScraperTask.ts`.

## 5. Build and Deploy
- Commit changes and run `npm run build` or push to your deployment pipeline.
- The next time users visit, the app will automatically fetch the new JSON data and present the updated League tasks!