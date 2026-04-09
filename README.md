# OSRS Leagues Task Tracker

A sleek, custom task tracker built specifically for Old School RuneScape Leagues, currently tuned for **League 5: Raging Echoes**.

We wanted a tracker that actually feels like the official OSRS Wiki—dense, familiar, and easy to read—but with all the quality-of-life features you need to plan your route, track your progress, and get things done without dealing with a clunky UI.

## What's Inside?

The app is fully functional and up-to-date with **Raging Echoes**. It runs entirely in your browser without needing an account, which means it's blazing fast, completely private, and easily deployable as a static site.

### Key Features

- **Wiki-first UI:** A familiar, dense presentation that mirrors the standard OSRS Wiki table layout. No flashy redesigns, just the data you need.
- **RuneLite Integration:** Easily import your progress straight from the **Tasks Tracker** RuneLite plugin by pasting your export JSON. Need to undo an accidental import? We've got a handy Revert button.
- **Responsive Design:** A fully featured desktop table view that seamlessly switches to a mobile-friendly card/sheet layout when you're playing on your phone.
- **Light & Dark Mode:** Built-in theme toggles that remember your preference and are carefully styled for readability.
- **Advanced Filtering & Sorting:** Narrow down your grind by Skill, Region, Tier (Difficulty), and Status (Completed/To-Do). Stack as many filters as you need.
- **Completion & To-Do Tracking:** Manually check off completed tasks or flag them as "To-Do" to build your perfect route. 
- **Auto-Saving:** Your progress, preferences, and lists are automatically saved locally in your browser. Close the tab, come back later, and pick up right where you left off.
- **Rich Task Descriptions:** We render actual OSRS Wiki icons and support parsed wikilinks directly inside task descriptions. 

*(Note: Screenshots are coming soon to showcase the UI!)*

## Tech Stack

We kept it simple, modern, and snappy:
- **React 18**
- **TypeScript**
- **Vite**
- **Tailwind CSS**

## Quick Start

Since this is an entirely client-side app, setting it up locally is a breeze. The current task dataset is statically bundled right into the "client/public/data" directory.

### Local Development

1. Navigate to the "client" directory:
   `ash
   cd client
   `
2. Install the dependencies:
   `ash
   npm install
   `
3. Start the dev server:
   `ash
   npm run dev
   `
   The app will spin up at http://localhost:5173.

### Build & Check

To build the project for production:
`ash
npm run build
`
To preview that production build locally:
`ash
npm run preview
`
To run the linter:
`ash
npm run lint
`

## Project Structure Overview

- "client/public/data/" - Static JSON task datasets (like "LEAGUE_5.full.json").
- "client/public/icons/" - Your favorite OSRS Wiki skill and area icons.
- "client/src/components/" - React components chopped up by feature area (e.g., "TaskTable", "TaskFilters", "ImportButton").
- "client/src/lib/" - League configurations and data mapping utilities.
- "client/src/state/" - Core hooks handling state (e.g., "useTaskStore.ts"), bridging straight into local storage.
- "client/src/utils/" - Shared logic for reading plugin exports, filtering, storage access, and rendering wiki content.

## How the Data Works

- **Bundled Dataset:** We use a raw JSON file containing the wiki tasks (currently "LEAGUE_5.full.json").
- **Pipeline:** We load the raw tasks, map them into our own "AppTask" models via "src/lib/mapScraperTask.ts", and dynamically merge them with your local completion state.
- **Persistence:** Everything is stored purely via "localStorage".

For deeper dives into our data strategy, check out [Docs: Data Pipeline](docs/data-pipeline.md).

## Deployment

Because the application compiles down to flat static files, it can be hosted essentially anywhere for free (GitHub Pages, Cloudflare Pages, Netlify, Vercel, you name it).

*(Note: While "vite.config.ts" might have a proxy configured for "/api", it's just a placeholder—we don't need or provide a backend out of the box right now.)*

See [Docs: Deployment](docs/deployment.md) for more details.

## Known Limitations & Future Plans

- **No Remote Sync:** Since progress lives in "localStorage", your phone and your desktop won't share state unless you manually copy your RuneLite export around. A cloud account sync might be a fun future addition.
- **Relic / Region Planning Helpers:** While you can filter tasks by region, we don't currently have a dedicated interactive relic pathing or region planner built-in.

## Contributing

We'd love your help! We're prioritizing an experience that stays true to the wiki, keeping things fast and clean. 

Check out [Docs: Contributing](docs/contributing.md) for guidelines on how to keep the codebase tidy and aligned with our philosophy. If you're looking to help out with updating the tracker when a new league drops, take a look at [Docs: League Update Checklist](docs/league-update-checklist.md).
