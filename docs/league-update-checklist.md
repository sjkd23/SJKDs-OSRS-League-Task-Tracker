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

## 4. Check Data Backwards Compatibility
Since Route Shares (saved in Cloudflare KV) store tasks largely by reference/ID configurations, ensure that new scraped JSONs maintain stable task IDs if possible to prevent old share links breaking. If breaking changes happen, test the `/api/share` handlers for failure.

## 5. Test
When testing the new dataset, execute the following smoke tests before considering the update complete:
- **Plugin Import Validation:** Successfully import an active progress string from the RuneLite Tasks Tracker plugin.
- **Task Type Compatibility:** Ensure no "Wrong task type" errors occur during import (which usually means `pluginTaskType` in `leagueConfig.ts` is mismatched).  
- **Route Import/Export:** Create a custom route, add generic tasks, save it, and reload the browser. Then attempt to export it to RuneLite format.
- **Share/Load Sanity Check:** Ensure you are running `npm run pages:dev` to enable KV backend functions, create a custom Route Planner list, click "Share", obtain the shortlink, and successfully reload the list from that shortlink locally.

If all smoke tests pass:
- Ensure the app title, filters, UI, and icons render correctly visually.

## 6. Build and Deploy
- Commit changes and push safely to trigger the Cloudflare Pages deploy action.
- The next time users visit, the Edge will auto-cache the new JSON, and the League tasks will update!