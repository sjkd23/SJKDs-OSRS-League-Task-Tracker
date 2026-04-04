# OSRS Leagues Task Tracker

A custom task tracker for Old School RuneScape Leagues, currently configured for **League 5: Raging Echoes**.

This is a frontend-only React application that recreates the official OSRS Wiki task list layout while adding essential features for planning and progression. 

## Current Status

The application is fully functional for **Raging Echoes**. It relies entirely on client-side state, making it fast and easy to deploy as a static site.

## Features

- **Wiki-like UI:** Familiar and dense presentation, mirroring the standard OSRS Wiki table layout.
- **Responsive Design:** Desktop table view paired with a mobile-friendly card/sheet layout.
- **Light & Dark Mode:** Built-in theme support styled for readability.
- **Advanced Filtering & Sorting:** Filter tasks by Skill, Region, and Tier (Difficulty). Supports combinations of filters.
- **Completion & To-Do Tracking:** Manually track completed tasks and flag tasks as "To-Do" for quick access.
- **Local Persistence:** Your progress and preferences (completed tasks, to-dos, theme) are automatically saved to your browser's "localStorage".
- **Rich Task Descriptions:** Renders OSRS Wiki icons and parsed wikilinks seamlessly in task descriptions.

*(Note: Screenshots can be added here in the future to showcase the UI)*

## Tech Stack

- **React 18**
- **TypeScript**
- **Vite**
- **Tailwind CSS**

## Quick Start

The app is entirely client-side. The current task dataset is bundled statically in the "client/public/data" directory.

### Local Development

1. Navigate to the "client" directory:
   `ash
   cd client
   `
2. Install dependencies:
   `ash
   npm install
   `
3. Start the development server:
   `ash
   npm run dev
   `
   The app will be available at "http://localhost:5173".

### Build & Check

To build for production:
`ash
npm run build
`
To preview the production build locally:
`ash
npm run preview
`
To run the linter:
`ash
npm run lint
`

## Project Structure Overview

- "client/public/data/" - Static task datasets ("LEAGUE_5.full.json").
- "client/public/icons/" - OSRS Wiki skill and area icons.
- "client/src/components/" - React components, organized by feature area (e.g., "TaskTable", "TaskFilters", "RichText").
- "client/src/lib/" - Configuration ("leagueConfig.ts") and mapping utilities to parse raw scraper data.
- "client/src/state/" - Core hooks for state management (e.g., "useTaskStore.ts" bridging local storage).
- "client/src/utils/" - Shared logic for filtering, storage access, and rendering wiki content.

## How Data Works

- **Bundled Dataset:** We use a JSON file representing raw wiki tasks (currently "LEAGUE_5.full.json").
- **Pipeline:** Raw scraper tasks are fetched locally, mapped into "AppTask" models via "src/lib/mapScraperTask.ts", and merged dynamically with user completion state on the client.
- **Persistence:** User state (completed/todos) is saved purely in "localStorage". 

For deep dives, see [docs/data-pipeline.md](docs/data-pipeline.md).

## Deployment

The application compiles to a simple static site and can be hosted on any static hosting provider (e.g., GitHub Pages, Cloudflare Pages, Netlify).
*(Note: "vite.config.ts" contains a local proxy for "/api", but this is merely a placeholder—there is no backend needed or provided right now.)*

See [docs/deployment.md](docs/deployment.md) for more details.

## Known Limitations / Not Yet Implemented

- **No Remote Sync:** Progress is constrained to the specific browser you use ("localStorage"). There is no RuneLite auto-sync or cloud account sync yet.
- **Relic / Region Planning Helpers:** While tasks can be filtered by region, an interactive relic or region path planner is not built in.

## Contributing

We welcome improvements! See [docs/contributing.md](docs/contributing.md) for our guidelines on keeping the codebase clean and aligned with the wiki-first UI philosophy. To learn how to update the tracker for a new league dataset, refer to [docs/league-update-checklist.md](docs/league-update-checklist.md).
