# Data Pipeline

The OSRS Leagues Task Tracker is a purely client-side application. Because the dataset for a League is static once launched (with only minor hotfixes), we bundle the task data directly into the app rather than querying an external API.

## 1. Raw Scraper Data (`ScraperTask`)
We begin with raw JSON exported from an external wiki scraper.
- The raw data is placed in `client/public/data/` (e.g., `LEAGUE_5.full.json`).
- These tasks adhere loosely to the `ScraperTask` interface (found in `client/src/types/scraperTask.ts`).

## 2. App Task Mapping (`AppTask`)
When the application loads, `client/src/state/useTaskStore.ts` fetches the JSON file from the `/data/` path. 
Once fetched, the raw data passes through `client/src/lib/mapScraperTask.ts`.
- This mapping ensures fields are strictly typed.
- Missing or malformed data is normalized.
- The result is an array of `AppTask` objects, which the rest of the application relies on.

## 3. User State Merging (`TaskUserState`)
Once tasks are loaded and mapped, they are paired with user-specific state.
- **`localStorage`:** Completed IDs and To-Do IDs are loaded from the browser's `localStorage` (via `client/src/utils/storage.ts`).
- **Hydration:** The store hydrates a `Map<string, TaskUserState>` that records whether a given task ID is `completed`, `todo`, etc.
- **Pruning:** During hydration, any local storage IDs that no longer exist in the raw dataset are pruned to prevent stale data buildup.

## 4. UI Rendering (`TaskView`)
When rendering the task list (e.g., in `TaskTable` or `MobileTaskList`), the `AppTask` data and the `TaskUserState` are combined and filtered as needed.
- `client/src/utils/taskFilters.ts` handles the active filter evaluation (Skill, Region, Difficulty).
- The filtered list is sorted and passed to the display components.